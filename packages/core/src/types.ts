// ── ai-npc public contract ──────────────────────────────────────────────────────────────────
// The engine is deliberately agnostic about WHERE words and audio come from. You plug in a Brain
// (turns conversation into text) and a Voice (turns text into speakable audio + timing for lip-sync).
// Built-in adapters cover the common cases; or implement these two interfaces yourself.

export type Vec3 = { x: number; y: number; z: number };

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** A unit of speech the engine can lip-sync to: audio plus optional timing for visemes. */
export interface Speech {
  /** Playable audio for the spoken line. */
  audio: ArrayBuffer | Blob | HTMLAudioElement;
  /** Optional viseme/timing track. If absent, the engine estimates lip-sync from audio amplitude. */
  visemes?: { time: number; viseme: string; weight?: number }[];
  /** Optional duration hint (ms) when it can't be derived from the audio. */
  durationMs?: number;
}

/** The "brain": turns a conversation into a reply. Return a string or stream tokens. */
export interface Brain {
  respond(input: { messages: ChatMessage[]; signal?: AbortSignal }): Promise<string> | AsyncIterable<string>;
}

/** The "voice": turns text into speakable audio (+ optional lip-sync timing). */
export interface Voice {
  speak(text: string, opts?: { signal?: AbortSignal }): Promise<Speech>;
}

// ── Surface affordances ("if it fits, I sits") ──────────────────────────────────────────────
// Rather than authoring an interaction per object, the engine scans scene geometry for surfaces
// and decides what the NPC can DO there, from the surface's shape — not the object's identity.

export type Affordance = 'sit' | 'lie' | 'stand' | 'climb';

export interface AffordanceConfig {
  /** Auto-scan scene meshes for usable surfaces. Default true. */
  auto?: boolean;
  /** Max surface tilt (deg from horizontal) still considered "flat enough". Default 8. */
  maxTiltDeg?: number;
  /** Min clear square side (meters) needed to sit cross-legged. Default ~0.5. */
  sitMinSize?: number;
  /** Min clear length (meters) needed to lie down. Default ~1.7. */
  lieMinLength?: number;
  /** Surface heights (meters) the NPC will sit on (floor sit vs chair/table). Default [0, 0.6]. */
  sitHeightRange?: [number, number];
  /** Max step-up height (meters) the NPC will climb onto. Default 0.7. */
  climbMaxHeight?: number;
}

/** An explicit interaction point. Use to override/augment auto-detection when you need precision. */
export interface Anchor {
  id: string;
  position: Vec3;
  /** Facing yaw in radians (optional). */
  facing?: number;
  affordance: Affordance;
  /** Optional named animation clip to use here instead of the canonical one. */
  clip?: string;
}

// ── Engine options ──────────────────────────────────────────────────────────────────────────

export type BrainConfig =
  | Brain
  | { provider: 'openai'; apiKey: string; model?: string; baseUrl?: string }
  | { provider: 'anthropic'; apiKey: string; model?: string; baseUrl?: string }
  | { provider: 'endpoint'; url: string; headers?: Record<string, string> };

export type VoiceConfig =
  | Voice
  | { provider: 'webspeech'; voice?: string; prefer?: 'female' | 'male'; rate?: number; pitch?: number }
  | { provider: 'elevenlabs'; apiKey: string; voiceId: string; modelId?: string }
  | { provider: 'openai'; apiKey: string; voice?: string; model?: string }
  | { provider: 'endpoint'; url: string; headers?: Record<string, string> };

export type Mood = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking';

export interface AiNpcOptions {
  /** DOM element to mount the WebGL canvas into. */
  container: HTMLElement;
  /** URL to a .vrm (or .glb) avatar model. */
  model: string;
  /** Persona / system prompt and display name. */
  persona?: { systemPrompt?: string; name?: string };
  brain?: BrainConfig;
  voice?: VoiceConfig;
  /** Surface-affordance behavior. */
  affordances?: AffordanceConfig;
  /** Explicit interaction points (overrides/augments auto-detection). */
  anchors?: Anchor[];
  /** Initial camera framing. */
  camera?: { view?: 'full' | 'portrait'; position?: Vec3; target?: Vec3 };
  /** Called when the NPC starts/stops speaking, for UI sync. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Called once after init() finishes (model loaded, first affordance scan done). Add your own world
   *  geometry to `scene` here, then call `rescanAffordances()` so the NPC can use it. */
  onReady?: () => void;
}

/** The running NPC. Created via `createNpc(options)`. */
export interface AiNpcHandle {
  /** Boot the renderer, load the model, and scan affordances. Call once before use. */
  init(): Promise<void>;
  /** Speak a line directly (lip-sync + emotion), no LLM round-trip. */
  say(text: string): Promise<void>;
  /** Send user input through the Brain, then speak the reply. Returns the reply text. */
  chat(userText: string): Promise<string>;
  /** Walk to a world coordinate (ground plane). */
  walkTo(x: number, z: number): Promise<void>;
  /** Walk to a target and perform an affordance (sit/lie/stand/climb). Resolves the nearest
   *  matching surface/anchor if `target` is omitted. */
  goTo(affordance: Affordance, target?: Vec3 | string): Promise<void>;
  /** Stop any current interaction and stand. */
  standUp(): Promise<void>;
  setMood(mood: Mood): void;
  /** Play a one-off gesture (e.g. 'wave', 'nod'), then return to idle. */
  gesture(name: string): void;
  lookAt(target: Vec3 | 'camera' | 'cursor' | null): void;
  /** List affordances the engine has detected/registered in the current scene. */
  getAffordances(): Anchor[];
  /** Re-scan the scene for surfaces (call after adding/removing world geometry). Returns the new set
   *  (explicit anchors + freshly detected). */
  rescanAffordances(): Anchor[];
  /** Access the underlying three.js scene to add your own world geometry. */
  readonly scene: unknown; // THREE.Scene — typed in the real export to avoid leaking three here
  dispose(): void;
}
