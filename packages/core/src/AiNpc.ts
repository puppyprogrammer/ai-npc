// The NPC engine. Framework-agnostic. `createNpc(options)` returns an AiNpcHandle.
//
// STATUS (Phase 2, step 1): render + lip-sync are live via VrmStage — the model loads, blinks, looks at
// the camera, and lip-syncs to speech (viseme-driven, audio-amplitude, or a timed flap for Web Speech).
// Still TODO(port from Eve): emotion/Movement-Director body language, locomotion (walkTo), and the
// "if it fits I sits" affordance navigation (goTo) — those methods throw a clear not-implemented error.

import type {
  Brain, Voice, AiNpcOptions, AiNpcHandle, ChatMessage, Affordance, Vec3, Mood, Anchor,
} from './types';
import { resolveBrain, resolveVoice } from './adapters';
import { detectAffordances } from './affordances';
import { VrmStage } from './stage';

const notReady = (what: string): never => {
  throw new Error(`ai-npc: ${what} requires locomotion/affordances, not implemented yet (TODO: port from Eve).`);
};

class AiNpc implements AiNpcHandle {
  private readonly opts: AiNpcOptions;
  private readonly brain: Brain | null;
  private readonly voice: Voice | null;
  private readonly history: ChatMessage[] = [];
  private anchors: Anchor[];
  private stage: VrmStage | null = null;
  private speaking = false;

  constructor(opts: AiNpcOptions) {
    this.opts = opts;
    this.brain = resolveBrain(opts.brain);
    this.voice = resolveVoice(opts.voice);
    this.anchors = [...(opts.anchors ?? [])];
    if (opts.persona?.systemPrompt) this.history.push({ role: 'system', content: opts.persona.systemPrompt });
  }

  /** three.js scene — add your own world geometry to it (the affordance scan reads it). */
  get scene(): unknown {
    return this.stage?.scene ?? null;
  }

  async init(): Promise<void> {
    this.stage = new VrmStage(this.opts.container, {
      view: this.opts.camera?.view,
      cameraPosition: this.opts.camera?.position,
      cameraTarget: this.opts.camera?.target,
    });
    await this.stage.loadModel(this.opts.model);
    this.stage.start();
    if (this.opts.affordances?.auto !== false) {
      this.anchors = [...this.anchors, ...detectAffordances(this.stage.scene, this.opts.affordances)];
    }
  }

  async say(text: string): Promise<void> {
    if (!this.voice || !this.stage) return;
    const speech = await this.voice.speak(text);
    this.setSpeaking(true);
    try {
      await this.stage.speak(speech);
    } finally {
      this.setSpeaking(false);
    }
  }

  async chat(userText: string): Promise<string> {
    if (!this.brain) throw new Error('ai-npc: no brain configured — pass `brain` to chat().');
    this.history.push({ role: 'user', content: userText });
    const res = this.brain.respond({ messages: this.history });
    const reply = isPromise(res) ? await res : await collect(res);
    this.history.push({ role: 'assistant', content: reply });
    await this.say(reply);
    return reply;
  }

  async walkTo(_x: number, _z: number): Promise<void> {
    notReady('walkTo()');
  }

  async goTo(_affordance: Affordance, _target?: Vec3 | string): Promise<void> {
    notReady('goTo()');
  }

  async standUp(): Promise<void> {
    notReady('standUp()');
  }

  setMood(_mood: Mood): void {
    // TODO(port): drive a held VRM expression + feed affect into the Movement-Director (step 2).
  }

  lookAt(target: Vec3 | 'camera' | 'cursor' | null): void {
    if (!this.stage) return;
    this.stage.lookAt(target === 'cursor' ? 'camera' : target); // TODO(port): real cursor gaze
  }

  getAffordances(): Anchor[] {
    return [...this.anchors];
  }

  dispose(): void {
    this.stage?.dispose();
    this.stage = null;
  }

  private setSpeaking(v: boolean): void {
    if (this.speaking === v) return;
    this.speaking = v;
    this.opts.onSpeakingChange?.(v);
  }
}

function isPromise<T>(v: Promise<T> | AsyncIterable<T>): v is Promise<T> {
  return typeof (v as Promise<T>).then === 'function';
}
async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const t of stream) out += t;
  return out;
}

/** Create and return an NPC. Call `await npc.init()` before use. */
export function createNpc(options: AiNpcOptions): AiNpcHandle {
  return new AiNpc(options);
}
