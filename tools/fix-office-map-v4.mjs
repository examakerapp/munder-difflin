#!/usr/bin/env node
/**
 * Comprehensive correction pass:
 *  1. The 3-row wall band (522/554/570) was wrong — 554 and 570 turned out
 *     to be pieces of a window-FRAME graphic (confirmed with a labelled
 *     pixel-grid crop of a5-office-floors-walls.png), not plain wall fill,
 *     which is what rendered as the "double wall / four pairs" striping.
 *     Reverted both rooms to a single-row wall (522 only — the one gid
 *     proven clean across every real screenshot of the original room).
 *  2. Windows are now embedded directly IN that one wall row (gid 611
 *     alone, the window's top half only — it's the only half that fits in
 *     a 1-tile wall) instead of floating separately on the floor.
 *  3. The dustbin gid (281) — misidentified as a doormat, placed at every
 *     door I built — removed from all of them.
 *  4. Conference Room: table + chairs + plant moved to the top (right under
 *     the wall), a partition wall with a door added below it, 3 desks
 *     moved up into the space between.
 *  5. Podcast Room: reduced 3 desks to 2, moved to the top; the table moved
 *     below them; the water dispenser + bin prop moved from the top-right
 *     corner to the left-middle of the room.
 *  6. The corridor's lone desk relocated flush against a side wall instead
 *     of floating in the middle of open floor.
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

// ── 3. remove the dustbin prop from every door I placed it at ──────────
for (const [x, y] of [[32, 15], [39, 21], [51, 21], [28, 49], [33, 75], [10, 79]]) set(aboveL, x, y, 0);

// ── clear a room's whole interior (everything except the outer walls) so
//    it can be rebuilt from a clean slate ──────────────────────────────
function clearInterior(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    set(belowL, x, y, 0); set(aboveL, x, y, 0); set(collL, x, y, 0);
    set(floorL, x, y, floorGidFor(x, y));
  }
}
function rebuildSingleRowWall(x0, x1) {
  for (let x = x0 + 1; x <= x1 - 1; x++) { set(wallsL, x, 0, 522); set(collL, x, 0, 1); }
  set(wallsL, x0, 0, 514); set(wallsL, x1, 0, 517); set(collL, x0, 0, 1); set(collL, x1, 0, 1);
}
function embedWindow(x0y0x1y1_x, y) { set(wallsL, y, 0, 611); } // unused placeholder, replaced below

const DESK_BELOW = [ [-1, -1, 2], [0, -1, 3], [1, -1, 4], [0, 0, 289], [0, 1, 305] ];
const DESK_ABOVE = [ [0, -2, 365], [1, -2, 366], [0, -1, 381], [1, -1, 382], [-1, 0, 18], [0, 0, 19], [1, 0, 20] ];
const DESK_COLLISION_BLOCKED = [ [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0] ];
function stampDesk(seatX, seatY) {
  for (const [dx, dy, gid] of DESK_BELOW) set(belowL, seatX + dx, seatY + dy, gid);
  for (const [dx, dy, gid] of DESK_ABOVE) set(aboveL, seatX + dx, seatY + dy, gid);
  for (const [dx, dy] of DESK_COLLISION_BLOCKED) set(collL, seatX + dx, seatY + dy, 1);
  set(collL, seatX, seatY, 0); set(collL, seatX, seatY + 1, 0);
}
function captureBlock(data, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = data[y * W + x]; if (v !== 0) cells.push([x - x0, y - y0, v]); }
  return cells;
}
function captureColl(data, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if ((data[y * W + x] & MASK) !== 0) cells.push([x - x0, y - y0]); }
  return cells;
}
// grab the table + the dispenser/bin BEFORE clearing anything
const TABLE_BELOW = captureBlock(belowL.data, 38, 6, 43, 13);
const TABLE_ABOVE = captureBlock(aboveL.data, 38, 6, 43, 13);
const TABLE_COLL = captureColl(collL.data, 38, 6, 43, 13);
function stampTable(ox, oy) {
  for (const [dx, dy, gid] of TABLE_BELOW) set(belowL, ox + dx, oy + dy, gid);
  for (const [dx, dy, gid] of TABLE_ABOVE) set(aboveL, ox + dx, oy + dy, gid);
  for (const [dx, dy] of TABLE_COLL) set(collL, ox + dx, oy + dy, 1);
}
const DISP_BELOW = captureBlock(belowL.data, 56, 3, 57, 5);
function stampDispenser(ox, oy) {
  for (const [dx, dy, gid] of DISP_BELOW) set(belowL, ox + dx, oy + dy, gid);
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) set(collL, ox + dx, oy + dy, 1);
}

const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
let nextId = map.nextobjectid ?? 1;
function addSeat(name, x, y) { spawnLayer.objects.push({ id: nextId++, name, type: '', x: x * 16, y: y * 16, width: 0, height: 0, rotation: 0, visible: true, point: true }); }

// ═══════════════════ Conference Room (x34-46) ═══════════════════════════
clearInterior(35, 1, 45, 20);
rebuildSingleRowWall(34, 46);
set(wallsL, 37, 0, 611); set(collL, 37, 0, 1);
set(wallsL, 41, 0, 611); set(collL, 41, 0, 1);
// table + chairs at the top, right under the wall
stampTable(38, 1);
set(belowL, 35, 9, 450); set(collL, 35, 9, 1); // plant, single tile, left of the table
// partition wall below the table, attached to the room's own right wall,
// with a small gap before it and a door back into the lower area
for (let x = 35; x <= 46; x++) { set(wallsL, x, 12, 579); set(collL, x, 12, 1); }
set(wallsL, 38, 12, 0); set(collL, 38, 12, 0); // door
set(floorL, 38, 12, floorGidFor(38, 12));
// 3 desks below the partition
const confSpawns = spawnLayer.objects.filter(o => ['pc-111', 'pc-112', 'pc-113'].includes(o.name));
spawnLayer.objects = spawnLayer.objects.filter(o => !['pc-111', 'pc-112', 'pc-113'].includes(o.name));
for (const x of [37, 40, 43]) stampDesk(x, 17);
addSeat('pc-111', 37, 17); addSeat('pc-112', 40, 17); addSeat('pc-113', 43, 17);

// ═══════════════════ Podcast Room (x47-58) ═══════════════════════════════
clearInterior(48, 1, 57, 20);
rebuildSingleRowWall(47, 58);
set(wallsL, 49, 0, 611); set(collL, 49, 0, 1);
set(wallsL, 53, 0, 611); set(collL, 53, 0, 1);
// 2 desks at the top (reduced from 3)
spawnLayer.objects = spawnLayer.objects.filter(o => !['pc-118', 'pc-119', 'pc-120'].includes(o.name));
for (const x of [50, 54]) stampDesk(x, 4);
addSeat('pc-118', 50, 4); addSeat('pc-119', 54, 4);
// table below them (shifted right of x49 so the dispenser has clear room)
stampTable(50, 9);
// water dispenser + bin — moved to the left-middle of the room
stampDispenser(48, 10);

// ═══════════════════ corridor: move the lone desk to a side wall ════════
const corridorSeat = spawnLayer.objects.find(o => o.name === 'pc-117');
// clear its old spot (8,24)
for (const [dx, dy, ] of DESK_BELOW) { set(belowL, 8 + dx, 24 + dy, 0); }
for (const [dx, dy] of DESK_ABOVE.map(([dx, dy]) => [dx, dy])) { set(aboveL, 8 + dx, 24 + dy, 0); }
for (const [dx, dy] of DESK_COLLISION_BLOCKED) set(collL, 8 + dx, 24 + dy, 0);
set(collL, 8, 24, 0); set(collL, 8, 25, 0);
for (let x = 6; x <= 10; x++) for (let y = 23; y <= 25; y++) { set(belowL, x, y, 0); set(aboveL, x, y, 0); set(collL, x, y, 0); set(floorL, x, y, floorGidFor(x, y)); }
stampDesk(2, 24); // flush against the corridor's left wall (x=0)
corridorSeat.x = 2 * 16; corridorSeat.y = 24 * 16;

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log('Fix pass v4 done.');
