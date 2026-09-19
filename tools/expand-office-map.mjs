#!/usr/bin/env node
/**
 * One-off generator: extends office.tmj downward with a new open wing so the
 * office can hold ~100 seats instead of 24, and widens the south doorway so
 * it reads as a real hallway into the new wing instead of a 1-tile gap.
 *
 * Every tile placed below is copied verbatim from a tile pattern that's
 * already proven correct elsewhere in this exact map (floor checkerboard,
 * side/south wall gids, and — most importantly — the desk "stamp": the
 * monitor/desk/chair gids and their exact (dx,dy) offsets from a seat's
 * spawn point, read directly off the existing pc-1 desk). Reusing those
 * verbatim, rather than inventing new tile IDs from the tileset PNGs by eye,
 * is what makes this safe to run against a real map with no visual preview:
 * DeskScreen.ts finds a seat's monitor generically (it checks
 * `furniture-above` at (seatX, seatY-2) for theme.monitor.offTopLeftGid), so
 * any new seat painted with the same stamp gets a working lit-up monitor for
 * free, no code changes needed.
 *
 * Run: node tools/expand-office-map.mjs
 * Then: append the printed seat-name list to OFFICE_THEME.primarySeatNames
 * in src/renderer/src/scene/office/themeRegistry.ts (done by hand, on
 * purpose — that file is hand-curated, this script only touches the map).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');

const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const W = map.width;
const oldH = map.height;

// ─── how many new rows, how many desks ────────────────────────────────────
const NEW_ROWS = 52;
const newH = oldH + NEW_ROWS;
const TOTAL_NEW_SEATS = 76; // 24 existing + 76 = 100

function layer(name) {
  const l = map.layers.find((x) => x.type === 'tilelayer' && x.name === name);
  if (!l) throw new Error(`layer not found: ${name}`);
  return l;
}
const floorL = layer('floor');
const wallsL = layer('walls');
const belowL = layer('furniture-below');
const aboveL = layer('furniture-above');
const collL = layer('collision');

// Grow every tile layer's flat data array in place: same width, more rows,
// new cells default to 0 (empty) until filled in below.
for (const l of [floorL, wallsL, belowL, aboveL, collL]) {
  l.height = newH;
  const extra = new Array(W * NEW_ROWS).fill(0);
  l.data = l.data.concat(extra);
}
map.height = newH;

function set(l, x, y, v) { l.data[y * W + x] = v; }
function get(l, x, y) { return l.data[y * W + x]; }

// ─── widen the existing south doorway (row oldH-1) from 1 tile to 5 ───────
// Copies whatever's already open at x=16 across x=14..18 on the row above
// the wall, and removes the wall segment at the same columns.
for (let x = 14; x <= 18; x++) {
  set(wallsL, x, oldH - 1, 0);
  set(collL, x, oldH - 1, 0);
}

// ─── floor: the existing 2×2 checkerboard, continued ──────────────────────
function floorGidFor(x, y) {
  return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784);
}
for (let y = oldH; y < newH; y++) {
  for (let x = 1; x <= W - 2; x++) set(floorL, x, y, floorGidFor(x, y));
}

// ─── side walls (reusing the exact gids/collision the original room uses
//     for its own left/right walls) + a closed south wall on the last row ──
const LEFT_WALL_GID = 530;
const RIGHT_WALL_GID = 533;
for (let y = oldH; y < newH; y++) {
  set(wallsL, 0, y, LEFT_WALL_GID); set(collL, 0, y, 1);
  set(wallsL, W - 1, y, RIGHT_WALL_GID); set(collL, W - 1, y, 1);
}
const southY = newH - 1;
for (let x = 0; x < W; x++) {
  set(wallsL, x, southY, x === 0 ? 578 : x === W - 1 ? 581 : 579);
  set(collL, x, southY, 1);
  // the south wall occupies the last row entirely — it isn't floor
  set(floorL, x, southY, 0);
}

// ─── the proven desk stamp, read off pc-1 (seat at x=2,y=13 in the
//     original map) ─────────────────────────────────────────────────────
const DESK_BELOW = [ [-1, -1, 2], [0, -1, 3], [1, -1, 4], [0, 0, 289], [0, 1, 305] ];
const DESK_ABOVE = [ [0, -2, 365], [1, -2, 366], [0, -1, 381], [1, -1, 382], [-1, 0, 18], [0, 0, 19], [1, 0, 20] ];
const DESK_COLLISION_BLOCKED = [ [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0] ];

function stampDesk(seatX, seatY) {
  for (const [dx, dy, gid] of DESK_BELOW) set(belowL, seatX + dx, seatY + dy, gid);
  for (const [dx, dy, gid] of DESK_ABOVE) set(aboveL, seatX + dx, seatY + dy, gid);
  for (const [dx, dy] of DESK_COLLISION_BLOCKED) set(collL, seatX + dx, seatY + dy, 1);
  set(collL, seatX, seatY, 0);       // the seat tile itself is walkable
  set(collL, seatX, seatY + 1, 0);   // approach tile behind the chair
}

const COLS = [2, 6, 10, 14, 18, 22, 26, 30]; // matches the original room's 4-tile desk spacing
const ROW_STEP = 5; // monitor(-2) .. desk(-1) .. seat(0) .. approach(+1) .. aisle(+1 gap) = 5 rows/band
const firstSeatY = oldH + 3; // 3-row margin below the new wing's top edge

const newSeatNames = [];
let placed = 0;
outer:
for (let row = 0; row < 20 && placed < TOTAL_NEW_SEATS; row++) {
  const seatY = firstSeatY + row * ROW_STEP;
  if (seatY + 1 >= southY) break; // stop before the wing runs into its own south wall
  for (const seatX of COLS) {
    if (placed >= TOTAL_NEW_SEATS) break outer;
    stampDesk(seatX, seatY);
    const name = `pc-${7 + placed}`; // continues the existing pc-1..pc-6 sequence
    newSeatNames.push({ name, x: seatX, y: seatY });
    placed++;
  }
}

// ─── spawn-points: append the new named seats as point objects ───────────
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
let nextId = Math.max(...map.layers.flatMap((l) => (l.objects ?? []).map((o) => o.id)), ...(map.nextobjectid ? [map.nextobjectid] : [])) + 1;
for (const s of newSeatNames) {
  spawnLayer.objects.push({
    id: nextId++,
    name: s.name,
    type: '',
    x: s.x * map.tilewidth,
    y: s.y * map.tileheight,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
    point: true,
  });
}
map.nextobjectid = nextId;

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');

console.log(`Map extended: ${W}x${oldH} -> ${W}x${newH} (+${NEW_ROWS} rows)`);
console.log(`Placed ${placed} new desks (total capacity now ${24 + placed}).`);
console.log('\nAppend these to OFFICE_THEME.primarySeatNames in themeRegistry.ts, in this order:\n');
console.log(newSeatNames.map((s) => `    '${s.name}',`).join('\n'));
