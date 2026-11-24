import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Cpu, KeyRound, Check, ExternalLink } from 'lucide-react';
import { chromeAIStatus, getKey, setKey } from '../engine/llm.js';

const CHROME_LABEL = {
  available: ['Ready', 'ok'],
  downloadable: ['Downloads on first use', 'ok'],
  downloading: ['Downloading…', 'ok'],
  unavailable: ['Not available in this browser', 'off'],
};

export default function AiMenu({ provider, enabled, setEnabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [chrome, setChrome] = useState('unavailable');
  const [key, setKeyInput] = useState(getKey());
  const ref = useRef(null);

  useEffect(() => {
    chromeAIStatus().then(setChrome);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const active = provider && enabled;
  const label = !provider ? 'AI: off' : !enabled ? 'AI: paused' : provider === 'chrome' ? 'AI: on-device' : 'AI: Gemini';

  return (
    <div className="ai-menu" ref={ref}>
      <button className={'ai-btn' + (active ? ' on' : '')} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Sparkles size={14} /> <span>{label}</span>
      </button>
      {open && (
        <div className="ai-pop fade-in">
          <h4>Smarter answers with AI</h4>
          <p className="muted small">
            Without AI, WebPilot still summarizes, compares and answers by quoting the page. With AI, you get answers in plain language. The AI only sees the page text.
          </p>

          <div className="ai-opt">
            <Cpu size={16} />
            <div>
              <b>On-device AI (Chrome)</b>
              <span className={'st ' + CHROME_LABEL[chrome]?.[1]}>{CHROME_LABEL[chrome]?.[0] || chrome}</span>
              <small>Free and private. Runs on your computer in recent desktop Chrome.</small>
            </div>
          </div>

          <div className="ai-opt">
            <KeyRound size={16} />
            <div>
              <b>Free Gemini key</b>
              {getKey() && <span className="st ok"><Check size={11} /> Saved</span>}
              <small>
                Works in any browser. Get a free key at{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com <ExternalLink size={11} /></a>. It's stored only in this browser.
              </small>
              <form
                className="key-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  setKey(key);
                  onChange();
                }}
              >
                <input type="password" value={key} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste API key" aria-label="Gemini API key" autoComplete="off" />
                <button className="btn primary sm" disabled={!key.trim() || key === getKey()}>Save</button>
                {getKey() && (
                  <button type="button" className="btn ghost sm" onClick={() => { setKey(''); setKeyInput(''); onChange(); }}>Remove</button>
                )}
              </form>
            </div>
          </div>

          {provider && (
            <label className="use-ai">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Use AI for summaries and answers
            </label>
          )}
        </div>
      )}
    </div>
  );
}
