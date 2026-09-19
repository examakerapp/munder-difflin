#!/usr/bin/env node
/**
 * Second pass on office.tmj: adds an EAST WING (genuine X-axis growth, on top
 * of the south wing's Y-axis growth from pass 1), two new doors, windows, and
 * a couple of small glass-walled meeting pods. Same philosophy as pass 1:
 * every gid placed below was read off a tile that's already proven to render
 * correctly in this exact map (the top/side/south wall gids, the window
 * block, the doormat, the desk stamp) — nothing is guessed from the raw PNGs.
 *
 * Run: node tools/expand-office-map-v2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));

const oldW = map.width;
const H = map.height; // unchanged this pass (already 74 from pass 1)
const NEW_COLS = 26;
const newW = oldW + NEW_COLS;

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

// ─── widen every row: rebuild each layer's flat array with `NEW_COLS` more
//     cells inserted at the end of every existing row (row-major, so this
//     has to happen row-by-row, not just appended once at the end) ────────
function widen(l, fill = () => 0) {
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = l.data.slice(y * oldW, y * oldW + oldW);
    for (let x = oldW; x < newW; x++) row.push(fill(x, y));
    rows.push(row);
  }
  l.data = rows.flat();
}
for (const l of [floorL, wallsL, belowL, aboveL, collL]) widen(l);
map.width = newW;

function set(l, x, y, v) { l.data[y * newW + x] = v; }
function get(l, x, y) { return l.data[y * newW + x]; }

function floorGidFor(x, y) {
  return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784);
}

// ─── East Wing interior: x = oldW..newW-1 (34..59), y = 0..21 (same height
//     as the original room) — floor + perimeter walls ─────────────────────
const wingX0 = oldW;        // 34 — shared wall column with the original room
const wingX1 = newW - 1;    // 59 — new outer east wall
const wingY0 = 0;
const wingY1 = 21;

for (let y = wingY0 + 1; y <= wingY1 - 1; y++) {
  for (let x = wingX0 + 1; x <= wingX1 - 1; x++) set(floorL, x, y, floorGidFor(x, y));
}
// north wall (fill 522, matching the original room's own top wall verbatim)
for (let x = wingX0; x <= wingX1; x++) { set(wallsL, x, wingY0, 522); set(collL, x, wingY0, 1); }
// west wall (shared boundary with the original room) — plain fill gid 530
for (let y = wingY0 + 1; y <= wingY1 - 1; y++) { set(wallsL, wingX0, y, 530); set(collL, wingX0, y, 1); }
// east wall (new outer edge) — mirrors the original room's own east wall (533/581)
for (let y = wingY0 + 1; y <= wingY1 - 1; y++) { set(wallsL, wingX1, y, 533); set(collL, wingX1, y, 1); }
set(wallsL, wingX1, wingY0, 517); // NE corner, same gid the original room uses for its own
// south wall of the wing, so it doesn't leak into the south-wing's rows below
for (let x = wingX0; x <= wingX1; x++) { set(wallsL, x, wingY1, 579); set(collL, x, wingY1, 1); set(floorL, x, wingY1, 0); }
set(wallsL, wingX0, wingY1, 578);
set(wallsL, wingX1, wingY1, 581);

// ─── Door 1: original room <-> East Wing, a 2-tile gap at y=11..12 in the
//     shared wall column (both the original room's east wall at x=33 and the
//     wing's west wall at x=34) + the doormat prop (gid 281, the same one
//     already sitting at the main entrance's threshold) on both sides ─────
for (const y of [11, 12]) {
  set(wallsL, oldW - 1, y, 0); set(collL, oldW - 1, y, 0); // x=33 (original room's own wall)
  set(wallsL, wingX0, y, 0);   set(collL, wingX0, y, 0);   // x=34 (wing's wall)
}
set(aboveL, oldW - 1, 11, 281);
set(aboveL, wingX0, 11, 281);

// ─── Door 2: a second exterior door, in the East Wing's own north wall —
//     "agents can come in and out" from a second point, not just the
//     original room's south doorway. Named 'entrance-east' below. ─────────
const eastDoorX = wingX0 + 12; // x≈46
for (const x of [eastDoorX, eastDoorX + 1]) { set(wallsL, x, wingY0, 0); set(collL, x, wingY0, 0); }
set(aboveL, eastDoorX, wingY0 + 1, 281);

// ─── Windows: the 2x2 window-pane block read off the original room's own
//     window (gids 611/611 top row, 643/643 bottom row) — placed on the
//     wing's north wall, away from the new door ──────────────────────────
function stampWindow(x, y) {
  set(wallsL, x, y, 611); set(wallsL, x + 1, y, 611);
  set(wallsL, x, y + 1, 643); set(wallsL, x + 1, y + 1, 643);
}
stampWindow(wingX0 + 3, wingY0);
stampWindow(wingX1 - 4, wingY0);

// ─── Desks: 15 more, same proven stamp as the south wing, in a cluster
//     roughly centered in the wing (columns clear of the two glass pods
//     built below) ─────────────────────────────────────────────────────
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
const deskSeatNames = [];
let seatN = 83; // continues pc-1..pc-82 from pass 1
const deskCols = [wingX0 + 4, wingX0 + 8, wingX0 + 12, wingX0 + 16, wingX0 + 20];
const deskRows = [wingY0 + 6, wingY0 + 11, wingY0 + 16];
for (const seatY of deskRows) {
  for (const seatX of deskCols) {
    stampDesk(seatX, seatY);
    deskSeatNames.push({ name: `pc-${seatN++}`, x: seatX, y: seatY });
  }
}

// ─── Two small glass-walled meeting pods ("round cabins" — the tile grid
//     has no circular art, so these are chamfered-corner glass rooms
//     instead: a window wall on the side facing the room, like the
//     glass-office look real open floors use for pods). Empty inside — no
//     SeatPool seats, same as how the existing "boardroom" zone works. ────
function buildPod(px, py, w, h) {
  for (let y = py; y <= py + h; y++) {
    for (let x = px; x <= px + w; x++) set(floorL, x, y, floorGidFor(x, y));
  }
  for (let x = px; x <= px + w; x++) {
    stampWindow(x, py); // glass front wall
    set(collL, x, py, 1);
    set(wallsL, x, py + h, 579); set(collL, x, py + h, 1);
  }
  for (let y = py; y <= py + h; y++) {
    set(wallsL, px, y, 530); set(collL, px, y, 1);
    set(wallsL, px + w, y, 533); set(collL, px + w, y, 1);
  }
  // doorway: a 1-tile gap in the near-side wall
  set(wallsL, px + Math.floor(w / 2), py + h, 0);
  set(collL, px + Math.floor(w / 2), py + h, 0);
}
buildPod(wingX0 + 2, wingY1 - 5, 4, 3);
buildPod(wingX1 - 7, wingY1 - 5, 4, 3);

// ─── spawn-points: append the new desk seats + the second door ───────────
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
let nextId = (map.nextobjectid ?? 1);
for (const s of deskSeatNames) {
  spawnLayer.objects.push({
    id: nextId++, name: s.name, type: '', x: s.x * map.tilewidth, y: s.y * map.tileheight,
    width: 0, height: 0, rotation: 0, visible: true, point: true,
  });
}
spawnLayer.objects.push({
  id: nextId++, name: 'entrance-east', type: '',
  x: eastDoorX * map.tilewidth, y: (wingY0 + 1) * map.tileheight,
  width: 0, height: 0, rotation: 0, visible: true, point: true,
});
map.nextobjectid = nextId;

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');

console.log(`Map widened: ${oldW}x${H} -> ${newW}x${H} (+${NEW_COLS} cols)`);
console.log(`East Wing: x${wingX0}-${wingX1}, y${wingY0}-${wingY1}`);
console.log(`Placed ${deskSeatNames.length} more desks (running total ${82 + deskSeatNames.length}).`);
console.log('Added: door to original room (y11-12), 2nd exterior door "entrance-east", 2 windows, 2 glass meeting pods.');
console.log('\nAppend to OFFICE_THEME.primarySeatNames:\n');
console.log(deskSeatNames.map((s) => `'${s.name}'`).join(', '));
