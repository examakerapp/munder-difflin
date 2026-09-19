#!/usr/bin/env node
/**
 * Targeted correction pass on top of the clean rebuild. Fixes, in order:
 *  1. Plant glitch — PLANT_TALL was stacking TWO DIFFERENT, separately
 *     complete single-tile plants on top of each other (confirmed by a
 *     direct 10x pixel-crop of the source PNG); every plant is now one
 *     single, self-contained tile, no stacking.
 *  2. "Windows on random floor" — the 2-row window graphic was stamped on a
 *     1-row-thick perimeter wall; its bottom half had nowhere to go but the
 *     room's own floor. Removed from both new rooms' north walls; replaced
 *     with a wall-mounted picture frame instead (which only needs the
 *     interior side, no second wall row).
 *  3. Conference Room — table moved up, 3 desks added below it.
 *  4. Podcast Room — table moved, an internal wall (matching the original
 *     room's own partition style) added against the room's own east wall,
 *     with 3 desks above it.
 *  5. Café corner / chill-out lounge — now two separate walled rooms with a
 *     shared dividing wall + door, instead of one open tinted zone.
 *  6. The "four corner chairs" lounge clusters — replaced with a straight
 *     row of the same chair tile (reads as an actual couch/seating row
 *     instead of four disconnected chairs in a square).
 *  7. Corridor — the chair-square swapped for a plain desk (no chair) near
 *     the top, plants elsewhere along it.
 *  8. A wall (with a door) added across the main floor after the 4th desk
 *     row, separating rows 1-4 from rows 5-8.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const W = map.width, H = map.height;
const MASK = 0x1FFFFFFF;

function layer(name) { return map.layers.find((x) => x.type === 'tilelayer' && x.name === name); }
const floorL = layer('floor'), wallsL = layer('walls'), belowL = layer('furniture-below'),
      aboveL = layer('furniture-above'), collL = layer('collision');
function set(l, x, y, v) { l.data[y * W + x] = v; }
function get(l, x, y) { return l.data[y * W + x]; }
function floorGidFor(x, y) { return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784); }
const T = (row, col) => row * 16 + col + 1;

// ── 1. fixed plant: ONE tile, no stacking ───────────────────────────────
const PLANT_A = T(28, 1); // small plant, round brown pot — confirmed complete in one tile
const PLANT_B = T(28, 2); // small plant, square pale pot — confirmed complete in one tile
function stampPlant1(x, y, gid) { set(belowL, x, y, gid); set(collL, x, y, 1); }

// clear the old (buggy, stacked) plants and replant with single tiles
const oldPlantSpots = [[29, 37], [29, 47], [29, 57], [29, 67]];
for (let i = 0; i < oldPlantSpots.length; i++) {
  const [x, y] = oldPlantSpots[i];
  set(aboveL, x, y - 1, 0);
  stampPlant1(x, y, i % 2 === 0 ? PLANT_A : PLANT_B);
}

// ── 2. remove the broken window-on-thin-wall stamps, add a picture instead ─
// Conference Room window was at (38,0)/(39,0)+(38,1)/(39,1); Podcast Room
// never got one. Restore the wall row to plain fill and drop the spillover.
for (const x of [38, 39]) { set(wallsL, x, 0, 522); set(collL, x, 0, 1); }
for (const x of [38, 39]) { set(floorL, x, 1, floorGidFor(x, 1)); set(collL, x, 1, get(collL, x, 1) & 0); }
const PICTURE = { top: T(24, 1), base: T(25, 1) };
function stampWallPic(x, y) { set(aboveL, x, y - 1, PICTURE.top); set(aboveL, x, y, PICTURE.base); }
// (the Conference Room already has a picture at (41,2) from the rebuild — leave it)

// ── shared desk stamp ────────────────────────────────────────────────────
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

// ── the oval table, re-captured with one shared origin (unchanged since
//    the rebuild fixed the alignment bug) ───────────────────────────────
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
// grab the table as it currently stands in the Conference Room (already
// correct there) before this script starts moving things around — ONE
// shared origin (38,6) for below/above/collision, the exact fix that made
// the rebuild's table render correctly in the first place; reusing two
// different y0 values here would silently reintroduce that same bug
const TABLE_BELOW = captureBlock(belowL.data, 38, 6, 43, 13);
const TABLE_ABOVE = captureBlock(aboveL.data, 38, 6, 43, 13);
const TABLE_COLL = captureColl(collL.data, 38, 6, 43, 13);
function clearTable(originX, originY) {
  for (let dy = -2; dy <= 5; dy++) for (let dx = -1; dx <= 6; dx++) {
    set(belowL, originX + dx, originY + dy, 0); set(aboveL, originX + dx, originY + dy, 0); set(collL, originX + dx, originY + dy, 0);
    set(floorL, originX + dx, originY + dy, floorGidFor(originX + dx, originY + dy));
  }
}
function stampTable(originX, originY) {
  for (const [dx, dy, gid] of TABLE_BELOW) set(belowL, originX + dx, originY + dy, gid);
  for (const [dx, dy, gid] of TABLE_ABOVE) set(aboveL, originX + dx, originY + dy, gid);
  for (const [dx, dy] of TABLE_COLL) set(collL, originX + dx, originY + dy, 1);
}

const newSeats = [];
let seatN = 111; // continues pc-7..pc-110

// ── 3. Conference Room: table up, 3 desks below ─────────────────────────
clearTable(38, 8);
stampTable(38, 5); // moved up 3 rows
for (const x of [37, 40, 43]) { stampDesk(x, 17); newSeats.push({ name: `pc-${seatN++}`, x, y: 17 }); }
stampPlant1(35, 19, PLANT_A);
stampPlant1(45, 19, PLANT_B);

// ── 4. Podcast Room: table moved left, an internal wall against the room's
//    own east wall (x58) with 3 desks above it — same idea as the original
//    room's own internal partitions (a short wall stub, not a full room) ──
clearTable(49, 8);
stampTable(49, 5);
// internal partition: a short wall running from the room's south wall (y21)
// up to y15, set 3 tiles in from the east wall (x58), with a door gap
for (let y = 16; y <= 21; y++) { set(wallsL, 55, y, 530); set(collL, 55, y, 1); }
set(wallsL, 55, 21, 0); set(collL, 55, 21, 0); // door back out to the room
for (const x of [56, 57]) { stampDesk(x, 18); newSeats.push({ name: `pc-${seatN++}`, x, y: 18 }); }
stampDesk(56, 13); newSeats.push({ name: `pc-${seatN++}`, x: 56, y: 13 });
stampPlant1(48, 19, PLANT_A);

// ── 5. Café corner / lounge: split into two real rooms ──────────────────
// dividing wall at x=33 between café (west) and lounge (east) in the
// bottom band (y70-79), with a door
for (let y = 70; y <= 79; y++) { set(wallsL, 33, y, 530); set(collL, 33, y, 1); }
set(wallsL, 33, 75, 0); set(collL, 33, 75, 0);
set(aboveL, 33, 75, 281); // doormat

// ── 6. lounge "four corner chairs" -> a proper straight seating row ─────
const COUCH_GID = T(16, 0);
function clearChairSquare(x0, y0) { for (let dy = 0; dy <= 3; dy++) for (let dx = 0; dx <= 2; dx++) { set(belowL, x0 + dx, y0 + dy, 0); set(collL, x0 + dx, y0 + dy, 0); } }
clearChairSquare(38, 73); clearChairSquare(48, 73);
function stampSeatingRow(x0, y) { for (let i = 0; i < 4; i++) { set(belowL, x0 + i, y, COUCH_GID); set(collL, x0 + i, y, 1); } }
stampSeatingRow(37, 74);
stampSeatingRow(47, 74);
set(floorL, 39, 75, T(30, 1)); set(floorL, 49, 75, T(30, 1)); // rug just in front

// ── 7. corridor: swap the chair-square for a plain desk, add plants ─────
// (corridor couches were at (6,24) and (50,24) — replace with a desk)
set(belowL, 6, 24, 0); set(collL, 6, 24, 0);
set(belowL, 50, 24, 0); set(collL, 50, 24, 0);
stampDesk(8, 24); newSeats.push({ name: `pc-${seatN++}`, x: 8, y: 24 });
stampPlant1(20, 24, PLANT_A);
stampPlant1(38, 24, PLANT_B);

// ── 8. separator wall after the 4th desk row, both side walls, with a
//    door in the walkway so the floor stays fully connected ─────────────
const sepY = 49; // between deskRows[3]=46 (+3 clearance) and deskRows[4]=51
for (let x = 1; x <= 57; x++) { set(wallsL, x, sepY, 579); set(collL, x, sepY, 1); }
for (const x of [28, 29, 30, 31]) { set(wallsL, x, sepY, 0); set(collL, x, sepY, 0); set(floorL, x, sepY, floorGidFor(x, sepY)); }
set(aboveL, 28, sepY, 281);

// ── spawn points for the newly added desks ───────────────────────────────
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
let nextId = map.nextobjectid ?? 1;
for (const s of newSeats) {
  spawnLayer.objects.push({ id: nextId++, name: s.name, type: '', x: s.x * map.tilewidth, y: s.y * map.tileheight, width: 0, height: 0, rotation: 0, visible: true, point: true });
}
map.nextobjectid = nextId;

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log(`Fix pass done. ${newSeats.length} new seats: ${newSeats.map((s) => s.name).join(', ')}`);
