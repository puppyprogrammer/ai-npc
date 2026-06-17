# ai-npc

> Drop a conversational, animated **3D AI NPC** into any web app or Three.js game — it talks (lip-synced, with emotion), walks where you point it, and **sits / lies / stands on whatever's around, automatically.** Bring your own LLM + voice keys.

![An ai-npc avatar in a 3D scene](assets/hero.png)

```tsx
import { AiNpc } from 'ai-npc-react';

<AiNpc
  model="/avatar.vrm"
  systemPrompt="You are a friendly guide."
  brain={{ provider: 'openai', apiKey: KEY }}   // or anthropic, or your own endpoint
  voice={{ provider: 'webspeech' }}             // zero-config default — no key needed
/>
```

That's it. No backend required to try it.

**Status: working alpha.** Rendering, lip-sync, emotion/idle/speaking body language, walk-to-coordinate
locomotion, and procedural surface affordances (sit/stand) are all **functional** — and the engine runs
**in production**, driving the avatar in [CommsLink Chat](https://commslink.net/chat). The API may still
shift, and the motion/IK are being refined, but it works today.

## Why it's different

Most "talking avatar" tools give you a lip-syncing head. `ai-npc` is an **embodied NPC**:

- **"If it fits, I sits."** Instead of authoring an interaction per object, the engine scans the scene for
  surfaces and figures out affordances *procedurally* — enough flat area at the right height → it can sit
  there; enough to lie down → it can sleep there; tall enough → it can climb on. A desk, a crate, a rock —
  it doesn't matter what the object *is*. Animations are authored once for a flat surface and adapted to
  whatever it finds.
- **Believable body language**, not a stiff head — emotion-driven gestures and idle motion (a "movement
  director" that drives the body from affect, separate from the words).
- **Bring-your-own-everything.** Pluggable LLM and TTS: built-in adapters for OpenAI / Anthropic /
  ElevenLabs / the browser's free Web Speech, or plug your own server endpoint (e.g. AWS Polly). The
  library never holds your keys or your data.
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

```tsx
import { useRef } from 'react';
import { AiNpc } from 'ai-npc-react';
import type { AiNpcHandle } from 'ai-npc';

const npc = useRef<AiNpcHandle>(null);

<AiNpc ref={npc} model="/avatar.vrm" voice={{ provider: 'webspeech' }} />
// npc.current?.say('Hi there!')
// npc.current?.walkTo(2, 0)
// npc.current?.goTo('sit')     // walks to the nearest sittable surface and sits
// npc.current?.setMood('happy')
```

Run the live demo locally:

```bash
git clone https://github.com/puppyprogrammer/ai-npc && cd ai-npc
npm install && npm run dev:demo   # type text → the avatar speaks it, no API key
```

## Bring your own providers

```ts
voice={{ provider: 'webspeech' }}                                  // zero-config, no key
brain={{ provider: 'anthropic', apiKey: process.env.ANTHROPIC_KEY }}
voice={{ provider: 'elevenlabs', apiKey: KEY, voiceId: '…' }}
voice={{ provider: 'endpoint', url: '/api/tts' }}                  // your server (e.g. AWS Polly)
```

## Credits

The rendering foundation builds on [**TalkingHead** by met4citizen](https://github.com/met4citizen/TalkingHead)
and [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm). See [`NOTICE`](NOTICE).

## License

[MIT](LICENSE).
