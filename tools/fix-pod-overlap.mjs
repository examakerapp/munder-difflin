#!/usr/bin/env node
/**
 * Corrective patch for expand-office-map-v2.mjs: the two glass meeting pods
 * were placed at py=16, the same row as the 3rd desk row (seatY=16), and
 * their north-wall loop painted window tiles over the desks sitting at
 * x=38 and x=54 in that row (wallsL only — the desk's own furniture/
 * collision layers were untouched, confirmed by the earlier check script,
 * but a wall tile drawn on top of a desk's chair tile is still a real
 * visual bug). Clears both pods and their wall-pollution, then rebuilds
 * them two rows lower (y=18..20), entirely below every desk's footprint
 * (the lowest desk row's footprint bottoms out at y=17), so there is no
 * row this time where a pod and a desk can occupy the same tile.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps', 'office.tmj');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const W = map.width;

function layer(name) { return map.layers.find((x) => x.type === 'tilelayer' && x.name === name); }
const floorL = layer('floor');
const wallsL = layer('walls');
const collL = layer('collision');
function set(l, x, y, v) { l.data[y * W + x] = v; }
function floorGidFor(x, y) { return y % 2 === 0 ? (x % 2 === 1 ? 799 : 800) : (x % 2 === 1 ? 783 : 784); }

const OLD_PODS = [{ px: 36, py: 16, w: 4, h: 3 }, { px: 52, py: 16, w: 4, h: 3 }];
const DESK_CELLS_TO_PRESERVE = new Set(['38,16', '38,17', '54,16', '54,17']); // wallsL here must go back to 0, not floor logic

for (const { px, py, w, h } of OLD_PODS) {
  for (let y = py; y <= py + h; y++) {
    for (let x = px; x <= px + w; x++) {
      set(wallsL, x, y, 0);
      if (!DESK_CELLS_TO_PRESERVE.has(`${x},${y}`)) {
        set(collL, x, y, 0);
        set(floorL, x, y, floorGidFor(x, y));
      }
      // desk cells: leave collL/belowL/aboveL exactly as the desk stamp set
      // them (already verified correct) — only wallsL needed clearing.
    }
  }
}

function stampWindow(x, y) {
  set(wallsL, x, y, 611); set(wallsL, x + 1, y, 611);
  set(wallsL, x, y + 1, 643); set(wallsL, x + 1, y + 1, 643);
}
function buildPod(px, py, w, h) {
  for (let y = py; y <= py + h; y++) for (let x = px; x <= px + w; x++) set(floorL, x, y, floorGidFor(x, y));
  for (let x = px; x <= px + w; x++) {
    stampWindow(x, py);
    set(collL, x, py, 1);
    set(wallsL, x, py + h, 579); set(collL, x, py + h, 1);
  }
  for (let y = py; y <= py + h; y++) {
    set(wallsL, px, y, 530); set(collL, px, y, 1);
    set(wallsL, px + w, y, 533); set(collL, px + w, y, 1);
  }
  set(wallsL, px + Math.floor(w / 2), py + h, 0);
  set(collL, px + Math.floor(w / 2), py + h, 0);
}
// new Y: 18..20 — strictly below the lowest desk row's footprint (max y=17)
buildPod(36, 18, 4, 2);
buildPod(52, 18, 4, 2);

writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log('Pods rebuilt at y=18..20 (clear of every desk footprint).');
