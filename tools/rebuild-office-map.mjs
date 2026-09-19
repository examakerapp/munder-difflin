#!/usr/bin/env node
/**
 * Clean rebuild, replacing the four incremental v1-v4 passes (which had
 * drifted into real bugs: a table captured with mismatched layer origins,
 * furniture overflowing into walls, leftover desk fragments never cleared).
 * Built in ONE pass against the clean committed office.tmj so nothing needs
 * a later patch. Implements office-floor-plan-redesign.html's structure,
 * adapted to the real 16px tile grid: the original room (reception/boss)
 * is untouched; everything east and south of it is new.
 *
 * Every reused asset — the desk, the oval conference table + both chair
 * rows, the café furniture cluster (fridge/shelf/sink/counter/vending
 * machine) — is captured as an exact (dx,dy,gid) list off the ORIGINAL
 * room with a single shared origin per asset (the bug in the old table
 * script was capturing furniture-below and furniture-above with two
 * DIFFERENT origins, which silently misaligned them by 2 rows on replay).
 * Decorative-only tiles (plants, a clock, pictures, windows, cabinets,
 * couches, a rug) come from a labelled 5x-scale grid render of
 * office-tileset.png inspected tile-by-tile beforehand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));

const oldW = map.width, oldH = map.height; // 34 x 22 — the untouched original room

function layer(name) { return map.layers.find((x) => x.type === 'tilelayer' && x.name === name); }
const floorL = layer('floor'), wallsL = layer('walls'), belowL = layer('furniture-below'),
      aboveL = layer('furniture-above'), collL = layer('collision');
const MASK = 0x1FFFFFFF;

// ── capture assets off the untouched original room, BEFORE any resize ───
function captureBlock(data, W, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = data[y * W + x];
    if (v !== 0) cells.push([x - x0, y - y0, v]);
  }
  return cells;
}
function captureColl(data, W, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((data[y * W + x] & MASK) !== 0) cells.push([x - x0, y - y0]);
  }
  return cells;
}
// oval conference table + both chair rows — ONE shared origin (10,1) for
// both layers this time, which is the actual fix for the old alignment bug
const TABLE_BELOW = captureBlock(belowL.data, oldW, 10, 1, 15, 6);
const TABLE_ABOVE = captureBlock(aboveL.data, oldW, 10, 1, 15, 6);
const TABLE_COLL = captureColl(collL.data, oldW, 10, 1, 15, 6);
// café furniture cluster — fridge / shelf / sink counter / cabinet / vending machine
const CAFE_BELOW = captureBlock(belowL.data, oldW, 26, 17, 32, 21);
const CAFE_ABOVE = captureBlock(aboveL.data, oldW, 26, 17, 32, 21);
const CAFE_COLL = captureColl(collL.data, oldW, 26, 17, 32, 21);

// ── now grow the map: +25 cols east (to x=58), +58 rows south (to y=79) ──
const NEW_W = oldW + 25; // 59
const NEW_H = oldH + 58; // 80
function widen(l) {
  const rows = [];
  for (let y = 0; y < oldH; y++) {
    const row = l.data.slice(y * oldW, y * oldW + oldW);
    for (let x = oldW; x < NEW_W; x++) row.push(0);
    rows.push(row);
  }
  l.data = rows.flat();
  l.height = oldH;
}
for (const l of [floorL, wallsL, belowL, aboveL, collL]) widen(l);
for (const l of [floorL, wallsL, belowL, aboveL, collL]) {
  l.data = l.data.concat(new Array(NEW_W * (NEW_H - oldH)).fill(0));
  l.height = NEW_H;
}
map.width = NEW_W; map.height = NEW_H;
const W = NEW_W, H = NEW_H;

function set(l, x, y, v) { l.data[y * W + x] = v; }
function floorGidFor(x, y) { return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784); }
const T = (row, col) => row * 16 + col + 1; // office-tileset gid, firstgid=1, 16 cols

function fillFloor(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(floorL, x, y, floorGidFor(x, y)); }
function wallRect(x0, y0, x1, y1) {
  for (let x = x0; x <= x1; x++) { set(wallsL, x, y0, 522); set(collL, x, y0, 1); set(wallsL, x, y1, 579); set(collL, x, y1, 1); }
  for (let y = y0; y <= y1; y++) { set(wallsL, x0, y, 530); set(collL, x0, y, 1); set(wallsL, x1, y, 533); set(collL, x1, y, 1); }
  set(wallsL, x0, y0, 514); set(wallsL, x1, y0, 517); set(wallsL, x0, y1, 578); set(wallsL, x1, y1, 581);
}
function doorGapH(x0, x1, y) { for (let x = x0; x <= x1; x++) { set(wallsL, x, y, 0); set(collL, x, y, 0); set(floorL, x, y, floorGidFor(x, y)); } set(aboveL, x0, y, 281); }
function doorGapV(x, y0, y1) { for (let y = y0; y <= y1; y++) { set(wallsL, x, y, 0); set(collL, x, y, 0); set(floorL, x, y, floorGidFor(x, y)); } }

function stampTable(originX, originY) {
  for (const [dx, dy, gid] of TABLE_BELOW) set(belowL, originX + dx, originY + dy, gid);
  for (const [dx, dy, gid] of TABLE_ABOVE) set(aboveL, originX + dx, originY + dy, gid);
  for (const [dx, dy] of TABLE_COLL) set(collL, originX + dx, originY + dy, 1);
}
function stampCafe(originX, originY) {
  for (const [dx, dy, gid] of CAFE_BELOW) set(belowL, originX + dx, originY + dy, gid);
  for (const [dx, dy, gid] of CAFE_ABOVE) set(aboveL, originX + dx, originY + dy, gid);
  for (const [dx, dy] of CAFE_COLL) set(collL, originX + dx, originY + dy, 1);
}
const DESK_BELOW = [ [-1, -1, 2], [0, -1, 3], [1, -1, 4], [0, 0, 289], [0, 1, 305] ];
const DESK_ABOVE = [ [0, -2, 365], [1, -2, 366], [0, -1, 381], [1, -1, 382], [-1, 0, 18], [0, 0, 19], [1, 0, 20] ];
const DESK_COLLISION_BLOCKED = [ [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0] ];
function stampDesk(seatX, seatY) {
  for (const [dx, dy, gid] of DESK_BELOW) set(belowL, seatX + dx, seatY + dy, gid);
  for (const [dx, dy, gid] of DESK_ABOVE) set(aboveL, seatX + dx, seatY + dy, gid);
  for (const [dx, dy] of DESK_COLLISION_BLOCKED) set(collL, seatX + dx, seatY + dy, 1);
  set(collL, seatX, seatY, 0);
  set(collL, seatX, seatY + 1, 0);
}
const PLANT_SMALL = { top: T(28, 1), base: T(29, 1) };
const PLANT_TALL = { top: T(28, 5), base: T(29, 5) };
function stampPlant(x, y, kind) { set(aboveL, x, y - 1, kind.top); set(belowL, x, y, kind.base); set(collL, x, y, 1); }
const CABINET_TOP = [T(18, 2), T(18, 3)], CABINET_BOTTOM = [T(19, 2), T(19, 3)];
function stampCabinet(x, y) {
  set(belowL, x, y - 1, CABINET_TOP[0]); set(belowL, x + 1, y - 1, CABINET_TOP[1]);
  set(belowL, x, y, CABINET_BOTTOM[0]); set(belowL, x + 1, y, CABINET_BOTTOM[1]);
  for (const [dx, dy] of [[0, -1], [1, -1], [0, 0], [1, 0]]) set(collL, x + dx, y + dy, 1);
}
const COUCH = [T(16, 0), T(16, 1), T(16, 2), T(16, 3)];
function stampCouch(x, y, gid) { set(belowL, x, y, gid); set(collL, x, y, 1); }
const RUG = T(30, 1);
const CLOCK = T(22, 2);
const PICTURE = { top: T(24, 1), base: T(25, 1) };
function stampWallPic(x, y) { set(aboveL, x, y - 1, PICTURE.top); set(aboveL, x, y, PICTURE.base); }
function stampWindow(x, y) { set(wallsL, x, y, 611); set(wallsL, x + 1, y, 611); set(wallsL, x, y + 1, 643); set(wallsL, x + 1, y + 1, 643); }

const newSeats = [];
let seatN = 7; // continues the original pc-1..pc-6

// ═══════════════════ Conference Room (x34-46, y0-21) ═══════════════════
wallRect(34, 0, 46, 21);
stampWindow(38, 0);
fillFloor(35, 1, 45, 20);
stampTable(38, 8);
stampPlant(35, 19, PLANT_TALL);
stampPlant(45, 19, PLANT_TALL);
stampWallPic(41, 2);
doorGapH(39, 40, 21);

// ═══════════════════ Podcast Room (x47-58, y0-21) ══════════════════════
wallRect(47, 0, 58, 21);
fillFloor(48, 1, 57, 20);
stampTable(49, 8);
stampPlant(48, 19, PLANT_SMALL);
set(aboveL, 55, 1, CLOCK);
doorGapH(51, 52, 21);

// ═══════════════════ Corridor (y22-26, full width) ═════════════════════
fillFloor(1, 22, 57, 26);
for (let y = 22; y <= 26; y++) { set(wallsL, 0, y, 530); set(collL, 0, y, 1); set(wallsL, 58, y, 533); set(collL, 58, y, 1); }
stampCouch(6, 24, COUCH[0]);
stampCouch(50, 24, COUCH[1]);

// ═══════════════════ Main floor (y27-79, full width) ═══════════════════
wallRect(0, 27, 58, 79);
// re-open the shared seam between the corridor (y22-26) and the main floor
// (y27-79): clear the wallRect's own north edge across the interior width,
// so the two bands are one continuous walkable space, not two rooms
for (let x = 1; x <= 57; x++) { set(wallsL, x, 27, 0); set(collL, x, 27, 0); }
fillFloor(1, 27, 57, 79);

// west desk block — 7 columns x 8 rows
const westCols = [2, 6, 10, 14, 18, 22, 26];
const eastCols = [33, 37, 41, 45, 49, 53];
const deskRows = [31, 36, 41, 46, 51, 56, 61, 66];
for (const y of deskRows) {
  for (const x of westCols) { stampDesk(x, y); newSeats.push({ name: `pc-${seatN++}`, x, y }); }
  for (const x of eastCols) { stampDesk(x, y); newSeats.push({ name: `pc-${seatN++}`, x, y }); }
}
// center walkway (x28-30) with a plant every other row, and side-aisle plants
for (let i = 0; i < deskRows.length; i++) {
  const y = deskRows[i] + 1;
  if (i % 2 === 1) stampPlant(29, y, i % 4 === 1 ? PLANT_SMALL : PLANT_TALL);
}
stampCabinet(1, deskRows[2] + 1);
stampCabinet(1, deskRows[5] + 1);
stampCabinet(56, deskRows[2] + 1);
stampCabinet(56, deskRows[5] + 1);

// café corner (bottom-left) — the real cafeteria cluster, reused once, plus one small table
stampWallPic(10, 71);
stampCafe(4, 72);
stampTable(14, 73);
stampPlant(1, 78, PLANT_SMALL);

// chill-out lounge (bottom-right) — couches + rug + plants
stampCouch(38, 73, COUCH[0]); stampCouch(40, 73, COUCH[1]);
stampCouch(38, 76, COUCH[2]); stampCouch(40, 76, COUCH[3]);
set(floorL, 39, 74, RUG); set(floorL, 39, 75, RUG);
stampCouch(48, 73, COUCH[0]); stampCouch(50, 73, COUCH[1]);
stampCouch(48, 76, COUCH[2]); stampCouch(50, 76, COUCH[3]);
set(floorL, 49, 74, RUG); set(floorL, 49, 75, RUG);
stampPlant(57, 78, PLANT_TALL);

// fire exit — a second PHYSICAL door only (no spawn point / no agent traffic
// logic uses it); south wall, off the café corner, per the floor plan
doorGapH(10, 11, 79);

// ═══════════════════ spawn points ═══════════════════
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
let nextId = map.nextobjectid ?? 1;
for (const s of newSeats) {
  spawnLayer.objects.push({ id: nextId++, name: s.name, type: '', x: s.x * map.tilewidth, y: s.y * map.tileheight, width: 0, height: 0, rotation: 0, visible: true, point: true });
}
map.nextobjectid = nextId;

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log(`Rebuilt: ${oldW}x${oldH} -> ${W}x${H}. New seats: ${newSeats.length} (pc-7..pc-${seatN - 1}).`);
console.log(newSeats.map((s) => `'${s.name}'`).join(', '));
