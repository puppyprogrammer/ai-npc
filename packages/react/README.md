# ai-npc-react

React wrapper for [`ai-npc`](https://www.npmjs.com/package/ai-npc) — a **drop-in conversational 3D AI NPC**.
It talks (lip-synced, with emotion), walks where you point it, and sits/stands on any surface, automatically.
Bring your own LLM + voice keys.

```tsx
import { AiNpc } from 'ai-npc-react';

<AiNpc
  model="/avatar.vrm"
  systemPrompt="You are a friendly guide."
  brain={{ provider: 'openai', apiKey: KEY }}  // or anthropic / your own endpoint
  voice={{ provider: 'webspeech' }}            // zero-config, no key
/>
```

Imperative methods (`say`, `chat`, `walkTo`, `goTo`, `setMood`, …) are available via `ref`.

Peer deps: `react`, `react-dom`. Also needs `three` + `@pixiv/three-vrm` in your app.
Full docs, live demo, and source: **https://github.com/puppyprogrammer/ai-npc**. MIT.
