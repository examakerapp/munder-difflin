#!/usr/bin/env node
/**
 * Office floor redesign — a real room-by-room plan, replacing the
 * expand-v1..v4 / fix-v2..v4 / pod-overlap stack that had drifted into a
 * genuinely broken map:
 *
 *   - the two top-right rooms were built with a ONE-row top wall (just the
 *     522 cap) while the original room uses the tileset's real three-row wall
 *     (522 cap / 554 upper face / 570 lower face), so their floor ran straight
 *     into the ceiling edge with no wall drawn — the "top looks glitched" bug
 *   - ~120 desks stamped edge-to-edge over a 58-row hall with no walkways,
 *     which reads as wallpaper rather than an office
 *   - invisible collision: tiles flagged solid with nothing drawn on any
 *     visual layer, so agents were blocked by thin air. Two sources: the
 *     captured conference-table asset carried 4 such cells of its own, and
 *     earlier passes left strays behind
 *   - a stray full-width wall bisecting the open floor at y=49, plus orphaned
 *     furniture fragments from earlier partial passes
 *   - every layer still declared `width: 34` after the map was widened to 59
 *     (widen() set l.height but never l.width) — harmless to this renderer,
 *     which indexes by map.width, but it silently corrupts the file for Tiled
 *
 * THE PLAN (59 x 64):
 *
 *   y0..21   preserved original room (x0..33) │ conference │ focus room
 *   y22..25  corridor spine, full width — every room door opens onto it
 *   y26..46  open plan: 3 rows x 12 desks, three-wide aisles between clusters
 *   y47..52  breakout band (collaboration tables, plants)
 *   y53..63  break room (x0..17) │ lobby (x18..38) │ lounge (x39..58)
 *   y63      south wall with the single front door at x28-29
 *
 * The ORIGINAL hand-made room (x0..33, y0..21 — the whole pre-expand 34x22
 * map) is copied through byte-for-byte on every layer and never touched.
 * Everything else is regenerated, and collision outside that block is derived
 * strictly from what is actually drawn, so "invisible wall" cannot come back.
 *
 * Furniture is reused as WHOLE VERIFIED CLUSTERS captured off the original
 * room (conference table, café kitchenette, the interiors-atlas shelf unit,
 * the wall board) rather than by picking raw gids out of an atlas — picking
 * blind is how you get half-drawn furniture.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));

const OLD_W = map.width, OLD_H = map.height;
const KEEP_W = 34, KEEP_H = 22;     // the original room, preserved verbatim
const W = 59, H = 64;               // new map size

const MASK = 0x1FFFFFFF;
const LAYER_NAMES = ['floor', 'walls', 'furniture-below', 'furniture-above', 'collision'];
const src = Object.fromEntries(
  LAYER_NAMES.map((n) => [n, map.layers.find((l) => l.type === 'tilelayer' && l.name === n).data])
);
const readSrc = (n, x, y) => src[n][y * OLD_W + x] ?? 0;

// ── capture whole furniture clusters off the original room ───────────────
// Collision is filtered to cells that actually carry a visual tile: the
// conference table's own capture used to bring 4 phantom solid cells along.
// withFloor defaults to OFF: for every asset but the lounge group the captured
// "floor" is just the source room's own checkerboard, and replaying it at a
// different x/y parity stamps a visibly offset patch of floor under the
// furniture. Only the lounge group's floor is real content (its rug).
function captureAsset(x0, y0, x1, y1, withFloor = false) {
  const below = [], above = [], floor = [], coll = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const b = readSrc('furniture-below', x, y), a = readSrc('furniture-above', x, y);
    const f = readSrc('floor', x, y);
    const c = (readSrc('collision', x, y) & MASK) !== 0;
    if (b) below.push([x - x0, y - y0, b]);
    if (a) above.push([x - x0, y - y0, a]);
    if (withFloor && f) floor.push([x - x0, y - y0, f]);
    if (c && (b || a)) coll.push([x - x0, y - y0]);
  }
  return { below, above, floor, coll, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// Conference table + its two chair rows. Captured from y3 DOWN on purpose:
// rows y1..y2 above it are the original's wall FACE, and capturing those swept
// the wall-mounted windows into the asset, which then got replayed into the
// middle of open floor — windows floating on the carpet.
const TABLE = captureAsset(10, 3, 15, 6);
const CAFE = captureAsset(26, 17, 32, 20);  // kitchenette: fridge/shelf/sink/counter
// The window itself: 2x2 on furniture-above, designed to sit on a wall face
// (the two rows painted 554/570). Mount it there, never on floor.
const WINDOW = captureAsset(10, 1, 11, 2);
// There is no separate 1-wide wall fixture in this tileset. An earlier
// WALL_ITEM = captureAsset(3, 1, 3, 2) was a misread: the window at x2..x3 is
// two tiles wide (327|328 over 343|344), so capturing only column 3 sliced off
// its right half. Stamped on a wall it drew a tall narrow sliver — the "straight
// device" glitch. Where a wall needs breaking up, use a WINDOW or a wallPlant.
// Lounge group: two chair rows facing a low table, standing on a 2x2 mat,
// with a side piece. Capturing only the top 2 rows (an earlier attempt) cut
// the far chair row off.
const LOUNGE_GROUP = captureAsset(27, 14, 29, 16, true); // true: keep its rug
// Storage unit from the interiors atlas. Its TOP row sits on a wall FACE row
// in the original (30,11 is over wall gid 570) — stamp it with `oy` on a wall
// face or it floats in open floor, which is what made it read as a stray
// device the first time round.
const SHELF = captureAsset(30, 11, 32, 14);

// ── fresh, empty layers ──────────────────────────────────────────────────
const out = Object.fromEntries(LAYER_NAMES.map((n) => [n, new Array(W * H).fill(0)]));
const set = (n, x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) out[n][y * W + x] = v; };
const get = (n, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : out[n][y * W + x]);

// ── preserve the original room, byte-for-byte, all five layers ───────────
for (let y = 0; y < KEEP_H; y++) for (let x = 0; x < KEEP_W; x++) {
  for (const n of LAYER_NAMES) set(n, x, y, readSrc(n, x, y));
}

// ── tile vocabulary (office-tileset, firstgid 1) ─────────────────────────
const T = (row, col) => row * 16 + col + 1;
const WALL = {
  cap: 522, faceUpper: 554, faceLower: 570, bottom: 579,
  left: 530, right: 533, tl: 514, tr: 517, bl: 578, br: 581,
  windowTop: 611, windowBottom: 643,
};
const floorGid = (x, y) => (y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784));
const DOOR_MARK = 281;

// Props, all taken from tiles the hand-made room actually uses. The previous
// generator computed these as T(row,col) guesses off a grid render, and most
// of them landed on gids that appear NOWHERE in the original: the "couches"
// (257/258) are really the conference table's two chair rows, 611/643 are
// wall tiles rather than windows, and the picture frame / clock gids did not
// exist at all. That is what produced furniture scattered around looking like
// stray devices. Each gid below is confirmed by an errand spot in
// themeRegistry pointing at it as a real prop.
const PLANT_FLOOR = [470, 471, 472];      // free-standing plants (furniture-below)
const WALL_PLANT = { above: 452, below: 468 }; // hangs on a wall face, pot on the floor row
const BIN = 297;
const DISPENSERS = [260, 298];
// 2x2 floor mat, four DISTINCT quadrant tiles on the floor layer — painting one
// gid four times (what the old RUG constant did) is why the mat looked broken.
const MAT = [[1698, 1699], [1714, 1715]];
// No SMALL_MAT. gid 482 was carried over from the first pass as "the little
// dark mat", but it appears NOWHERE in the hand-made room — it is one of the
// old generator's guessed gids, the same class of mistake as the fake couches
// and clocks. It is not a mat: painted on the floor it renders as a dark
// framed panel, which is the second "stray device" in the break room. The 2x2
// MAT above is the only floor mat this tileset actually has.
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;

const solid = (x, y) => set('collision', x, y, 1);
const clearSolid = (x, y) => set('collision', x, y, 0);
const fillFloor = (x0, y0, x1, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set('floor', x, y, floorGid(x, y));
};

/** A room with the tileset's real three-row top wall — the thing the previous
 *  generator got wrong. Interior therefore starts at y0+3, not y0+1. */
function room(x0, y0, x1, y1) {
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    set('walls', x, y0, WALL.cap);
    set('walls', x, y0 + 1, WALL.faceUpper);
    set('walls', x, y0 + 2, WALL.faceLower);
    set('walls', x, y1, WALL.bottom);
    solid(x, y0); solid(x, y0 + 1); solid(x, y0 + 2); solid(x, y1);
  }
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    set('walls', x0, y, WALL.left); set('walls', x1, y, WALL.right);
    solid(x0, y); solid(x1, y);
  }
  set('walls', x0, y0, WALL.tl); set('walls', x1, y0, WALL.tr);
  set('walls', x0, y1, WALL.bl); set('walls', x1, y1, WALL.br);
  solid(x0, y0); solid(x1, y0); solid(x0, y1); solid(x1, y1);
  fillFloor(x0 + 1, y0 + 3, x1 - 1, y1 - 1);
}
/** Doorway through a horizontal wall run (one row thick). */
function doorH(x0, x1, y) {
  for (let x = x0; x <= x1; x++) {
    set('walls', x, y, 0); clearSolid(x, y); set('floor', x, y, floorGid(x, y));
  }
  set('furniture-above', x0, y, DOOR_MARK);
}
/** Doorway through a vertical wall run (one column thick). */
function doorV(x, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    set('walls', x, y, 0); clearSolid(x, y); set('floor', x, y, floorGid(x, y));
  }
}
function window2(x, y) {
  set('walls', x, y + 1, WALL.windowTop); set('walls', x + 1, y + 1, WALL.windowTop);
  set('walls', x, y + 2, WALL.windowBottom); set('walls', x + 1, y + 2, WALL.windowBottom);
}
function stamp(asset, ox, oy) {
  for (const [dx, dy, gid] of asset.floor) set('floor', ox + dx, oy + dy, gid);
  for (const [dx, dy, gid] of asset.below) set('furniture-below', ox + dx, oy + dy, gid);
  for (const [dx, dy, gid] of asset.above) set('furniture-above', ox + dx, oy + dy, gid);
  for (const [dx, dy] of asset.coll) solid(ox + dx, oy + dy);
}
/** Same asset turned 180 degrees: both axes reverse and both flip bits toggle.
 *  A mat is a self-contained rug with its own border, so a plain left-right
 *  mirror still butts two near-identical borders together; turning the second
 *  one around is what makes a facing pair read as one piece. */
function stampRotated180(asset, ox, oy) {
  const rot = (cells, layer) => {
    for (const [dx, dy, gid] of cells) {
      set(layer, ox + (asset.w - 1 - dx), oy + (asset.h - 1 - dy), (gid ^ FLIP_H ^ FLIP_V) >>> 0);
    }
  };
  rot(asset.floor, 'floor'); rot(asset.below, 'furniture-below'); rot(asset.above, 'furniture-above');
  for (const [dx, dy] of asset.coll) solid(ox + (asset.w - 1 - dx), oy + (asset.h - 1 - dy));
}
/** Free-standing plant: one tile, sits on the floor. */
function plant(x, y, variant = 0) {
  set('furniture-below', x, y, PLANT_FLOOR[variant % PLANT_FLOOR.length]); solid(x, y);
}
/** Wall plant: leaves on the wall face, pot on the first floor row below it. */
function wallPlant(x, wallY) {
  set('furniture-above', x, wallY, WALL_PLANT.above);
  set('furniture-below', x, wallY + 1, WALL_PLANT.below); solid(x, wallY + 1);
}
function bin(x, y) { set('furniture-below', x, y, BIN); solid(x, y); }
function dispenser(x, y, variant = 0) {
  set('furniture-below', x, y, DISPENSERS[variant % DISPENSERS.length]); solid(x, y);
}
/** A 2x2 floor mat — the complete asset, placed as ONE unit.
 *
 *  It is deliberately never tiled into a bigger mat. All four of its tiles are
 *  corner pieces carrying the rug's dark outer border; the tileset has no
 *  border-free centre tile. So butting two copies together — mirrored,
 *  rotated, any orientation — always lands two outer borders side by side and
 *  draws a thick dark seam down the middle. Two earlier attempts (mirror, then
 *  180-degree rotation) both hit that, because the problem is the asset's
 *  geometry rather than the transform. Where a larger presence is wanted, use
 *  two mats with floor between them instead of joining them. */
function mat(x, y) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set('floor', x + dx, y + dy, MAT[dy][dx]);
}

// Desk: monitor block two rows above the seat; seat + chair tile stay walkable.
const DESK_BELOW = [[-1, -1, 2], [0, -1, 3], [1, -1, 4], [0, 0, 289], [0, 1, 305]];
const DESK_ABOVE = [[0, -2, 365], [1, -2, 366], [0, -1, 381], [1, -1, 382], [-1, 0, 18], [0, 0, 19], [1, 0, 20]];
const DESK_SOLID = [[0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]];
function desk(sx, sy) {
  for (const [dx, dy, gid] of DESK_BELOW) set('furniture-below', sx + dx, sy + dy, gid);
  for (const [dx, dy, gid] of DESK_ABOVE) set('furniture-above', sx + dx, sy + dy, gid);
  for (const [dx, dy] of DESK_SOLID) solid(sx + dx, sy + dy);
  clearSolid(sx, sy); clearSolid(sx, sy + 1);
}

// Every workable desk, in claim order. pc-1..pc-6 already live in the
// preserved room, so the new ones continue from 7: the two top-right rooms
// first, then the open plan — the building fills top-down.
const seats = [];
let seatN = 7;
const workDesk = (sx, sy) => { desk(sx, sy); seats.push({ name: `pc-${seatN++}`, x: sx, y: sy }); };

// ═══════════════ top band: two rooms beside the preserved one ════════════
// Conference room — windows on the wall face where they belong, the oval
// table in the middle, four working desks so the room is usable.
room(34, 0, 46, 21);
stamp(WINDOW, 36, 1); stamp(WINDOW, 41, 1);
wallPlant(35, 2);
workDesk(37, 6); workDesk(41, 6);
stamp(TABLE, 38, 11);
workDesk(37, 19); workDesk(41, 19);
plant(45, 19, 1);
doorH(39, 40, 21);

// Focus room — a quiet work room: three rows of paired desks and a storage
// unit. The unit's top row goes ON the wall face (y2), which is how it is
// built in the original; on bare floor it reads as a stray device.
room(47, 0, 58, 21);
stamp(WINDOW, 49, 1); stamp(WINDOW, 52, 1);
stamp(SHELF, 55, 2);
workDesk(49, 6); workDesk(53, 6);
workDesk(49, 12); workDesk(53, 12);
workDesk(49, 19); workDesk(53, 19);
plant(57, 19, 2);
doorH(51, 52, 21);

// ═══════════════ corridor spine + open plan + breakout ═══════════════════
// One continuous space from the corridor down to the lobby, bounded by the
// outer wall only — the rooms hang off it rather than chopping it up.
fillFloor(1, 22, W - 2, H - 2);
for (let y = 22; y <= H - 2; y++) {
  set('walls', 0, y, WALL.left); solid(0, y);
  set('walls', W - 1, y, WALL.right); solid(W - 1, y);
}
for (let x = 1; x <= W - 2; x++) { set('walls', x, H - 1, WALL.bottom); solid(x, H - 1); }
set('walls', 0, H - 1, WALL.bl); solid(0, H - 1);
set('walls', W - 1, H - 1, WALL.br); solid(W - 1, H - 1);

// open plan — four clusters of three desk columns, three-wide aisles between
const DESK_COLS = [4, 8, 12, 18, 22, 26, 32, 36, 40, 46, 50, 54];
const DESK_ROWS = [31, 38, 45];
for (const sy of DESK_ROWS) for (const sx of DESK_COLS) workDesk(sx, sy);
// Aisle greenery, at matching positions in each wide aisle so it reads as
// planting rather than clutter.
for (const ay of [34, 42]) { plant(15, ay, 0); plant(29, ay, 1); plant(43, ay, 2); }

// Breakout band (y47..52) — two collaboration tables, not more desks.
stamp(TABLE, 20, 48);
stamp(TABLE, 33, 48);

// Corridor spine — a waiting area at each end and two amenity nooks. Single
// props dropped in the middle of a 7-row band just read as litter, so the
// dispenser and bin sit together against the wall like a real one.
stamp(LOUNGE_GROUP, 7, 23);
stampRotated180(LOUNGE_GROUP, 48, 23);
wallPlant(24, 21); wallPlant(34, 21);   // hang off the rooms' bottom wall
dispenser(18, 22, 0); bin(19, 22);
dispenser(41, 22, 1); bin(42, 22);

// ═══════════════ bottom band: break room │ lobby │ lounge ════════════════
// Break room — kitchenette along one wall, storage on the other, windows in
// the wall face, bin beside the counter where a bin actually belongs.
// The kitchenette's rightmost column is a tall full-height unit (a fridge):
// in the original it stands against that room's right wall. Stamped in the
// middle of the floor it read as a stray grey pillar, so CAFE is anchored so
// that column lands against the right wall, and the door moved up the wall to
// stay clear of it. Storage takes the opposite wall, top row on the wall face.
room(0, 53, 17, 63);
stamp(WINDOW, 6, 54); stamp(WINDOW, 10, 54); stamp(WINDOW, 13, 54);
stamp(SHELF, 2, 55);
stamp(CAFE, 10, 59);
bin(9, 62);
plant(1, 62, 0);
doorV(17, 56, 57);                   // opens onto the lobby

// Lounge — a break-out room, not an all-carpet one: seating on the south
// side, two touchdown desks against the window wall, storage in the corner.
// LOUNGE_GROUP *already carries its own 2x2 rug* (the capture includes the
// floor layer), so one group here is one rug. Two groups plus two stamped
// mats was four rugs in an 18x7 room, which is what read as clutter — the
// standalone mat() calls are gone and the little dark mat does the one job
// a small mat is actually for, sitting inside the doorway.
room(39, 53, 58, 63);
stamp(WINDOW, 43, 54); stamp(WINDOW, 52, 54);
stamp(SHELF, 55, 55);                // top row on the wall face, as built
workDesk(46, 58); workDesk(50, 58);  // two touchdown desks under the windows
stamp(LOUNGE_GROUP, 42, 60);         // seating, on the rug it comes with
dispenser(48, 62, 0); bin(49, 62);
plant(41, 56, 1);
plant(57, 62, 2);
doorV(39, 58, 59);                   // opens onto the lobby

// Lobby (x18..38) — the one front door for the whole plan, a welcome mat in
// it, and a waiting group either side so the space is furnished rather than
// a bare hall with odds and ends dropped in it.
const DOOR_X = 28;
doorH(DOOR_X, DOOR_X + 1, H - 1);
const ENTRANCE = { x: DOOR_X, y: H - 2 };
mat(DOOR_X, H - 3);                  // welcome mat inside the doorway
stamp(LOUNGE_GROUP, 20, 56);
stampRotated180(LOUNGE_GROUP, 34, 56);
plant(24, 62, 2);
plant(33, 62, 0);

// ── write layers back ────────────────────────────────────────────────────
for (const n of LAYER_NAMES) {
  const l = map.layers.find((x) => x.type === 'tilelayer' && x.name === n);
  l.data = out[n];
  l.width = W;     // was left at 34 by the old widen() — real bug, fixed here
  l.height = H;
}
map.width = W; map.height = H;

// ── spawn points ─────────────────────────────────────────────────────────
const spawnLayer = map.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawn-points');
const TS = map.tilewidth;
const kept = spawnLayer.objects.filter((o) => {
  if (o.name === 'entrance') return false;                 // re-issued below
  const tx = Math.floor(o.x / TS), ty = Math.floor(o.y / TS);
  return tx < KEEP_W && ty < KEEP_H;                       // preserved room only
});
let nextId = map.nextobjectid ?? 1;
const mkPoint = (name, tx, ty) => ({
  id: nextId++, name, type: '', x: tx * TS, y: ty * TS,
  width: 0, height: 0, rotation: 0, visible: true, point: true,
});
spawnLayer.objects = [
  ...kept,
  mkPoint('entrance', ENTRANCE.x, ENTRANCE.y),
  ...seats.map((s) => mkPoint(s.name, s.x, s.y)),
];
map.nextobjectid = nextId;
// zones (boardroom, cafeteria) live inside the preserved room — untouched.

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');

// ── verification ─────────────────────────────────────────────────────────
const blocked = (x, y) => (out.collision[y * W + x] & MASK) !== 0;
const drawn = (x, y) => ['walls', 'furniture-below', 'furniture-above'].some((n) => get(n, x, y) !== 0);
const hasFloor = (x, y) => get('floor', x, y) !== 0;

// Invented-gid guard. Every tile this generator paints must be one the
// hand-made room already uses — anything else is a gid someone guessed off a
// grid render, which is how the fake couches, the fake clock and the "small
// mat" (482, actually a dark panel) got in. Reading the atlas cannot tell us
// what a tile depicts; the original room is the only ground truth we have.
const known = new Set();
for (const n of LAYER_NAMES) {
  if (n === 'collision') continue;
  for (let y = 0; y < KEEP_H; y++) for (let x = 0; x < KEEP_W; x++) {
    const g0 = readSrc(n, x, y) & MASK; if (g0) known.add(g0); // mask: originals carry flip bits
  }
}
const unknown = new Map();
for (const n of LAYER_NAMES) {
  if (n === 'collision') continue;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < KEEP_W && y < KEEP_H) continue;
    const g0 = get(n, x, y) & MASK;
    if (g0 && !known.has(g0)) unknown.set(g0, (unknown.get(g0) ?? 0) + 1);
  }
}

let invisible = 0, voidFloor = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (x < KEEP_W && y < KEEP_H) continue;
  if (blocked(x, y) && !drawn(x, y)) invisible++;
  if (!blocked(x, y) && !hasFloor(x, y)) voidFloor++;
}

const seen = new Set([`${ENTRANCE.x},${ENTRANCE.y}`]);
const queue = [ENTRANCE];
while (queue.length) {
  const { x, y } = queue.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = `${nx},${ny}`;
    if (seen.has(k) || blocked(nx, ny)) continue;
    seen.add(k); queue.push({ x: nx, y: ny });
  }
}
const points = spawnLayer.objects.filter((o) => o.name !== 'entrance');
const unreachable = points.filter((o) => !seen.has(`${Math.floor(o.x / TS)},${Math.floor(o.y / TS)}`));

console.log(`map ${OLD_W}x${OLD_H} -> ${W}x${H}`);
console.log(`open-plan desks ${seats.length} (pc-7..pc-${seatN - 1}); total spawn points ${spawnLayer.objects.length} (kept ${kept.length})`);
console.log(`entrance tile (${ENTRANCE.x},${ENTRANCE.y}) via south door x${DOOR_X}-${DOOR_X + 1}`);
console.log(`invisible collision outside preserved room: ${invisible}`);
console.log(`walkable-but-no-floor tiles: ${voidFloor}`);
console.log(unknown.size
  ? `INVENTED GIDS (not present in the hand-made room): ${[...unknown].map(([g0, n]) => `${g0}x${n}`).join(', ')}`
  : 'invented gids: 0');
console.log(`reachable tiles from entrance: ${seen.size}`);
console.log(unreachable.length === 0
  ? `OK: all ${points.length} spawn points reachable from the entrance`
  : `UNREACHABLE (${unreachable.length}): ${unreachable.map((o) => `${o.name}@${o.x / TS},${o.y / TS}`).join(', ')}`);
console.log('\nseat names:\n' + seats.map((s) => `'${s.name}'`).join(', '));
