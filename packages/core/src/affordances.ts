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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectSurfaces(_scene: unknown, _cfg: Required<AffordanceConfig>): DetectedSurface[] {
  // TODO(engine port): raycast a grid over scene bounds (or iterate mesh faces), keep up-facing
  // hits, cluster into flat patches, measure clear square/length + height. Returns [] for now.
  return [];
}
