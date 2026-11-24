import React, { useMemo } from 'react';
import { Sparkles, Trophy, ThumbsUp, ThumbsDown, Copy } from 'lucide-react';
import { compareDocs, shortTitle } from '../engine/nlp.js';
import { aiVerdict } from '../engine/llm.js';
import { useAI, Md, Skeleton, copyText } from './util.jsx';

export default function Comparison({ list, aiOn, notify }) {
  const cmp = useMemo(() => compareDocs(list), [list]);
  const ai = useAI('cmp:' + list.map((a) => a.id).join('|'), aiOn, () => aiVerdict(list));
  const rows = cmp.rows.filter((r) => r.spec || r.label === 'Main price found').map((r) => (r.label === 'Main price found' ? { ...r, label: 'Price' } : r));
  const priceRow = rows[0];
  const hasPrices = priceRow && priceRow.values.some((v) => v !== '—');
  const tableRows = hasPrices ? rows : rows.slice(1);

  // Local fallback "take": only facts from the pages.
  const fallback = list
    .map((a, i) => {
      const parts = [a.pros[0], priceRow?.best === i && `Lowest price (${priceRow.values[i]})`].filter(Boolean);
      return parts.length ? `**${shortTitle(a.title)}:** ${parts.join(' · ')}` : null;
    })
    .filter(Boolean);

  const copy = async () => {
    const head = ['', ...list.map((a) => shortTitle(a.title))].join(' | ');
    const body = tableRows.map((r) => [r.label, ...r.values].join(' | ')).join('\n');
    if (await copyText(`${ai.status === 'done' ? ai.text + '\n\n' : ''}${head}\n${body}`)) notify('Comparison copied');
  };

  return (
    <div className="brief fade-in">
      <div className="brief-head">
        <div>
          <h2>Comparing {list.length} pages</h2>
          <div className="meta"><span>{list.map((a) => shortTitle(a.title)).join(' · ')}</span></div>
        </div>
        <button className="btn ghost sm" onClick={copy}><Copy size={14} /> Copy</button>
      </div>

      <section className="inshort">
        <div className="label">
          <Sparkles size={14} /> Our take
          {ai.status === 'done' && <span className="badge ai">AI verdict</span>}
          {(ai.status === 'off' || ai.status === 'error') && <span className="badge quote">From the pages</span>}
        </div>
        {ai.status === 'loading' && <Skeleton lines={4} />}
        {ai.status === 'done' && <Md text={ai.text} />}
        {(ai.status === 'off' || ai.status === 'error') &&
          (fallback.length ? <Md text={fallback.map((l) => '- ' + l).join('\n')} /> : <p className="muted">Turn on AI for a recommendation, or ask a question below.</p>)}
      </section>

      {tableRows.length > 0 ? (
        <section>
          <h3>Side by side</h3>
          <div className="table-scroll">
            <table className="cmp">
              <thead>
                <tr><th />{list.map((a) => <th key={a.id}>{shortTitle(a.title)}</th>)}</tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.label}>
                    <th>{r.label}</th>
                    {r.values.map((v, i) => (
                      <td key={i} className={r.best === i ? 'best' : ''}>
                        {v}
                        {r.best === i && <span className="best-tag"><Trophy size={11} /> Lowest</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="muted">These pages don't list matching specs, so there's no table. Ask a question below to compare them.</p>
      )}

      <section>
        <h3>Strengths and weak spots</h3>
        <div className="cols">
          {list.map((a) => (
            <div className="col" key={a.id}>
              <strong>{shortTitle(a.title)}</strong>
              {a.pros.slice(0, 3).map((s, i) => <p key={'p' + i} className="pro-line"><ThumbsUp size={13} /> {s}</p>)}
              {a.cons.slice(0, 3).map((s, i) => <p key={'c' + i} className="con-line"><ThumbsDown size={13} /> {s}</p>)}
              {!a.pros.length && !a.cons.length && <p className="muted small">None mentioned on this page.</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
