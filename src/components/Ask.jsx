import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, Sparkles, Quote, ChevronDown, Trash2, Copy } from 'lucide-react';
import { answerQuestion, shortTitle } from '../engine/nlp.js';
import { aiAnswer } from '../engine/llm.js';
import { Md, copyText } from './util.jsx';

const ONE = ['Explain it simply', "What's the price?", 'Any downsides?', 'What are the key numbers?'];
const MANY = ['Which one should I pick?', 'Which is cheapest?', "What's the main difference?", 'Compare battery life'];

function localToText(r) {
  return [r.intro, ...(r.groups || []).flatMap((g) => [g.title ? `**${g.title}**` : '', ...g.items.map((it) => `- ${it.text}`)])].filter(Boolean).join('\n');
}

export default function Ask({ list, aiOn, messages, setMessages, notify }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  const ask = async (q) => {
    const text = (q ?? input).trim();
    if (!text || busy || !list.length) return;
    setInput('');
    const history = messages;
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    const local = answerQuestion(text, list);
    const evidence = (local.groups || []).flatMap((g) => g.items).filter((it) => it.source).slice(0, 4);
    let msg;
    if (aiOn) {
      try {
        const answer = await aiAnswer(text, list, history);
        msg = { role: 'bot', mode: 'ai', text: answer, evidence };
      } catch (e) {
        msg = { role: 'bot', mode: 'local', text: localToText(local), evidence: [], note: `AI unavailable (${e.message}) — showing quotes from the page instead.` };
      }
    } else {
      await new Promise((r) => setTimeout(r, 250));
      msg = { role: 'bot', mode: 'local', text: localToText(local), evidence: [] };
    }
    setMessages((m) => [...m, msg]);
    setBusy(false);
  };

  const suggestions = list.length > 1 ? MANY : ONE;

  return (
    <div className="ask">
      <div className="ask-head">
        <h3><Bot size={16} /> Ask about {list.length > 1 ? 'these pages' : 'this page'}</h3>
        {messages.length > 0 && (
          <button className="icon-btn" onClick={() => setMessages([])} title="Clear chat" aria-label="Clear chat"><Trash2 size={15} /></button>
        )}
      </div>

      <div className="thread" ref={boxRef}>
        {messages.length === 0 && (
          <p className="muted small hello">
            Answers come only from {list.length > 1 ? `these ${list.length} pages` : 'this page'}. If it's not there, I'll tell you instead of guessing.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div className="q" key={i}>{m.text}</div>
          ) : (
            <div className="a" key={i}>
              <div className="a-tag">
                {m.mode === 'ai' ? <><Sparkles size={12} /> AI answer</> : <><Quote size={12} /> Quoted from the page</>}
                <button className="icon-btn tiny" onClick={async () => (await copyText(m.text)) && notify('Answer copied')} aria-label="Copy answer"><Copy size={12} /></button>
              </div>
              {m.note && <p className="note">{m.note}</p>}
              <Md text={m.text} />
              {m.evidence?.length > 0 && (
                <details>
                  <summary><ChevronDown size={13} /> Where this comes from ({m.evidence.length})</summary>
                  <ul>
                    {m.evidence.map((e, k) => (
                      <li key={k}>“{e.text}” <cite>{shortTitle(e.source)}</cite></li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )
        )}
        {busy && <div className="a typing"><i /><i /><i /></div>}
        <div ref={endRef} />
      </div>

      <div className="chips">
        {suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
      </div>
      <form className="ask-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" aria-label="Ask a question" />
        <button className="btn primary icon" disabled={!input.trim() || busy} aria-label="Send"><Send size={16} /></button>
      </form>
    </div>
  );
}
