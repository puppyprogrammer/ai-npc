// Built-in Brain + Voice adapters. These are fully working today (they don't depend on the avatar
// engine). They turn the friendly config objects in types.ts into the Brain/Voice interfaces.
//
// NOTE on keys: passing apiKey to a browser-side adapter ships that key to the client. Fine for
// local/demos/trusted use; for production, prefer `{ provider: 'endpoint', url }` and keep keys
// (and anything like AWS Polly that must be signed server-side) behind your own server.

import type { Brain, Voice, Speech, ChatMessage, BrainConfig, VoiceConfig } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

// ── Brains ──────────────────────────────────────────────────────────────────────────────────

function openAiBrain(cfg: { apiKey: string; model?: string; baseUrl?: string }): Brain {
  const base = cfg.baseUrl ?? 'https://api.openai.com/v1';
  return {
    async respond({ messages, signal }) {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model ?? 'gpt-4o-mini', messages }),
        signal,
      });
      if (!r.ok) throw new Error(`openai brain ${r.status}: ${await r.text()}`);
      const d = await r.json();
      return d.choices?.[0]?.message?.content ?? '';
    },
  };
}

function anthropicBrain(cfg: { apiKey: string; model?: string; baseUrl?: string }): Brain {
  const base = cfg.baseUrl ?? 'https://api.anthropic.com/v1';
  return {
    async respond({ messages, signal }) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const turns = messages.filter((m) => m.role !== 'system');
      const r = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model ?? 'claude-3-5-haiku-latest',
          max_tokens: 1024,
          system: system || undefined,
          messages: turns.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal,
      });
      if (!r.ok) throw new Error(`anthropic brain ${r.status}: ${await r.text()}`);
      const d = await r.json();
      return d.content?.[0]?.text ?? '';
    },
  };
}

function endpointBrain(cfg: { url: string; headers?: Record<string, string> }): Brain {
  return {
    async respond({ messages, signal }) {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body: JSON.stringify({ messages } satisfies { messages: ChatMessage[] }),
        signal,
      });
      if (!r.ok) throw new Error(`endpoint brain ${r.status}: ${await r.text()}`);
      const d = await r.json();
      return typeof d === 'string' ? d : (d.text ?? d.reply ?? d.content ?? '');
    },
  };
}

export function resolveBrain(cfg: BrainConfig | undefined): Brain | null {
  if (!cfg) return null;
  if ('respond' in cfg && typeof cfg.respond === 'function') return cfg;
  if (isObj(cfg) && 'provider' in cfg) {
    switch (cfg.provider) {
      case 'openai': return openAiBrain(cfg as never);
      case 'anthropic': return anthropicBrain(cfg as never);
      case 'endpoint': return endpointBrain(cfg as never);
    }
  }
  throw new Error('ai-npc: unrecognized brain config');
}

// ── Voices ──────────────────────────────────────────────────────────────────────────────────

/** Browser SpeechSynthesis — zero-config, no key. Great default + demo. Plays directly; the engine
 *  estimates lip-sync from timing since the Web Speech API gives no audio buffer. */
const FEMALE_VOICE_RE = /zira|aria|jenny|michelle|eva|samantha|victoria|susan|hazel|catherine|fiona|female|woman/i;
const MALE_VOICE_RE = /david|mark|guy|alex|daniel|fred|george|james|male\b|\bman\b/i;

function webSpeechVoice(cfg: { voice?: string; prefer?: 'female' | 'male'; rate?: number; pitch?: number }): Voice {
  return {
    speak(text) {
      return new Promise<Speech>((resolve, reject) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
          return reject(new Error('Web Speech API not available'));
        }
        const u = new SpeechSynthesisUtterance(text);
        if (cfg.rate) u.rate = cfg.rate;
        if (cfg.pitch) u.pitch = cfg.pitch;
        const voices = window.speechSynthesis.getVoices();
        // Pick a voice: explicit name (substring) → gender preference → leave OS default.
        let chosen: SpeechSynthesisVoice | undefined;
        if (cfg.voice) chosen = voices.find((x) => x.name.toLowerCase().includes(cfg.voice!.toLowerCase()));
        if (!chosen && cfg.prefer === 'female') chosen = voices.find((x) => FEMALE_VOICE_RE.test(x.name));
        if (!chosen && cfg.prefer === 'male') chosen = voices.find((x) => MALE_VOICE_RE.test(x.name));
        if (!chosen && cfg.prefer) {
          // fall back: pick an en voice that isn't the other gender
          const other = cfg.prefer === 'female' ? MALE_VOICE_RE : FEMALE_VOICE_RE;
          chosen = voices.find((x) => /^en[-_]/i.test(x.lang) && !other.test(x.name));
        }
        if (chosen) u.voice = chosen;
        // Web Speech plays itself and yields no buffer; hand back a no-op audio + duration estimate
        // (~14 chars/sec) so the engine can drive a generic talking mouth-flap.
        const durationMs = Math.max(700, (text.length / 14) * 1000);
        u.onerror = (e) => reject(new Error(`webspeech: ${e.error}`));
        window.speechSynthesis.speak(u);
        resolve({ audio: new Audio(), durationMs });
      });
    },
  };
}

function elevenLabsVoice(cfg: { apiKey: string; voiceId: string; modelId?: string }): Voice {
  return {
    async speak(text, opts) {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': cfg.apiKey },
        body: JSON.stringify({ text, model_id: cfg.modelId ?? 'eleven_turbo_v2_5' }),
        signal: opts?.signal,
      });
      if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${await r.text()}`);
      return { audio: await r.arrayBuffer() };
    },
  };
}

function openAiVoice(cfg: { apiKey: string; voice?: string; model?: string }): Voice {
  return {
    async speak(text, opts) {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model ?? 'gpt-4o-mini-tts', voice: cfg.voice ?? 'alloy', input: text }),
        signal: opts?.signal,
      });
      if (!r.ok) throw new Error(`openai tts ${r.status}: ${await r.text()}`);
      return { audio: await r.arrayBuffer() };
    },
  };
}

/** Bring-your-own server endpoint. The right place for AWS Polly etc. (sign server-side). Your
 *  endpoint receives { text } and returns audio bytes (and may return viseme timing via headers). */
function endpointVoice(cfg: { url: string; headers?: Record<string, string> }): Voice {
  return {
    async speak(text, opts) {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body: JSON.stringify({ text }),
        signal: opts?.signal,
      });
      if (!r.ok) throw new Error(`endpoint voice ${r.status}: ${await r.text()}`);
      return { audio: await r.arrayBuffer() };
    },
  };
}

export function resolveVoice(cfg: VoiceConfig | undefined): Voice | null {
  if (!cfg) return null;
  if ('speak' in cfg && typeof cfg.speak === 'function') return cfg;
  if (isObj(cfg) && 'provider' in cfg) {
    switch (cfg.provider) {
      case 'webspeech': return webSpeechVoice(cfg as never);
      case 'elevenlabs': return elevenLabsVoice(cfg as never);
      case 'openai': return openAiVoice(cfg as never);
      case 'endpoint': return endpointVoice(cfg as never);
    }
  }
  throw new Error('ai-npc: unrecognized voice config');
}
