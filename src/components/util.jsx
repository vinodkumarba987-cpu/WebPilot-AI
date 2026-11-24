import React, { useEffect, useState } from 'react';

/** Run an AI request when enabled; returns {status: off|loading|done|error, text, error}. */
export function useAI(key, enabled, run) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'off' });
  useEffect(() => {
    if (!enabled) {
      setState({ status: 'off' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    run()
      .then((text) => alive && setState({ status: 'done', text }))
      .catch((e) => alive && setState({ status: 'error', error: e.message }));
    return () => {
      alive = false;
    };
  }, [key, enabled]); // eslint-disable-line
  return state;
}

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
  );
}

/** Tiny, safe Markdown renderer for AI output (paragraphs, bullets, bold). */
export function Md({ text }) {
  const out = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const m = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!list) {
        list = [];
        out.push(<ul key={'u' + i}>{list}</ul>);
      }
      list.push(<li key={i}>{inline(m[1])}</li>);
      return;
    }
    list = null;
    if (!line || /^\|?[\s:-]+\|[\s:|-]*$/.test(line)) return;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    out.push(h ? <p key={i}><strong>{inline(h[1])}</strong></p> : <p key={i}>{inline(line.replace(/^\||\|$/g, '').replace(/\s\|\s/g, ' · '))}</p>);
  });
  return <div className="md">{out}</div>;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
