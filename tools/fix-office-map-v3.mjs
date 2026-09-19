#!/usr/bin/env node
/**
 * Rebuilds the Conference Room and Podcast Room's north wall to match the
 * original room's actual structure, which turned out to be 3 tiles thick
 * (row0 gid522, row1 gid554, row2 gid570 — three DIFFERENT fill gids, not
 * one row repeated), with windows sitting in the first 2 rows of INTERIOR
 * floor just past the wall (not embedded in the wall tiles themselves,
 * which is what broke last time). Also adds the water-dispenser prop,
 * captured verbatim from its corner in the original room.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const W = map.width;
const MASK = 0x1FFFFFFF;

function layer(name) { return map.layers.find((x) => x.type === 'tilelayer' && x.name === name); }
const floorL = layer('floor'), wallsL = layer('walls'), belowL = layer('furniture-below'),
      aboveL = layer('furniture-above'), collL = layer('collision');
function set(l, x, y, v) { l.data[y * W + x] = v; }
function floorGidFor(x, y) { return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784); }

// ── capture the water dispenser off the original room (x31-32, y1-3) ────
function captureBlock(data, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = data[y * W + x]; if (v !== 0) cells.push([x - x0, y - y0, v]); }
  return cells;
}
const DISPENSER_BELOW = captureBlock(belowL.data, 31, 1, 32, 3);
function stampDispenser(originX, originY) {
  for (const [dx, dy, gid] of DISPENSER_BELOW) set(belowL, originX + dx, originY + dy, gid);
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) set(collL, originX + dx, originY + dy, 1);
}

function buildTopWallBand(x0, x1) {
  // row0/1/2: the three real wall-fill gids, plain corners at the true
  // outer edges (x0/x1), continuing side-wall gids (530/533) down each side
  for (let x = x0 + 1; x <= x1 - 1; x++) { set(wallsL, x, 0, 522); set(wallsL, x, 1, 554); set(wallsL, x, 2, 570); }
  set(wallsL, x0, 0, 514); set(wallsL, x1, 0, 517);
  for (const y of [1, 2]) { set(wallsL, x0, y, 530); set(wallsL, x1, y, 533); }
  for (let x = x0; x <= x1; x++) for (const y of [0, 1, 2]) set(collL, x, y, 1);
  // interior floor starts at y=3 now, not y=1 — reclaim what's already floor
  for (let x = x0 + 1; x <= x1 - 1; x++) set(floorL, x, 3, floorGidFor(x, 3));
}
function stampWindow(x, y) { set(wallsL, x, y, 611); set(wallsL, x + 1, y, 611); set(wallsL, x, y + 1, 643); set(wallsL, x + 1, y + 1, 643); }

// ── Conference Room (x34-46) ─────────────────────────────────────────────
// clear the still-broken window remnant from the last pass first (its
// bottom half, in the walls layer at y=1, was never cleared)
for (const x of [38, 39]) { set(wallsL, x, 1, 0); set(collL, x, 1, 0); set(floorL, x, 1, floorGidFor(x, 1)); }
// remove the picture that used to hang at (41,1)/(41,2) — that space is wall now
set(aboveL, 41, 1, 0); set(aboveL, 41, 2, 0);
buildTopWallBand(34, 46);
stampWindow(37, 3);
stampWindow(42, 3);
stampDispenser(44, 3);

// ── Podcast Room (x47-58) ────────────────────────────────────────────────
set(aboveL, 54, 1, 0); // the clock that used to sit at (54,1) — that space is wall now
buildTopWallBand(47, 58);
stampWindow(49, 3);
stampWindow(53, 3);
stampDispenser(56, 3);

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log('Rebuilt the 3-row wall band + windows + water dispenser for both rooms, matching the original room.');
