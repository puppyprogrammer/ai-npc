// Behavior — the body layer on top of VrmStage: mood expressions, idle breathing/sway, speaking
// gestures (step 2), procedural walk-to-coordinate (step 3), and canonical surface poses (step 4).
//
// FIRST-PASS / blind: motions are deliberately conservative and procedural. The amplitudes, the walk
// cadence, and especially the sit/lie IK are meant to be TUNED against a live avatar (the CommsLink
// "Eve" dogfood). Treat the numbers here as starting points.
//
// All work is done on the VRM *normalized* humanoid: we set local bone rotations each frame, then the
// caller runs `vrm.update(dt)` to propagate to the raw rig. update() is state-based so the systems
// (idle / walking / posed) never fight over the same bones.

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { Affordance, Mood } from './types';

type State = 'idle' | 'walking' | Affordance;

const MOOD_EXPR: Record<Mood, string | null> = {
  neutral: null, happy: 'happy', sad: 'sad', angry: 'angry', surprised: 'surprised', thinking: 'relaxed',
};

// Presenter "beat" hand poses — deltas added to the arms-down base while speaking. Index 0 = relaxed/low.
// She eases between these through an utterance so she gesticulates like a spokesperson.
const BEATS = [
  { ruX: 0, ruZ: 0, rlZ: 0.1, luX: 0, luZ: 0, llZ: -0.1 },               // relaxed at sides
  { ruX: -0.5, ruZ: -0.45, rlZ: 0.55, luX: -0.5, luZ: 0.45, llZ: -0.55 }, // both hands up + open (presenting)
  { ruX: -0.7, ruZ: -0.3, rlZ: 0.8, luX: -0.1, luZ: 0.05, llZ: -0.15 },   // right-hand emphasis
  { ruX: -0.1, ruZ: -0.05, rlZ: 0.15, luX: -0.7, luZ: 0.3, llZ: -0.8 },   // left-hand emphasis
  { ruX: -0.35, ruZ: -0.2, rlZ: 0.45, luX: -0.35, luZ: 0.2, llZ: -0.45 }, // both forward (beat)
];

export class Behavior {
  private state: State = 'idle';
  private mood: Mood = 'neutral';
  private moodLevel = 0;
  private t = 0;

  // walk
  private walkTarget: THREE.Vector2 | null = null;
  private walkResolve: (() => void) | null = null;
  private readonly speed = 0.9; // m/s
  private readonly turnRate = 6; // rad/s

  // idle fidget + speaking-gesture state
  private idleAction: { kind: number; start: number; dur: number; dir: number } | null = null;
  private nextIdleAt = 0;
  private lastDt = 0.016;
  private beat = 0;
  private beatNextAt = 0;
  private arm = { ruX: 0, ruZ: 0, rlZ: 0.1, luX: 0, luZ: 0, llZ: -0.1 }; // eased current speaking-arm delta

  // rest reference (captured from the model's default pose)
  private readonly restHipsY: number;

  constructor(private readonly vrm: VRM) {
    const hips = this.bone('hips');
    this.restHipsY = hips ? hips.position.y : 0.9;
  }

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  private gestureName: string | null = null;
  private gestureUntil = 0;
  gesture(name: string): void {
    this.gestureName = name;
    this.gestureUntil = performance.now() + (name === 'wave' ? 2600 : 1400);
  }

  /** Walk to a ground coordinate. Resolves on arrival. */
  walkTo(x: number, z: number): Promise<void> {
    this.walkTarget = new THREE.Vector2(x, z);
    this.state = 'walking';
    return new Promise<void>((resolve) => { this.walkResolve = resolve; });
  }

  /** Adopt a held pose at the given world position + surface height (basic hip-height "IK"). */
  pose(affordance: Affordance, at: THREE.Vector3, facing?: number): void {
    const root = this.vrm.scene;
    root.position.x = at.x;
    root.position.z = at.z;
    if (facing !== undefined) root.rotation.y = facing;
    this.poseSurfaceY = at.y;
    this.state = affordance;
  }
  private poseSurfaceY = 0;

  standUp(): void {
    this.state = 'idle';
  }

  isWalking(): boolean {
    return this.state === 'walking';
  }

  /** Per-frame update. Call before vrm.update(dt). `speaking` drives talk gestures. */
  update(dt: number, speaking: boolean): void {
    this.t += dt;
    this.lastDt = dt;
    this.resetControlledBones();

    // Base standing pose so she's never in a T-pose (the VRM rest pose is T/A). Eve's tuned A-pose:
    // upper arms down at the sides, slight elbow bend. States below add motion on top of this.
    this.rot('rightUpperArm', 0, 0, 1.3);
    this.rot('leftUpperArm', 0, 0, -1.3);
    this.rot('rightLowerArm', 0, 0, 0.12);
    this.rot('leftLowerArm', 0, 0, -0.12);

    // Mood expression eases in/out.
    const targetMood = this.mood === 'neutral' ? 0 : 0.85;
    this.moodLevel += (targetMood - this.moodLevel) * Math.min(1, dt * 6);
    const em = this.vrm.expressionManager;
    if (em) {
      for (const m of Object.values(MOOD_EXPR)) if (m) em.setValue(m, 0);
      const expr = MOOD_EXPR[this.mood];
      if (expr) em.setValue(expr, this.moodLevel);
    }

    switch (this.state) {
      case 'walking': this.updateWalk(dt); break;
      case 'sit': this.applySit(); break;
      case 'lie': this.applyLie(); break;
      case 'climb':
      case 'stand': this.applyStandOn(); break;
      default: if (speaking) this.updateSpeaking(); else this.updateIdle(); break;
    }

    // One-off gestures override the relevant limb on top of the current state.
    if (this.gestureName && performance.now() < this.gestureUntil) this.applyGesture(this.gestureName);
    else this.gestureName = null;
  }

  private applyGesture(name: string): void {
    const t = this.t;
    if (name === 'wave') {
      const w = Math.sin(t * 11) * 0.4; // hand oscillation
      this.setAbs('rightUpperArm', -0.2, 0, 0.25);  // raise the right arm up/out
      this.setAbs('rightLowerArm', 0, 0, -1.25 + w); // forearm up by the head, waving
      this.setAbs('rightHand', 0, 0, w * 0.6);
    } else if (name === 'nod') {
      this.setAbs('head', 0.18 + Math.sin(t * 7) * 0.18, 0, 0);
    } else if (name === 'point') {
      this.setAbs('rightUpperArm', -1.4, 0, 0.2);
      this.setAbs('rightLowerArm', 0, 0, 0);
    }
  }

  // ── idle / speaking ───────────────────────────────────────────────────────────────────────
  private breathe(): void {
    const t = this.t;
    this.rot('chest', Math.sin(t * 1.6) * 0.025, 0, 0);
    this.rot('spine', 0, 0, Math.sin(t * 0.55) * 0.018);
  }

  // Expressive speaking: she "talks with her hands" — eased beat gestures that change through the
  // utterance, plus a talking-head bob. This is the spokesperson core. Amplitudes are presenter-moderate.
  private updateSpeaking(): void {
    this.breathe();
    const now = performance.now();
    if (now >= this.beatNextAt) {
      this.beat = 1 + Math.floor(Math.random() * (BEATS.length - 1)); // mostly active beats
      this.beatNextAt = now + 600 + Math.random() * 900;
    }
    const tgt = BEATS[this.beat] ?? BEATS[0]!;
    const k = Math.min(1, this.lastDt * 7);
    const a = this.arm;
    a.ruX += (tgt.ruX - a.ruX) * k; a.ruZ += (tgt.ruZ - a.ruZ) * k; a.rlZ += (tgt.rlZ - a.rlZ) * k;
    a.luX += (tgt.luX - a.luX) * k; a.luZ += (tgt.luZ - a.luZ) * k; a.llZ += (tgt.llZ - a.llZ) * k;
    const j = Math.sin(this.t * 9) * 0.03; // subtle life
    this.rot('rightUpperArm', a.ruX, 0, a.ruZ);
    this.rot('rightLowerArm', 0, 0, a.rlZ + j);
    this.rot('leftUpperArm', a.luX, 0, a.luZ);
    this.rot('leftLowerArm', 0, 0, a.llZ - j);
    this.rot('head', Math.sin(this.t * 6) * 0.03, Math.sin(this.t * 2.5) * 0.05, 0); // talking-head bob
  }

  private updateIdle(): void {
    const t = this.t;
    // Always-on subtle life + a slow weight sway + tiny head drift. Relax the speaking arms back.
    this.breathe();
    this.rot('head', Math.sin(t * 0.4) * 0.015, Math.sin(t * 0.5) * 0.03, 0);
    const a = this.arm; const k = Math.min(1, this.lastDt * 5);
    a.ruX += (0 - a.ruX) * k; a.ruZ += (0 - a.ruZ) * k; a.rlZ += (0.1 - a.rlZ) * k;
    a.luX += (0 - a.luX) * k; a.luZ += (0 - a.luZ) * k; a.llZ += (-0.1 - a.llZ) * k;

    // Occasional discrete idle action — glance, weight shift, small arm move — so she reads as alive
    // (this is the "every once in a while she moves her head/arm" feel). Eased in and back out to neutral.
    const now = performance.now();
    if (this.nextIdleAt === 0) this.nextIdleAt = now + 2500 + Math.random() * 3000;
    if (!this.idleAction && now >= this.nextIdleAt) {
      this.idleAction = { kind: Math.floor(Math.random() * 5), start: now, dur: 1300 + Math.random() * 1100, dir: Math.random() < 0.5 ? -1 : 1 };
    }
    if (this.idleAction) {
      const p = (now - this.idleAction.start) / this.idleAction.dur;
      if (p >= 1) {
        this.idleAction = null;
        this.nextIdleAt = now + 3500 + Math.random() * 5500; // a few seconds until the next one
      } else {
        const e = Math.sin(Math.min(1, p) * Math.PI); // 0 → 1 → 0
        const d = this.idleAction.dir;
        switch (this.idleAction.kind) {
          case 0: this.rot('head', 0, d * 0.45 * e, 0); break;                          // glance to a side
          case 1: this.rot('head', -0.22 * e, d * 0.16 * e, d * 0.12 * e); break;        // look up + slight tilt
          case 2: this.rot('spine', 0, 0, d * 0.07 * e); this.rot('chest', 0, 0, d * 0.05 * e); break; // shift weight
          case 3: this.rot('rightUpperArm', -0.35 * e, 0, 0); break;                     // small right-arm move
          case 4: this.rot('leftUpperArm', -0.3 * e, 0, 0); this.rot('head', 0, -0.2 * e, 0); break; // left-arm + glance
        }
      }
    }
  }

  // ── walking ───────────────────────────────────────────────────────────────────────────────
  private updateWalk(dt: number): void {
    const root = this.vrm.scene;
    const target = this.walkTarget;
    if (!target) { this.arriveWalk(); return; }
    const dx = target.x - root.position.x;
    const dz = target.y - root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) { this.arriveWalk(); return; }

    // turn toward target (model faces +Z after rotateVRM0)
    const desired = Math.atan2(dx, dz);
    root.rotation.y = approachAngle(root.rotation.y, desired, this.turnRate * dt);

    // step forward
    const step = Math.min(dist, this.speed * dt);
    root.position.x += (dx / dist) * step;
    root.position.z += (dz / dist) * step;

    // procedural walk cycle (legs swing forward/back; arms counter-swing forward/back, on top of the
    // arms-down base so they don't fly out sideways)
    const c = Math.sin(this.t * 8);
    this.rot('leftUpperLeg', c * 0.5, 0, 0);
    this.rot('rightUpperLeg', -c * 0.5, 0, 0);
    this.rot('leftLowerLeg', Math.max(0, -c) * 0.6, 0, 0);
    this.rot('rightLowerLeg', Math.max(0, c) * 0.6, 0, 0);
    this.rot('leftUpperArm', -c * 0.3, 0, 0);
    this.rot('rightUpperArm', c * 0.3, 0, 0);
  }

  private arriveWalk(): void {
    this.walkTarget = null;
    this.state = 'idle';
    const r = this.walkResolve;
    this.walkResolve = null;
    r?.();
  }

  // ── poses (first-pass; hip-height only, refine with IK during CommsLink debugging) ──────────
  private applySit(): void {
    const hips = this.bone('hips');
    if (hips) hips.position.y = this.poseSurfaceY + 0.08; // sit on the surface
    // cross-legged-ish: thighs out + up, shins folded in
    this.rot('leftUpperLeg', -1.3, 0.5, 0.5);
    this.rot('rightUpperLeg', -1.3, -0.5, -0.5);
    this.rot('leftLowerLeg', 1.7, 0, 0);
    this.rot('rightLowerLeg', 1.7, 0, 0);
    this.rot('spine', 0.05, 0, 0);
  }

  private applyLie(): void {
    const hips = this.bone('hips');
    if (hips) hips.position.y = this.poseSurfaceY + 0.05;
    this.rot('spine', -1.5, 0, 0); // recline (very rough — tune live)
  }

  private applyStandOn(): void {
    const hips = this.bone('hips');
    if (hips) hips.position.y = this.poseSurfaceY + this.restHipsY;
  }

  // ── bone helpers ────────────────────────────────────────────────────────────────────────
  private static readonly CONTROLLED = [
    'spine', 'chest', 'neck', 'head',
    'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftHand', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg',
  ] as const;

  private resetControlledBones(): void {
    for (const name of Behavior.CONTROLLED) {
      const b = this.bone(name);
      if (b) b.rotation.set(0, 0, 0);
    }
    // hips height resets to rest unless a pose overrides it this frame
    const hips = this.bone('hips');
    if (hips && this.state !== 'sit' && this.state !== 'lie' && this.state !== 'stand' && this.state !== 'climb') {
      hips.position.y = this.restHipsY;
    }
  }

  private rot(name: string, x: number, y: number, z: number): void {
    const b = this.bone(name);
    if (b) b.rotation.set(b.rotation.x + x, b.rotation.y + y, b.rotation.z + z);
  }

  // Set a bone's local rotation absolutely (overrides the base/idle pose — used by gestures).
  private setAbs(name: string, x: number, y: number, z: number): void {
    const b = this.bone(name);
    if (b) b.rotation.set(x, y, z);
  }

  private bone(name: string): THREE.Object3D | null {
    return this.vrm.humanoid?.getNormalizedBoneNode(name as never) ?? null;
  }
}

function approachAngle(cur: number, target: number, maxStep: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
