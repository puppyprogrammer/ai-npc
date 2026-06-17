import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AiNpc } from 'ai-npc-react';
import type { AiNpcHandle } from 'ai-npc';

// Zero-config demo: type something, the avatar speaks it (browser Web Speech voice, no API key) with
// lip-sync. Drop any .vrm at public/avatar.vrm. Add a `brain` prop to enable real LLM chat.
export function App() {
  const npc = useRef<AiNpcHandle>(null);
  const [text, setText] = useState("Hi! I'm a drop-in AI NPC. Type anything and I'll say it.");
  const [speaking, setSpeaking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0e1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <AiNpc
          ref={npc}
          model="/avatar.vrm"
          voice={{ provider: 'webspeech' }}
          systemPrompt="You are a friendly NPC."
          onSpeakingChange={setSpeaking}
          style={{ position: 'absolute', inset: 0 }}
        />
        {err && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
            <div>
              <p style={{ opacity: 0.85 }}>Couldn't load the avatar.</p>
              <p style={{ opacity: 0.6, fontSize: 13 }}>Put a <code>.vrm</code> file at <code>apps/demo/public/avatar.vrm</code> and reload.</p>
              <p style={{ opacity: 0.5, fontSize: 12 }}>{err}</p>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 12px 0' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void say(); }}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3' }}
        />
        <button onClick={() => void say()} disabled={speaking}
          style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: speaking ? '#30363d' : '#2f81f7', color: '#fff', cursor: 'pointer' }}>
          {speaking ? 'Speaking…' : 'Speak'}
        </button>
      </div>
      {/* Debug controls for steps 2-4 — exercise mood, locomotion, and surface affordances. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 12 }}>
        {(['neutral', 'happy', 'sad', 'angry', 'surprised', 'thinking'] as const).map((m) => (
          <Btn key={m} onClick={() => npc.current?.setMood(m)}>{m}</Btn>
        ))}
        <Btn onClick={() => void npc.current?.walkTo(0.8, 0)}>walk →</Btn>
        <Btn onClick={() => void npc.current?.walkTo(-0.8, 0)}>walk ←</Btn>
        <Btn onClick={() => void npc.current?.goTo('sit').catch((e) => setErr(String(e)))}>sit (nearest)</Btn>
        <Btn onClick={() => void npc.current?.standUp()}>stand</Btn>
      </div>
      <p style={{ padding: '0 12px 12px', margin: 0, fontSize: 12, opacity: 0.6 }}>
        Voice = browser Web Speech (no key). Drop a VRM at <code>public/avatar.vrm</code>.
      </p>
    </div>
  );

  async function say() {
    setErr(null);
    try {
      await npc.current?.say(text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
}

function Btn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', cursor: 'pointer', fontSize: 13 }}>
      {children}
    </button>
  );
}
