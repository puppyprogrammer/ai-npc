import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createNpc } from 'ai-npc';
import type { AiNpcHandle, BrainConfig, VoiceConfig, AffordanceConfig, Anchor } from 'ai-npc';

export type AiNpcProps = {
  /** URL to a .vrm / .glb avatar model. */
  model: string;
  /** Persona / system prompt. */
  systemPrompt?: string;
  name?: string;
  brain?: BrainConfig;
  voice?: VoiceConfig;
  affordances?: AffordanceConfig;
  anchors?: Anchor[];
  /** Fired when the NPC starts/stops speaking. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Fired once after the model is loaded — add world geometry to the ref's `scene` then call `rescanAffordances()`. */
  onReady?: () => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * `<AiNpc />` — mounts a conversational 3D AI NPC.
 *
 * ```tsx
 * import { AiNpc } from 'ai-npc-react';
 *
 * <AiNpc
 *   model="/eve.vrm"
 *   systemPrompt="You are a friendly guide."
 *   brain={{ provider: 'openai', apiKey: KEY }}
 *   voice={{ provider: 'webspeech' }}
 * />
 * ```
 *
 * Imperative methods (say/chat/walkTo/goTo/…) are exposed via ref.
 */
export const AiNpc = forwardRef<AiNpcHandle | null, AiNpcProps>(function AiNpc(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const npcRef = useRef<AiNpcHandle | null>(null);

  // Stable handle that delegates to the live engine at call time. (The engine is created async in the
  // effect below, so we must NOT capture npcRef.current once — that would freeze it to null.)
  useImperativeHandle(ref, (): AiNpcHandle => ({
    init: () => npcRef.current?.init() ?? Promise.resolve(),
    say: (t) => npcRef.current?.say(t) ?? Promise.resolve(),
    chat: (t) => npcRef.current?.chat(t) ?? Promise.resolve(''),
    walkTo: (x, z) => npcRef.current?.walkTo(x, z) ?? Promise.resolve(),
    goTo: (a, t) => npcRef.current?.goTo(a, t) ?? Promise.resolve(),
    standUp: () => npcRef.current?.standUp() ?? Promise.resolve(),
    setMood: (m) => npcRef.current?.setMood(m),
    lookAt: (t) => npcRef.current?.lookAt(t),
    getAffordances: () => npcRef.current?.getAffordances() ?? [],
    rescanAffordances: () => npcRef.current?.rescanAffordances() ?? [],
    dispose: () => npcRef.current?.dispose(),
    get scene() { return npcRef.current?.scene ?? null; },
  }), []);

  // Re-create the NPC when the model changes (cheap props like systemPrompt are read on next call).
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    const npc = createNpc({
      container: containerRef.current,
      model: props.model,
      persona: { systemPrompt: props.systemPrompt, name: props.name },
      brain: props.brain,
      voice: props.voice,
      affordances: props.affordances,
      anchors: props.anchors,
      onSpeakingChange: props.onSpeakingChange,
      onReady: props.onReady,
    });
    npcRef.current = npc;
    void npc.init();
    return () => {
      disposed = true;
      npc.dispose();
      npcRef.current = null;
      void disposed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.model]);

  return <div ref={containerRef} className={props.className} style={{ width: '100%', height: '100%', ...props.style }} />;
});
