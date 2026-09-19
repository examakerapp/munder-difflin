#!/usr/bin/env node
/**
 * Third pass: fills the black void left in the south-east quadrant (x34-59,
 * y22-73 — the map is 60x74 after passes 1+2, but that corner was never
 * floored) with a real Lounge room, and scatters actual decorative props
 * (plants, a rug, a clock, a picture, a chalkboard, couches) through it and
 * the East Wing, instead of only ever repeating the desk stamp.
 *
 * Every gid below was read off a precise, LABELED grid overlay of
 * office-tileset.png (generated with PIL, 5x nearest-neighbour scale, red
 * gridlines + row/col numbers burned in) that was visually inspected tile by
 * tile before picking anything — not guessed from the raw unlabeled PNG.
 * tileset: office-tileset.png, firstgid=1, 16 cols. gid = row*16 + col + 1.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const W = map.width, H = map.height;

function layer(name) { return map.layers.find((x) => x.type === 'tilelayer' && x.name === name); }
const floorL = layer('floor'), wallsL = layer('walls'), belowL = layer('furniture-below'),
      aboveL = layer('furniture-above'), collL = layer('collision');
function set(l, x, y, v) { l.data[y * W + x] = v; }
function floorGidFor(x, y) { return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784); }

// gid helper for office-tileset (firstgid=1, 16 columns)
const T = (row, col) => row * 16 + col + 1;

// ─── props, read off the labeled grid ─────────────────────────────────────
const PLANT_SMALL = { top: T(28, 1), base: T(29, 1) };   // brown-pot potted plant, 2 tiles tall
const PLANT_TALL   = { top: T(28, 5), base: T(29, 5) };   // white-pot plant, 2 tiles tall
const CLOCK        = T(22, 2);                            // round wall clock, single tile
const PICTURE      = { top: T(24, 1), base: T(25, 1) };   // framed landscape, 2 tiles tall
const CHALKBOARD   = { top: T(26, 0), base: T(27, 0) };   // green chalkboard, 2 tiles tall
const COUCH        = [T(16, 0), T(16, 1), T(16, 2), T(16, 3)]; // 4 armchair/couch variants, single tile
const RUG          = T(30, 1);                             // single-tile rug

function stampPlant(x, y, kind = PLANT_SMALL) {
  set(aboveL, x, y - 1, kind.top);
  set(belowL, x, y, kind.base);
  set(collL, x, y, 1); // a plant pot blocks its own tile, same as the existing café plant
}
function stampWallDecor(x, y, kind) {
  // hung on the wall row directly above the given interior floor tile
  set(aboveL, x, y - 1, kind.top);
  set(aboveL, x, y, kind.base);
}
function stampCouch(x, y, gid) {
  set(belowL, x, y, gid);
  set(collL, x, y, 1);
}

// ═══════════════════════════ SE Quadrant ═══════════════════════════════
const qX0 = 34, qX1 = 59, qY0 = 22, qY1 = 73;

// floor everywhere in the quadrant's interior
for (let y = qY0; y <= qY1 - 1; y++) for (let x = qX0; x <= qX1; x++) set(floorL, x, y, floorGidFor(x, y));

// west wall (shared boundary with the south wing) — double wall, same pattern as the East Wing
for (let y = qY0; y <= qY1 - 1; y++) { set(wallsL, 33, y, 533); set(collL, 33, y, 1); set(wallsL, qX0, y, 530); set(collL, qX0, y, 1); }
// east wall (outer edge)
for (let y = qY0; y <= qY1 - 1; y++) { set(wallsL, qX1, y, 533); set(collL, qX1, y, 1); }
// south wall — extends the existing south-wing south wall across the new width
for (let x = qX0; x <= qX1; x++) { set(wallsL, x, qY1, 579); set(collL, x, qY1, 1); set(floorL, x, qY1, 0); }
set(wallsL, qX1, qY1, 581);

// Door 1: south wing <-> lounge, a verified-reachable row (checked live against
// the actual BFS graph before picking it, same as the East Wing door redo)
for (const y of [26, 27]) { set(wallsL, 33, y, 0); set(collL, 33, y, 0); set(wallsL, qX0, y, 0); set(collL, qX0, y, 0); }
set(aboveL, 33, 26, 281); // doormat, same prop as the main entrance threshold
set(aboveL, qX0, 26, 281);

// Door 2: East Wing <-> lounge (a second connection, clear of both glass pods
// at x36-40 and x52-56)
for (const x of [44, 45]) { set(wallsL, x, 21, 0); set(collL, x, 21, 0); }

// ─── Lounge: y=22..36, four couches around two rugs, a plant in each back
//     corner, a picture + chalkboard on the shared north wall ─────────────
const loungeY0 = qY0, loungeY1 = 36;
// two couches facing each other, twice (two little seating clusters)
stampCouch(38, 26, COUCH[0]);
stampCouch(40, 26, COUCH[1]);
stampCouch(38, 30, COUCH[2]);
stampCouch(40, 30, COUCH[3]);
set(floorL, 39, 28, RUG);
stampCouch(50, 26, COUCH[0]);
stampCouch(52, 26, COUCH[1]);
stampCouch(50, 30, COUCH[2]);
stampCouch(52, 30, COUCH[3]);
set(floorL, 51, 28, RUG);
stampPlant(36, 33, PLANT_TALL);
stampPlant(57, 33, PLANT_TALL);
// wall-mounted decor, hung on the East Wing's south wall (this quadrant's north wall)
stampWallDecor(46, qY0, PICTURE);
stampWallDecor(49, qY0, CHALKBOARD);
set(aboveL, 42, qY0 - 1, CLOCK); // just inside the East Wing side, visible from the lounge doorway

// ─── Desk zone: y=38..72, more of the proven desk stamp, with a plant
//     between every other pair of rows for variety instead of a bare grid ──
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
const deskCols = [37, 41, 45, 49, 53, 57];
const deskRows = [40, 45, 50, 55, 60, 65, 70];
let seatN = 98; // continues pc-98.. from pass 2's pc-97
const newDeskSeats = [];
for (let ri = 0; ri < deskRows.length; ri++) {
  const seatY = deskRows[ri];
  for (const seatX of deskCols) {
    stampDesk(seatX, seatY);
    newDeskSeats.push({ name: `pc-${seatN++}`, x: seatX, y: seatY });
  }
  // a plant in the aisle every other row, in the gap column between desk
  // pairs (x=39/43/... halfway between two desk columns — clear of every
  // desk's -1..+1 footprint) so the desk zone isn't a bare repeating grid
  if (ri % 2 === 1) stampPlant(39, seatY + 1, ri % 4 === 1 ? PLANT_SMALL : PLANT_TALL);
}

// spawn-points for the new desks
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
let nextId = map.nextobjectid ?? 1;
for (const s of newDeskSeats) {
  spawnLayer.objects.push({ id: nextId++, name: s.name, type: '', x: s.x * map.tilewidth, y: s.y * map.tileheight, width: 0, height: 0, rotation: 0, visible: true, point: true });
}
map.nextobjectid = nextId;

// ─── East Wing: sprinkle a few props into its already-open floor (clear of
//     both desks and both pods) instead of leaving it bare between rows ───
stampPlant(35 + 1, 4, PLANT_SMALL);       // just inside the shared door
stampPlant(58 - 1, 4, PLANT_TALL);
set(aboveL, 47, 1, CLOCK);                 // near the entrance-east doorway

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log(`SE quadrant filled: lounge (y${loungeY0}-${loungeY1}) + ${newDeskSeats.length} more desks + plants/clock/picture/chalkboard.`);
console.log('New seats:', newDeskSeats.map((s) => `'${s.name}'`).join(', '));
