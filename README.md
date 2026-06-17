# ai-npc

> Drop a conversational, animated **3D AI NPC** into any web app or Three.js game — it talks (lip-synced, with emotion), walks where you point it, and **sits / lies / stands on whatever's around, automatically.** Bring your own LLM + voice keys.

<!-- TODO: demo GIF goes here — it's the single most important thing in this README -->
**🚧 Status: early development.** The public API and architecture are defined; the avatar engine is being ported from a production agent ("Eve"). Brain/voice adapters work today; rendering + the affordance system are in progress.

```tsx
import { AiNpc } from 'ai-npc-react';

<AiNpc
  model="/eve.vrm"
  systemPrompt="You are a friendly guide."
  brain={{ provider: 'openai', apiKey: KEY }}   // or anthropic, or your own endpoint
  voice={{ provider: 'webspeech' }}             // zero-config default — no key needed
/>
```

That's it. No backend required to try it.

## Why it's different

Most "talking avatar" tools give you a lip-syncing head. `ai-npc` is an **embodied NPC**:

- **"If it fits, I sits."** Instead of authoring an interaction per object, the engine scans the scene for surfaces and figures out affordances *procedurally* — enough flat area at the right height → it can sit cross-legged there; enough to lie down → it can sleep there; tall enough → it can climb on. A desk, a crate, a rock — it doesn't matter what the object *is*. Animations are authored once for a canonical flat surface and IK-adapted to whatever it finds.
- **Believable body language**, not a stiff head — emotion-driven gestures and idle motion (a "movement director" that drives the body from affect, separate from the words).
- **Bring-your-own-everything.** Pluggable LLM and TTS: built-in adapters for OpenAI / Anthropic / ElevenLabs / the browser's free Web Speech, or plug your own server endpoint (e.g. AWS Polly). The library never holds your keys or your data.
- **Web-native + framework-agnostic core** with a thin React wrapper. Vue/Svelte/vanilla are easy to add.

## Packages

| Package | What |
|---|---|
| [`ai-npc`](packages/core) | Framework-agnostic engine (Three.js). Render, lip-sync, emotion/movement, navigation, affordances, IK, pluggable brain/voice. |
| [`ai-npc-react`](packages/react) | Thin React wrapper — `<AiNpc />`. |

## Quickstart

```bash
npm install ai-npc-react   # React, or `ai-npc` for the framework-agnostic core
```

See [`examples/`](examples) and the [live demo](apps/demo) (`apps/demo`).

## Bring your own providers

```ts
// Zero-config (browser TTS, no key) — great for trying it:
voice={{ provider: 'webspeech' }}

// BYOK simple API keys:
brain={{ provider: 'anthropic', apiKey: process.env.ANTHROPIC_KEY }}
voice={{ provider: 'elevenlabs', apiKey: process.env.ELEVENLABS_KEY, voiceId: '…' }}

// Bring your own server (e.g. AWS Polly, which must be signed server-side):
voice={{ provider: 'endpoint', url: '/api/tts' }}
brain={{ provider: 'endpoint', url: '/api/chat' }}
```

## Credits

The rendering foundation builds on [**TalkingHead** by met4citizen](https://github.com/met4citizen/TalkingHead) and [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm). See [`NOTICE`](NOTICE).

## License

[MIT](LICENSE).
