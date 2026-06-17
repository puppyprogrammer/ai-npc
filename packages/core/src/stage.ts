// VrmStage — the Three.js + @pixiv/three-vrm rendering core: renderer/scene/camera/lights, VRM load,
// the animation loop, auto-blink, look-at, and lip-sync (viseme-driven when timing is supplied, else
// audio-amplitude, else a timed mouth-flap for engines like Web Speech that give no buffer).
//
// This is a clean, canonical implementation of the same approach the "Eve" agent uses (VRM 5-vowel
// mouth shapes + blink). The richer emotion/Movement-Director body language is layered on in a later step.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { Affordance, Mood, Speech } from './types';
import { Behavior } from './behavior';

// Oculus viseme codes (e.g. from AWS Polly speech-marks) → the nearest of VRM's 5 vowel mouth shapes.
const VISEME_TO_VOWEL: Record<string, Vowel> = {
  aa: 'aa', E: 'ee', I: 'ih', O: 'oh', U: 'ou',
  PP: 'oh', FF: 'ou', DD: 'aa', kk: 'aa', CH: 'ih', SS: 'ih', nn: 'aa', RR: 'oh', TH: 'aa', sil: 'aa',
};
type Vowel = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
const VOWELS: Vowel[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

export interface StageOptions {
  view?: 'full' | 'portrait';
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
}

export class VrmStage {
  readonly scene = new THREE.Scene();
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private vrm: VRM | null = null;
  private behavior: Behavior | null = null;
  private raf = 0;

  // blink
  private blinkVal = 0;
  private blinkDir: -1 | 0 | 1 = 0;
  private nextBlinkAt = 0;

  // lip-sync state
  private speaking = false;
  private mouth = 0; // 0..1 smoothed mouth-open
  private activeVowel: Vowel = 'aa';
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array | null = null;
  private flapUntil = 0; // performance.now() ms for timed (Web Speech) flap
  private visemeTrack: { time: number; viseme: string; weight?: number }[] | null = null;
  private visemeStart = 0;

  constructor(container: HTMLElement, private readonly opts: StageOptions = {}) {
    this.container = container;
    const w = container.clientWidth || 360;
    const h = container.clientHeight || 480;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const portrait = opts.view === 'portrait';
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    const cp = opts.cameraPosition ?? (portrait ? { x: 0, y: 1.45, z: 1.4 } : { x: 0, y: 1.1, z: 3.2 });
    this.camera.position.set(cp.x, cp.y, cp.z);

    // Lights: a key directional + soft fill, so any VRM reads well on a transparent background.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, 2, 2.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.4);
    fill.position.set(-1.5, 1.5, -2);
    this.scene.add(fill);

    window.addEventListener('resize', this.onResize);
  }

  async loadModel(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error(`ai-npc: ${url} is not a VRM (no userData.vrm). Use a .vrm model.`);

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm); // VRM0 faces -Z; turn it to face the camera (+Z)

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.vrm = vrm;
    this.behavior = new Behavior(vrm);
    this.scene.add(vrm.scene);

    // Eyes track the camera by default ("looks at the viewer").
    if (vrm.lookAt) vrm.lookAt.target = this.camera;

    const t = this.opts.cameraTarget ?? { x: 0, y: this.opts.view === 'portrait' ? 1.45 : 1.0, z: 0 };
    this.camera.lookAt(t.x, t.y, t.z);
    this.nextBlinkAt = performance.now() + 1500 + Math.random() * 3000;
  }

  start(): void {
    if (this.raf) return;
    this.clock.start();
    this.animate();
  }

  private animate = (): void => {
    this.raf = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const vrm = this.vrm;
    if (vrm) {
      this.updateMouth(dt);
      this.updateBlink(dt);
      const em = vrm.expressionManager;
      if (em) {
        for (const v of VOWELS) em.setValue(v, v === this.activeVowel ? this.mouth : 0);
        em.setValue('blink', this.blinkVal);
      }
      this.behavior?.update(dt, this.speaking);
      vrm.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updateMouth(dt: number): void {
    let target = 0;
    if (this.speaking) {
      if (this.visemeTrack) {
        const tSec = (performance.now() - this.visemeStart) / 1000;
        let cur = this.visemeTrack[0];
        for (const v of this.visemeTrack) { if (v.time <= tSec) cur = v; else break; }
        if (cur) { this.activeVowel = VISEME_TO_VOWEL[cur.viseme] ?? 'aa'; target = cur.weight ?? 1; }
      } else if (this.analyser && this.freq) {
        this.analyser.getByteFrequencyData(this.freq);
        let sum = 0;
        for (let i = 0; i < this.freq.length; i++) sum += this.freq[i] ?? 0;
        target = Math.min(1, (sum / this.freq.length / 255) * 2.2);
        this.activeVowel = 'aa';
      } else if (performance.now() < this.flapUntil) {
        // Web Speech: no buffer to analyse — fake a natural-ish flap.
        target = 0.25 + 0.55 * Math.abs(Math.sin(performance.now() / 90));
        this.activeVowel = 'aa';
      }
    }
    // ease toward target (fast open, slightly slower close)
    const rate = target > this.mouth ? 18 : 12;
    this.mouth += (target - this.mouth) * Math.min(1, dt * rate);
  }

  private updateBlink(dt: number): void {
    const now = performance.now();
    if (this.blinkDir === 0 && now >= this.nextBlinkAt) this.blinkDir = 1;
    if (this.blinkDir === 1) {
      this.blinkVal += dt * 12;
      if (this.blinkVal >= 1) { this.blinkVal = 1; this.blinkDir = -1; }
    } else if (this.blinkDir === -1) {
      this.blinkVal -= dt * 10;
      if (this.blinkVal <= 0) {
        this.blinkVal = 0;
        this.blinkDir = 0;
        this.nextBlinkAt = now + 1500 + Math.random() * 4000;
      }
    }
  }

  /** Play speech and drive lip-sync. Resolves when playback finishes. */
  async speak(speech: Speech): Promise<void> {
    this.endSpeech();
    this.speaking = true;
    try {
      if (speech.visemes?.length) {
        this.visemeTrack = speech.visemes;
        this.visemeStart = performance.now();
        await this.playAudio(speech).catch(() => {});
        await wait(speech.durationMs ?? lastTime(speech.visemes) * 1000 + 300);
      } else if (speech.audio instanceof ArrayBuffer || speech.audio instanceof Blob) {
        await this.playAnalysed(speech.audio);
      } else {
        // Web Speech / no buffer: timed flap.
        const ms = speech.durationMs ?? 1200;
        this.flapUntil = performance.now() + ms;
        await wait(ms);
      }
    } finally {
      this.endSpeech();
    }
  }

  private async playAnalysed(audio: ArrayBuffer | Blob): Promise<void> {
    const ctx = this.audioCtx();
    const bytes = audio instanceof Blob ? await audio.arrayBuffer() : audio.slice(0);
    const buf = await ctx.decodeAudioData(bytes as ArrayBuffer);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    this.analyser = analyser;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);
    analyser.connect(ctx.destination);
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
      src.start();
    });
  }

  private async playAudio(speech: Speech): Promise<void> {
    if (speech.audio instanceof ArrayBuffer || speech.audio instanceof Blob) {
      return this.playAnalysed(speech.audio);
    }
  }

  private endSpeech(): void {
    this.speaking = false;
    this.analyser = null;
    this.freq = null;
    this.visemeTrack = null;
    this.flapUntil = 0;
  }

  lookAt(target: { x: number; y: number; z: number } | 'camera' | null): void {
    if (!this.vrm?.lookAt) return;
    if (target === 'camera') this.vrm.lookAt.target = this.camera;
    else if (target === null) this.vrm.lookAt.target = undefined;
    else {
      const o = new THREE.Object3D();
      o.position.set(target.x, target.y, target.z);
      this.scene.add(o);
      this.vrm.lookAt.target = o;
    }
  }

  setMood(mood: Mood): void {
    this.behavior?.setMood(mood);
  }

  gesture(name: string): void {
    this.behavior?.gesture(name);
  }

  walkTo(x: number, z: number): Promise<void> {
    return this.behavior ? this.behavior.walkTo(x, z) : Promise.resolve();
  }

  pose(affordance: Affordance, at: { x: number; y: number; z: number }, facing?: number): void {
    this.behavior?.pose(affordance, new THREE.Vector3(at.x, at.y, at.z), facing);
  }

  standUp(): void {
    this.behavior?.standUp();
  }

  /** Current ground position of the NPC root. */
  getPosition(): { x: number; z: number } {
    const p = this.vrm?.scene.position;
    return { x: p?.x ?? 0, z: p?.z ?? 0 };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.onResize);
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this._audioCtx?.close().catch(() => {});
  }

  private _audioCtx: AudioContext | null = null;
  private audioCtx(): AudioContext {
    if (!this._audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this._audioCtx = new Ctx();
    }
    if (this._audioCtx.state === 'suspended') void this._audioCtx.resume();
    return this._audioCtx;
  }

  private onResize = (): void => {
    const w = this.container.clientWidth || 360;
    const h = this.container.clientHeight || 480;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
const lastTime = (track: { time: number }[]) => (track.length ? (track[track.length - 1]?.time ?? 0) : 0);
