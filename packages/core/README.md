# ai-npc

Framework-agnostic engine for a **drop-in conversational 3D AI NPC** on the web (Three.js): renders a
VRM, lip-syncs, emotes, walks to coordinates, and sits/lies/stands on any surface it finds ("if it fits,
I sits"). Bring your own LLM + voice (OpenAI / Anthropic / ElevenLabs / browser Web Speech / your own endpoint).

```ts
import { createNpc } from 'ai-npc';

const npc = createNpc({
  container: document.getElementById('stage')!,
  model: '/avatar.vrm',
  persona: { systemPrompt: 'You are a friendly guide.' },
  brain: { provider: 'openai', apiKey: KEY },
  voice: { provider: 'webspeech' }, // no key needed
});
await npc.init();
await npc.chat('Hi! Who are you?');
await npc.goTo('sit');
```

For React, use [`ai-npc-react`](https://www.npmjs.com/package/ai-npc-react). Full docs, demo, and source:
**https://github.com/puppyprogrammer/ai-npc**

Requires `three` (peer) and uses `@pixiv/three-vrm`. Builds on [TalkingHead](https://github.com/met4citizen/TalkingHead). MIT.
