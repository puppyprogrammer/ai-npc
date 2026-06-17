// The NPC engine. Framework-agnostic. `createNpc(options)` returns an AiNpcHandle.
//
// STATUS: skeleton. The brain/voice plumbing + conversation loop are wired; the Three.js avatar
// engine (render, lip-sync, emotion/Movement-Director, locomotion, IK) is being ported from the
// production "Eve" agent (CommsLink) and is marked TODO(port) below. Calls that need the renderer
// currently no-op or throw a clear "not implemented yet" so the shape is usable and honest.

import type { Brain, Voice, AiNpcOptions, AiNpcHandle, ChatMessage, Affordance, Vec3, Mood, Anchor } from './types';
import { resolveBrain, resolveVoice } from './adapters';
import { detectAffordances } from './affordances';

const notReady = (what: string) => {
  throw new Error(`ai-npc: ${what} requires the avatar engine, which is not implemented yet (TODO: port from Eve).`);
};

class AiNpc implements AiNpcHandle {
  readonly scene: unknown = null; // TODO(port): THREE.Scene

  private readonly opts: AiNpcOptions;
  private readonly brain: Brain | null;
  private readonly voice: Voice | null;
  private readonly history: ChatMessage[] = [];
  private anchors: Anchor[];
  private speaking = false;

  constructor(opts: AiNpcOptions) {
    this.opts = opts;
    this.brain = resolveBrain(opts.brain);
    this.voice = resolveVoice(opts.voice);
    this.anchors = [...(opts.anchors ?? [])];
    if (opts.persona?.systemPrompt) this.history.push({ role: 'system', content: opts.persona.systemPrompt });
  }

  /** Boot the renderer, load the model, scan affordances. */
  async init(): Promise<void> {
    // TODO(port): create THREE renderer/scene/camera, load the VRM via @pixiv/three-vrm, set up the
    // lip-sync rig + the emotion/Movement-Director, start the animation loop.
    // Once the scene exists, auto-detect affordances:
    if (this.opts.affordances?.auto !== false) {
      this.anchors = [...this.anchors, ...detectAffordances(this.scene, this.opts.affordances)];
    }
  }

  async say(text: string): Promise<void> {
    if (!this.voice) {
      // No voice configured: still drive the body/emotion; just no audio. (TODO(port): mouth+gesture.)
      return;
    }
    const speech = await this.voice.speak(text);
    this.setSpeaking(true);
    // TODO(port): play `speech.audio`, drive lip-sync from speech.visemes or audio amplitude, and
    // run the Movement-Director gestures for the line. For now, just hold for the duration.
    await new Promise((r) => setTimeout(r, speech.durationMs ?? 1200));
    this.setSpeaking(false);
  }

  async chat(userText: string): Promise<string> {
    if (!this.brain) throw new Error('ai-npc: no brain configured — pass `brain` to chat().');
    this.history.push({ role: 'user', content: userText });
    const res = this.brain.respond({ messages: this.history });
    const reply = typeof (res as Promise<string>).then === 'function'
      ? await (res as Promise<string>)
      : await collect(res as AsyncIterable<string>);
    this.history.push({ role: 'assistant', content: reply });
    await this.say(reply);
    return reply;
  }

  async walkTo(_x: number, _z: number): Promise<void> {
    notReady('walkTo()'); // TODO(port): locomotion to ground coord
  }

  async goTo(_affordance: Affordance, _target?: Vec3 | string): Promise<void> {
    notReady('goTo()'); // TODO(port): resolve nearest matching anchor, navigate, IK-adapt the clip
  }

  async standUp(): Promise<void> {
    notReady('standUp()');
  }

  setMood(_mood: Mood): void {
    // TODO(port): drive VRM expression + affect into the Movement-Director.
  }

  lookAt(_target: Vec3 | 'camera' | 'cursor' | null): void {
    // TODO(port): gaze target.
  }

  getAffordances(): Anchor[] {
    return [...this.anchors];
  }

  dispose(): void {
    // TODO(port): tear down renderer, listeners, loops.
  }

  private setSpeaking(v: boolean): void {
    if (this.speaking === v) return;
    this.speaking = v;
    this.opts.onSpeakingChange?.(v);
  }
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
