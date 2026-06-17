// Surface affordance detection — the "if it fits, I sits" system.
//
// Given the scene's meshes, find horizontal-ish surfaces and classify what the NPC can do on each,
// from geometry alone (not the object's identity). The detected anchors feed the same goTo() path as
// explicit anchors, so auto-detected and hand-placed interaction points are interchangeable.
//
// Algorithm (heuristic — intentionally simple + robust enough for v1; precision via explicit anchors):
//   1. Sample candidate surfaces: raycast a coarse grid downward over the scene bounds, OR walk mesh
//      faces, keeping hits whose surface normal is within `maxTiltDeg` of straight up.
//   2. Cluster adjacent up-facing hits into flat patches; compute each patch's clear bounding square
//      and its height above the ground plane.
//   3. Classify each patch:
//        - clear square >= sitMinSize AND height in sitHeightRange   -> 'sit'
//        - clear length >= lieMinLength                              -> 'lie'
//        - height <= climbMaxHeight (and reachable)                  -> 'climb' (then 'stand' on top)
//        - flat ground patch                                         -> 'stand'
//   4. Emit an Anchor per patch (position = patch centre on the surface, facing = toward open space).
//
// Headroom/clearance-above checks and IK foot/hip placement happen at use-time in the engine.

import * as THREE from 'three';
import type { Affordance, AffordanceConfig, Anchor, Vec3 } from './types';

export const DEFAULT_AFFORDANCE_CONFIG: Required<AffordanceConfig> = {
  auto: true,
  maxTiltDeg: 8,
  sitMinSize: 0.5,
  lieMinLength: 1.7,
  sitHeightRange: [0, 0.6],
  climbMaxHeight: 0.7,
};

export interface DetectedSurface {
  center: Vec3;
  /** Surface normal (world). */
  normal: Vec3;
  /** Side length of the largest clear square that fits on the patch (meters). */
  clearSquare: number;
  /** Longest clear straight run on the patch (meters). */
  clearLength: number;
  /** Height of the surface above the ground plane (meters). */
  height: number;
}

/** Classify a detected surface into the affordances it supports. */
export function classifySurface(s: DetectedSurface, cfg: Required<AffordanceConfig>): Affordance[] {
  const out: Affordance[] = [];
  const [hMin, hMax] = cfg.sitHeightRange;
  if (s.clearSquare >= cfg.sitMinSize && s.height >= hMin && s.height <= hMax) out.push('sit');
  if (s.clearLength >= cfg.lieMinLength) out.push('lie');
  if (s.height > 0.05 && s.height <= cfg.climbMaxHeight) out.push('climb');
  if (s.height <= 0.05) out.push('stand');
  return out;
}

/**
 * Scan a three.js scene for usable surfaces and return interaction anchors.
 *
 * @param scene  THREE.Scene (typed as unknown here to avoid a hard three import in the contract).
 * @param cfg    affordance config (merged with defaults).
 *
 * TODO(engine port): implement the raycast-grid / face-walk surface sampling + clustering. The
 * classification + anchor emission below is ready; only `detectSurfaces` needs the three.js geometry
 * pass. This is the main *new* (non-extraction) work versus the Eve codebase.
 */
export function detectAffordances(scene: unknown, cfg?: AffordanceConfig): Anchor[] {
  const c = { ...DEFAULT_AFFORDANCE_CONFIG, ...(cfg ?? {}) };
  const surfaces = detectSurfaces(scene, c); // TODO: real geometry scan
  const anchors: Anchor[] = [];
  surfaces.forEach((s, i) => {
    for (const aff of classifySurface(s, c)) {
      anchors.push({ id: `auto:${aff}:${i}`, position: s.center, affordance: aff });
    }
  });
  return anchors;
}

// Raycast a coarse grid straight down over the scene, keep up-facing hits, flood-fill them into flat
// patches at similar heights, and measure each patch. SkinnedMeshes (the avatar) are excluded so the
// NPC doesn't try to sit on itself. First-pass heuristic — good enough to find desks/floors/crates.
function detectSurfaces(scene: unknown, cfg: Required<AffordanceConfig>): DetectedSurface[] {
  const root = scene as THREE.Object3D | null;
  if (!root || typeof root.traverse !== 'function') return [];

  const targets: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) targets.push(m);
  });
  if (!targets.length) return [];

  const box = new THREE.Box3();
  for (const m of targets) box.expandByObject(m);
  if (box.isEmpty()) return [];

  const spacing = 0.25;
  const minNy = Math.cos((cfg.maxTiltDeg * Math.PI) / 180);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const topY = box.max.y + 1;
  const cols = Math.max(1, Math.ceil((box.max.x - box.min.x) / spacing));
  const rows = Math.max(1, Math.ceil((box.max.z - box.min.z) / spacing));

  // Sample grid → map of "i,j" -> {x,z,y}
  const grid = new Map<string, { i: number; j: number; x: number; z: number; y: number }>();
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const x = box.min.x + i * spacing;
      const z = box.min.z + j * spacing;
      ray.set(new THREE.Vector3(x, topY, z), down);
      const hit = ray.intersectObjects(targets, true)[0];
      if (!hit || !hit.face) continue;
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.y < minNy) continue;
      grid.set(`${i},${j}`, { i, j, x, z, y: hit.point.y });
    }
  }

  // Flood-fill adjacent cells with similar height into patches.
  const seen = new Set<string>();
  const surfaces: DetectedSurface[] = [];
  for (const [key, cell] of grid) {
    if (seen.has(key)) continue;
    const cluster: typeof cell[] = [];
    const stack = [cell];
    seen.add(key);
    while (stack.length) {
      const c = stack.pop()!;
      cluster.push(c);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = `${c.i + di},${c.j + dj}`;
        const nc = grid.get(nk);
        if (nc && !seen.has(nk) && Math.abs(nc.y - c.y) < 0.12) { seen.add(nk); stack.push(nc); }
      }
    }
    const n = cluster.length;
    const cx = cluster.reduce((s, c) => s + c.x, 0) / n;
    const cz = cluster.reduce((s, c) => s + c.z, 0) / n;
    const cy = cluster.reduce((s, c) => s + c.y, 0) / n;
    const w = (Math.max(...cluster.map((c) => c.x)) - Math.min(...cluster.map((c) => c.x))) || spacing;
    const d = (Math.max(...cluster.map((c) => c.z)) - Math.min(...cluster.map((c) => c.z))) || spacing;
    surfaces.push({
      center: { x: cx, y: cy, z: cz },
      normal: { x: 0, y: 1, z: 0 },
      clearSquare: Math.min(w, d),
      clearLength: Math.max(w, d),
      height: cy - box.min.y,
    });
  }
  return surfaces;
}
