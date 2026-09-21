#!/usr/bin/env node
/**
 * Fourth pass:
 *  - fixes a real wall-seam bug (a corner tile left sitting mid-wall at the
 *    original-room/East-Wing junction — visible as a broken/kinked wall line)
 *  - seals the second exterior door back up (one common entrance/exit, not
 *    several — OfficeFloor.tsx's spawn logic was reverted to match)
 *  - replaces the two empty "glass pod" boxes (which rendered as a confusing
 *    wall of windows) with two real, distinct rooms: a small Meeting Room
 *    and a Podcast Room, both built around the office's own oval conference
 *    table — copied verbatim (including its flip-bit tiles) from the
 *    original boardroom, not reinvented
 *  - adds filing cabinets + more plants to the South Wing, which had gone
 *    undecorated in pass 1
 *  - labels every new room as a `zones` object, same convention the
 *    original map already uses for `boardroom` / `cafeteria`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const W = map.width;

function layer(name) { return map.layers.find((x) => x.type === 'tilelayer' && x.name === name); }
const floorL = layer('floor'), wallsL = layer('walls'), belowL = layer('furniture-below'),
      aboveL = layer('furniture-above'), collL = layer('collision');
function set(l, x, y, v) { l.data[y * W + x] = v; }
function floorGidFor(x, y) { return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784); }
const T = (row, col) => row * 16 + col + 1;

// ── 1. wall-seam fix: (33,0) was still the original room's own NE corner
//    tile (517) from before the East Wing existed — now that the wall
//    continues past it, it needs to be plain wall fill like the rest of the
//    row, not a corner. ──────────────────────────────────────────────────
set(wallsL, 33, 0, 522);

// ── 2. seal the second exterior door — one common door only ────────────
for (const x of [46, 47]) { set(wallsL, x, 0, 522); set(collL, x, 0, 1); set(floorL, x, 0, 0); }
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
spawnLayer.objects = spawnLayer.objects.filter((o) => o.name !== 'entrance-east');

// ── 3. the real oval conference table, copied verbatim from the original
//    boardroom (x9-18, y0-7 in the source map — table + a chair row on each
//    side). Captured as raw relative-offset tile lists so the flip-bit gids
//    (Tiled's own mirroring, not something to re-derive) just get replayed. */
function captureBlock(data, x0, y0, x1, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = data[y * W + x];
    if (v !== 0) cells.push([x - x0, y - y0, v]);
  }
  return cells;
}
const TABLE_BELOW = captureBlock(belowL.data, 10, 3, 15, 6);
const TABLE_ABOVE = captureBlock(aboveL.data, 10, 1, 15, 6);
const TABLE_COLL = (() => {
  const MASK = 0x1FFFFFFF;
  const cells = [];
  for (let y = 3; y <= 6; y++) for (let x = 10; x <= 15; x++) {
    if ((collL.data[y * W + x] & MASK) !== 0) cells.push([x - 10, y - 3]);
  }
  return cells;
})();
function stampTable(originX, originY) {
  for (const [dx, dy, gid] of TABLE_BELOW) set(belowL, originX + dx, originY + dy, gid);
  for (const [dx, dy, gid] of TABLE_ABOVE) set(aboveL, originX + dx, originY + dy, gid);
  for (const [dx, dy] of TABLE_COLL) set(collL, originX + dx, originY + dy, 1);
}

// ── 4. rebuild the two pod footprints as real rooms ─────────────────────
function clearRect(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    set(wallsL, x, y, 0); set(collL, x, y, 0); set(belowL, x, y, 0); set(aboveL, x, y, 0);
    set(floorL, x, y, floorGidFor(x, y));
  }
}
clearRect(36, 16, 41, 20);
clearRect(51, 16, 57, 20);

function buildRoom(x0, y0, x1, y1, doorX) {
  for (let x = x0; x <= x1; x++) { set(wallsL, x, y0, 522); set(collL, x, y0, 1); set(wallsL, x, y1, 579); set(collL, x, y1, 1); }
  for (let y = y0; y <= y1; y++) { set(wallsL, x0, y, 530); set(collL, x0, y, 1); set(wallsL, x1, y, 533); set(collL, x1, y, 1); }
  set(wallsL, x0, y0, 514); set(wallsL, x1, y0, 517); set(wallsL, x0, y1, 578); set(wallsL, x1, y1, 581);
  set(wallsL, doorX, y1, 0); set(collL, doorX, y1, 0);
  set(aboveL, doorX, y1 - 1, 281); // doormat
}

// Meeting Room 2 — the full table + both chair rows, same as the original boardroom
buildRoom(35, 15, 42, 21, 38);
stampTable(37, 17);

// Podcast Room — a tighter room, same table but only the near chair row (an
// intimate round-table setup instead of a full boardroom)
buildRoom(50, 15, 58, 21, 54);
stampTable(52, 17);
// strip the far chair row (the original's y+3 relative row) so it reads as
// a small 2-person table, not a shrunk boardroom
for (let dx = 0; dx <= 5; dx++) { set(belowL, 52 + dx, 17 + 3, 0); set(collL, 52 + dx, 17 + 3, 0); }

// ── 5. South Wing: filing cabinets + more plants (it had none from pass 1) ─
const CABINET_TOP = [T(18, 2), T(18, 3)];
const CABINET_BOTTOM = [T(19, 2), T(19, 3)];
function stampCabinet(x, y) {
  set(belowL, x, y - 1, CABINET_TOP[0]); set(belowL, x + 1, y - 1, CABINET_TOP[1]);
  set(belowL, x, y, CABINET_BOTTOM[0]); set(belowL, x + 1, y, CABINET_BOTTOM[1]);
  set(collL, x, y, 1); set(collL, x + 1, y, 1); set(collL, x, y - 1, 1); set(collL, x + 1, y - 1, 1);
}
const PLANT_SMALL = { top: T(28, 1), base: T(29, 1) };
const PLANT_TALL = { top: T(28, 5), base: T(29, 5) };
function stampPlant(x, y, kind) { set(aboveL, x, y - 1, kind.top); set(belowL, x, y, kind.base); set(collL, x, y, 1); }

// south wing spans x1-32, y22-72 (from pass 1) — its desk rows sit at
// y = 25,30,35,...70 in bands of 5; the gap column (x=4,8,...) between desk
// pairs is clear at every row, same reasoning as the pass-3 desk zone.
const swDeskRows = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
for (let i = 0; i < swDeskRows.length; i++) {
  const y = swDeskRows[i] + 1; // the walkable aisle row just past each desk
  if (i % 3 === 0) stampCabinet(4, y);
  else if (i % 3 === 1) stampPlant(4, y, PLANT_SMALL);
  else stampPlant(28, y, PLANT_TALL);
}

// ── 6. label the new rooms as zones, same convention as boardroom/cafeteria ─
const zonesLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'zones');
let zid = 0;
const tw = map.tilewidth, th = map.tileheight;
zonesLayer.objects.push(
  { id: zid++, name: 'meeting-room-2', type: '', x: 35 * tw, y: 15 * th, width: 8 * tw, height: 7 * th, rotation: 0, visible: true },
  { id: zid++, name: 'podcast-room', type: '', x: 50 * tw, y: 15 * th, width: 9 * tw, height: 7 * th, rotation: 0, visible: true },
  { id: zid++, name: 'chillout-lounge', type: '', x: 34 * tw, y: 22 * th, width: 26 * tw, height: 15 * th, rotation: 0, visible: true },
);

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log('v4 done: wall seam fixed, single door restored, Meeting Room 2 + Podcast Room built with the real table, South Wing decorated with cabinets/plants.');
