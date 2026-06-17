// Minimal ai-npc example — a talking AI NPC with zero backend and no API key (browser TTS).
// Swap `voice`/`brain` for OpenAI/Anthropic/ElevenLabs/your-own-endpoint when you're ready.

import { useRef } from 'react';
import { AiNpc } from 'ai-npc-react';
import type { AiNpcHandle } from 'ai-npc';

export function Demo() {
  const npc = useRef<AiNpcHandle>(null);

  return (
    <div style={{ width: 480, height: 640 }}>
      <AiNpc
        ref={npc}
        model="/eve.vrm"
        systemPrompt="You are Eve, a warm and curious guide. Keep replies short and friendly."
        brain={{ provider: 'openai', apiKey: import.meta.env.VITE_OPENAI_KEY }}
        voice={{ provider: 'webspeech' }} // no key needed
      />
      <button onClick={() => npc.current?.chat('Hi! Who are you?')}>Say hi</button>
      <button onClick={() => npc.current?.goTo('sit')}>Find somewhere to sit</button>
    </div>
  );
}
