#!/usr/bin/env node
/**
 * Build the desktop app icon set from one hand-made source PNG.
 *
 *   node tools/make-app-icon.mjs [source.png]
 *
 * Writes, from that one file:
 *   build/icon.ico    Windows  — 16/24/32/48/64/128/256, PNG-compressed entries
 *   build/icon.icns   macOS    — 16..1024 incl. the @2x block types
 *   build/icon.png    Linux    — 1024, and electron-builder's base raster
 *
 * These three are what electron-builder.yml points at (win.icon / mac.icon /
 * linux.icon). tools/make-logo.cjs used to generate them from the sprite in
 * portraitArt.ts; it no longer does unless asked with --with-app-icon, because
 * the shipping icon is now this hand-made artwork. make-logo.cjs still owns
 * every docs/ raster — that mark IS the sprite.
 *
 * Deliberately dependency-free and pure Node, so it runs the same on Windows,
 * macOS and Linux. The predecessor needed macOS-only `iconutil` for the .icns,
 * which meant the icon could not be rebuilt on the machine this project is
 * actually developed on. Both container formats take PNG payloads verbatim
 * (ICO since Windows Vista; the ICNS ic##/icp# types are PNG by definition),
 * so the images are encoded exactly once and never resampled twice.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'build', 'icon-source.png');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ── PNG decode ───────────────────────────────────────────────────────────
/** @returns {{ w: number, h: number, rgba: Buffer }} 8-bit straight-alpha RGBA */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let p = 8, ihdr = null, idat = [], plte = null, trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('ascii');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: data.readUInt32BE(0), h: data.readUInt32BE(4),
        depth: data[8], color: data[9], interlace: data[12]
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    p += 12 + len;                                   // len + type + data + crc
  }
  if (!ihdr) throw new Error('no IHDR');
  const { w, h, depth, color, interlace } = ihdr;
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth} (need 8)`);
  if (interlace) throw new Error('interlaced PNG is not supported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels) throw new Error(`unsupported colour type ${color}`);
  const bpp = channels;                              // bytes per pixel at depth 8
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * h) throw new Error('truncated image data');

  // Undo the per-scanline filters (PNG spec 9.2).
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad filter ${filter} on row ${y}`);
      cur[i] = v & 0xff;
    }
  }

  // Normalise everything to straight-alpha RGBA.
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    let r, g, b, a = 255;
    if (color === 6) { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    else if (color === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (color === 0) { r = g = b = out[i]; }
    else if (color === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else { // palette
      const idx = out[i];
      r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

// ── PNG encode ───────────────────────────────────────────────────────────
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 4, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
  return Buffer.concat([head, data, crcBuf]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  // Filter 0 (None) on every row. Sub/Paeth would shave a few KB, but an icon
  // is read once at install time and this keeps the encoder trivially correct.
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;        // bit depth
  ihdr[9] = 6;        // colour type: truecolour + alpha
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── resampling ───────────────────────────────────────────────────────────
/**
 * Area-average ("box") resample, done on PREMULTIPLIED alpha.
 *
 * Averaging straight RGBA is the classic icon bug: a fully transparent pixel
 * still carries some arbitrary RGB, and letting that into the mean drags a
 * dark halo around every rounded corner. Premultiplying weights each pixel's
 * colour by its own coverage, which is the only way the edges come out clean.
 */
function resample(src, sw, sh, dw, dh) {
  if (dw === sw && dh === sh) return Buffer.from(src);
  const dst = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr), y1 = Math.max(y0 + 1, Math.ceil((dy + 1) * yr));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr), x1 = Math.max(x0 + 1, Math.ceil((dx + 1) * xr));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < Math.min(y1, sh); y++) {
        for (let x = x0; x < Math.min(x1, sw); x++) {
          const o = (y * sw + x) * 4, al = src[o + 3];
          r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
          n++;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (a === 0) { dst[o] = dst[o + 1] = dst[o + 2] = dst[o + 3] = 0; continue; }
      dst[o] = Math.round(r / a);            // un-premultiply
      dst[o + 1] = Math.round(g / a);
      dst[o + 2] = Math.round(b / a);
      dst[o + 3] = Math.round(a / n);
    }
  }
  return dst;
}

/** Integer nearest-neighbour upscale — exact, so no detail is invented. */
function upscaleNearest(src, sw, sh, factor) {
  const dw = sw * factor, dh = sh * factor;
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const s = (Math.floor(y / factor) * sw + Math.floor(x / factor)) * 4;
      src.copy(dst, (y * dw + x) * 4, s, s + 4);
    }
  }
  return dst;
}

// ── containers ───────────────────────────────────────────────────────────
function buildIco(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = head.length + dir.length;
  entries.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);       // 0 encodes 256
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);                     // colour planes
    dir.writeUInt16LE(32, o + 6);                    // bits per pixel
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, dir, ...entries.map((e) => e.data)]);
}

function buildIcns(blocks) {
  const body = Buffer.concat(blocks.map(({ type, data }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 4, 'ascii');
    h.writeUInt32BE(data.length + 8, 4);             // length includes the header
    return Buffer.concat([h, data]);
  }));
  const h = Buffer.alloc(8);
  h.write('icns', 0, 4, 'ascii');
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

// ── run ──────────────────────────────────────────────────────────────────
const source = decodePng(readFileSync(SRC));
if (source.w !== source.h) throw new Error(`source must be square, got ${source.w}x${source.h}`);
if (source.w < 512) throw new Error(`source must be at least 512px, got ${source.w}`);

const cache = new Map();
const at = (size) => {
  if (!cache.has(size)) {
    const rgba = size > source.w
      ? (size % source.w === 0
        ? upscaleNearest(source.rgba, source.w, source.h, size / source.w)
        : (() => { throw new Error(`refusing to upscale ${source.w} -> ${size}: not an integer factor`); })())
      : resample(source.rgba, source.w, source.h, size, size);
    cache.set(size, encodePng(size, size, rgba));
  }
  return cache.get(size);
};

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_BLOCKS = [
  ['icp4', 16], ['icp5', 32], ['icp6', 64],
  ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32],   // 16@2x
  ['ic12', 64],   // 32@2x
  ['ic13', 256],  // 128@2x
  ['ic14', 512]   // 256@2x
];

const ico = buildIco(ICO_SIZES.map((size) => ({ size, data: at(size) })));
const icns = buildIcns(ICNS_BLOCKS.map(([type, size]) => ({ type, data: at(size) })));
const png1024 = at(1024);

writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico);
writeFileSync(path.join(ROOT, 'build', 'icon.icns'), icns);
writeFileSync(path.join(ROOT, 'build', 'icon.png'), png1024);

// Read the containers straight back and prove every payload is a PNG of the
// size its directory entry claims. A malformed icon is invisible until a
// packaged build shows a blank tile, so it is worth the microsecond.
const verifyIco = (buf) => {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('ICO: bad header');
  const n = buf.readUInt16LE(4);
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    const want = buf.readUInt8(o) || 256;
    const len = buf.readUInt32LE(o + 8), off = buf.readUInt32LE(o + 12);
    if (off + len > buf.length) throw new Error(`ICO: entry ${i} runs past EOF`);
    const d = buf.subarray(off, off + len);
    if (!d.subarray(0, 8).equals(PNG_SIG)) throw new Error(`ICO: entry ${i} is not a PNG`);
    if (d.readUInt32BE(16) !== want || d.readUInt32BE(20) !== want) {
      throw new Error(`ICO: entry ${i} claims ${want}px, payload is ${d.readUInt32BE(16)}px`);
    }
  }
  return n;
};
const verifyIcns = (buf) => {
  if (buf.subarray(0, 4).toString('ascii') !== 'icns') throw new Error('ICNS: bad magic');
  if (buf.readUInt32BE(4) !== buf.length) throw new Error('ICNS: length field disagrees with file size');
  let p = 8, n = 0;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p + 4);
    if (len < 8 || p + len > buf.length) throw new Error('ICNS: bad block length');
    if (!buf.subarray(p + 8, p + 16).equals(PNG_SIG)) throw new Error('ICNS: block payload is not a PNG');
    p += len; n++;
  }
  return n;
};

console.log(`source     ${path.relative(ROOT, SRC)} ${source.w}x${source.h}`);
console.log(`icon.ico   ${(ico.length / 1024).toFixed(1)} KB, ${verifyIco(ico)} entries (${ICO_SIZES.join('/')})`);
console.log(`icon.icns  ${(icns.length / 1024).toFixed(1)} KB, ${verifyIcns(icns)} blocks`);
console.log(`icon.png   ${(png1024.length / 1024).toFixed(1)} KB, 1024x1024`);
