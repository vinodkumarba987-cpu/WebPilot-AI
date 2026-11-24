import React, { useState } from 'react';
import { Sparkles, Quote, ThumbsUp, ThumbsDown, ExternalLink, Copy, Clock } from 'lucide-react';
import { aiSummary } from '../engine/llm.js';
import { useAI, Md, Skeleton, copyText, hostOf } from './util.jsx';

export default function Brief({ a, aiOn, notify }) {
  const ai = useAI('sum:' + a.id, aiOn, () => aiSummary(a));
  const [allSpecs, setAllSpecs] = useState(false);
  const specs = allSpecs ? a.specs : a.specs.slice(0, 8);
  const price = a.prices[0];
  const isDemo = a.url?.includes('demo.webpilot');

  const copy = async () => {
    const txt = [
      a.title,
      '',
      ai.status === 'done' ? ai.text : a.tldr,
      '',
      'Key points:',
      ...a.summary.map((s) => '- ' + s),
      ...(a.specs.length ? ['', 'Facts:', ...a.specs.map((s) => `- ${s.key}: ${s.value}`)] : []),
      ...(a.url && !isDemo ? ['', 'Source: ' + a.url] : []),
    ].join('\n');
    if (await copyText(txt)) notify('Brief copied');
  };

  return (
    <div className="brief fade-in" key={a.id}>
      <div className="brief-head">
        <div>
          <h2>{a.title}</h2>
          <div className="meta">
            {a.url && !isDemo ? (
              <a href={a.url} target="_blank" rel="noreferrer">{hostOf(a.url)} <ExternalLink size={12} /></a>
            ) : (
              <span>{isDemo ? 'Demo page' : 'Pasted text'}</span>
            )}
            <span><Clock size={12} /> {a.stats.readingMin} min read</span>
          </div>
        </div>
        <button className="btn ghost sm" onClick={copy}><Copy size={14} /> Copy</button>
      </div>

      <section className="inshort">
        <div className="label">
          {ai.status === 'done' ? <><Sparkles size={14} /> In short</> : <><Quote size={14} /> In short</>}
          {ai.status === 'done' && <span className="badge ai">AI summary</span>}
          {(ai.status === 'off' || ai.status === 'error') && <span className="badge quote">From the page</span>}
        </div>
        {ai.status === 'loading' && <Skeleton lines={3} />}
        {ai.status === 'done' && <Md text={ai.text} />}
        {(ai.status === 'off' || ai.status === 'error') && <p className="lead">{a.tldr || a.summary[0] || 'Not enough text to summarize.'}</p>}
      </section>

      {a.summary.length > 0 && (
        <section>
          <h3>Key points</h3>
          <ul className="points">{a.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}

      {(specs.length > 0 || price) && (
        <section>
          <h3>Quick facts</h3>
          {price && !a.specs.some((s) => s.norm === 'price') && (
            <p className="price-line">Price mentioned: <strong>{a.prices.slice(0, 3).map((p) => p.value).join(', ')}</strong></p>
          )}
          {specs.length > 0 && (
            <table className="facts">
              <tbody>{specs.map((s) => <tr key={s.key}><th>{s.key}</th><td>{s.value}</td></tr>)}</tbody>
            </table>
          )}
          {a.specs.length > 8 && (
            <button className="link-btn" onClick={() => setAllSpecs(!allSpecs)}>{allSpecs ? 'Show fewer' : `Show all ${a.specs.length} facts`}</button>
          )}
        </section>
      )}

      {(a.pros.length > 0 || a.cons.length > 0) && (
        <div className="proscons">
          <section className="pros">
            <h3><ThumbsUp size={14} /> Good</h3>
            {a.pros.length ? <ul>{a.pros.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted">Nothing specific mentioned.</p>}
          </section>
          <section className="cons">
            <h3><ThumbsDown size={14} /> Watch out</h3>
            {a.cons.length ? <ul>{a.cons.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted">Nothing specific mentioned.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
