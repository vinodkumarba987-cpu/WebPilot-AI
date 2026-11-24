import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Sun, Moon, Link2, ArrowRight, Loader2, X, AlertCircle, Plus, Sparkles, Bookmark, Laptop, BookOpen, FileText, Globe } from 'lucide-react';
import { analyze, shortTitle } from './engine/nlp.js';
import { fetchPage, htmlToText, looksLikeHtml } from './engine/fetcher.js';
import { SAMPLES } from './data/samples.js';
import Brief from './components/Brief.jsx';
import Comparison from './components/Comparison.jsx';
import Ask from './components/Ask.jsx';
import ClipModal from './components/ClipButton.jsx';
import AiMenu from './components/AiMenu.jsx';
import { activeProvider } from './engine/llm.js';

function usePersist(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s != null ? JSON.parse(s) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* storage blocked or full */
    }
  }, [key, val]);
  return [val, setVal];
}

const uid = () => Math.random().toString(36).slice(2, 10);
const URLISH = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

export default function App() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const [theme, setTheme] = usePersist('wp2-theme', prefersDark ? 'dark' : 'light');
  const [pages, setPages] = usePersist('wp2-pages', []);
  const [messages, setMessages] = usePersist('wp2-chat', []);
  const [aiEnabled, setAiEnabled] = usePersist('wp2-ai', true);
  const [provider, setProvider] = useState(null);
  const refreshAI = () => activeProvider().then(setProvider);
  useEffect(() => { refreshAI(); }, []);
  const aiOn = !!provider && aiEnabled;
  const [tab, setTab] = useState('compare');
  const [clipOpen, setClipOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  // pages that were still loading when the tab closed can't resume
  useEffect(() => {
    setPages((ps) => ps.filter((p) => p.status === 'ready'));
  }, []); // eslint-disable-line

  const notify = useCallback((msg) => setToast({ msg, k: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const update = (id, patch) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addReady = (p) => {
    const page = { id: uid(), status: 'ready', ...p };
    setPages((ps) => [...ps, page]);
    setTab(page.id);
    setMessages([]);
    return page;
  };

  const addUrl = async (raw) => {
    const id = uid();
    let host = raw;
    try {
      host = new URL(/^https?:/i.test(raw) ? raw : 'https://' + raw).hostname;
    } catch { /* keep raw */ }
    setPages((ps) => [...ps, { id, status: 'loading', title: host, url: raw }]);
    setMessages([]);
    try {
      const page = await fetchPage(raw);
      update(id, { status: 'ready', title: page.title, url: page.url, raw: page.raw, source: 'url' });
      setTab(id);
    } catch (e) {
      update(id, { status: 'error', error: e.message });
    }
  };

  const submit = (text) => {
    const tokens = text.trim().split(/\s+/);
    if (tokens.length && tokens.every((t) => URLISH.test(t))) {
      tokens.slice(0, 5).forEach(addUrl);
      return;
    }
    if (text.trim().split(/\s+/).length < 15) {
      notify('Paste a link, or at least a paragraph of text.');
      return false;
    }
    let content = text, title = '';
    if (looksLikeHtml(text)) ({ title, text: content } = htmlToText(text));
    title = title || content.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 70);
    addReady({ title, url: '', raw: content, source: 'paste' });
  };

  const loadDemo = () => {
    const missing = SAMPLES.filter((s) => !pages.some((p) => p.title === s.title));
    missing.forEach((s) => addReady({ title: s.title, url: s.url, raw: s.raw, source: 'sample' }));
    setTab('compare');
  };
  const remove = (id) => {
    setPages((ps) => ps.filter((p) => p.id !== id));
    setMessages([]);
  };
  const clearAll = () => {
    setPages([]);
    setMessages([]);
  };

  // Receive pages sent by the "WebPilot it" bookmark button.
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (location.hash !== '#clip' || !d || d.type !== 'webpilot-page' || typeof d.text !== 'string') return;
      history.replaceState(null, '', location.pathname + location.search);
      e.source?.postMessage('webpilot-ack', '*');
      if (d.text.trim().split(/\s+/).length < 15) return notify('That page had almost no readable text.');
      addReady({ title: String(d.title || 'Web page').slice(0, 200), url: String(d.url || ''), raw: d.text.slice(0, 200000), source: 'clip' });
      notify('Page received from your browser');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []); // eslint-disable-line

  const ready = pages.filter((p) => p.status === 'ready' && p.raw);
  const analyses = useMemo(() => ready.map((p) => analyze(p)), [ready.map((p) => p.id).join('|')]); // eslint-disable-line
  const failed = pages.filter((p) => p.status === 'error');
  const loading = pages.some((p) => p.status === 'loading');
  const multi = analyses.length > 1;
  const current = analyses.find((a) => a.id === tab);
  const view = multi && (!current || tab === 'compare') ? 'compare' : 'one';
  const single = current || analyses[0];

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={clearAll} title="Start over">
          <span className="logo"><Compass size={18} /></span> WebPilot
        </button>
        <div className="top-actions">
          <AiMenu provider={provider} enabled={aiEnabled} setEnabled={setAiEnabled} onChange={refreshAI} />
          <button className="btn ghost sm hide-xs" onClick={() => setClipOpen(true)}><Bookmark size={14} /> Use on any site</button>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {pages.length === 0 ? (
        <main className="hero">
          <div className="hero-inner fade-in">
            <span className="eyebrow"><Sparkles size={13} /> Your web research co-pilot</span>
            <h1>Understand any webpage<br />in seconds.</h1>
            <p className="sub">Paste a link to get the essentials. Paste a few links to compare them. Then ask anything — answers come only from the page.</p>
            <AddBar onSubmit={submit} big />
            <div className="try">
              <span>Try:</span>
              <button onClick={loadDemo}><Laptop size={14} /> Compare 3 laptops</button>
              <button onClick={() => addUrl('https://en.wikipedia.org/wiki/Web_browser')}><BookOpen size={14} /> A Wikipedia article</button>
              <button onClick={() => setClipOpen(true)}><Bookmark size={14} /> Use on any site</button>
            </div>
            <div className="how">
              <div><b>1</b> Paste a link or text</div>
              <div><b>2</b> Get a summary &amp; key facts</div>
              <div><b>3</b> Compare &amp; ask questions</div>
            </div>
          </div>
        </main>
      ) : (
        <main className="work">
          <div className="pagebar fade-in">
            <div className="tabs">
              {multi && (
                <button className={'tab' + (view === 'compare' ? ' on' : '')} onClick={() => setTab('compare')}>
                  <Sparkles size={14} /> Compare all
                </button>
              )}
              {pages.map((p) => (
                <div key={p.id} className={'tab page ' + p.status + (view === 'one' && single?.id === p.id ? ' on' : '')} title={p.error || p.url || p.title}>
                  <button onClick={() => p.status === 'ready' && setTab(p.id)}>
                    {p.status === 'loading' ? <Loader2 size={14} className="spin" /> : p.status === 'error' ? <AlertCircle size={14} /> : p.source === 'paste' ? <FileText size={14} /> : <Globe size={14} />}
                    <span>{p.status === 'loading' ? 'Reading ' + p.title + '…' : shortTitle(p.title)}</span>
                  </button>
                  <button className="x" onClick={() => remove(p.id)} aria-label={'Remove ' + p.title}><X size={13} /></button>
                </div>
              ))}
            </div>
            <AddBar onSubmit={submit} />
          </div>

          {failed.length > 0 && (
            <div className="alert fade-in">
              <AlertCircle size={16} />
              <div>
                <b>Couldn't open {failed.map((p) => p.title).join(', ')}.</b> Some sites block outside readers. Open the page and use the{' '}
                <button className="link-btn" onClick={() => setClipOpen(true)}>WebPilot it button</button>, or copy the page text and paste it above.
              </div>
            </div>
          )}

          {analyses.length === 0 ? (
            loading ? (
              <div className="reading fade-in"><Loader2 size={20} className="spin" /> Reading the page…</div>
            ) : (
              <div className="reading">Add a page above to get started.</div>
            )
          ) : (
            <div className="grid">
              <div className="panel">
                {view === 'compare' ? (
                  <Comparison list={analyses} aiOn={aiOn} notify={notify} />
                ) : (
                  <Brief a={single} aiOn={aiOn} notify={notify} />
                )}
                {!multi && !loading && (
                  <button className="add-hint" onClick={() => document.querySelector('.addbar input')?.focus()}>
                    <Plus size={14} /> Add another link to compare
                  </button>
                )}
              </div>
              <div className="panel side">
                <Ask list={view === 'compare' ? analyses : [single]} aiOn={aiOn} messages={messages} setMessages={setMessages} notify={notify} />
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="foot">
        {aiOn && provider === 'gemini'
          ? 'AI: page text is sent to Google Gemini with your key. '
          : aiOn
          ? 'AI runs on your device. '
          : 'Analysis runs in your browser. '}
        Links are fetched through public readers (r.jina.ai / allorigins). The “WebPilot it” button skips them.
      </footer>

      {clipOpen && <ClipModal onClose={() => setClipOpen(false)} />}
      {toast && <div className="toast" key={toast.k}>{toast.msg}</div>}
    </div>
  );
}

function AddBar({ onSubmit, big }) {
  const [v, setV] = useState('');
  const ref = useRef(null);
  const go = (e) => {
    e?.preventDefault();
    if (!v.trim()) return;
    if (onSubmit(v) !== false) setV('');
  };
  return (
    <form className={'addbar' + (big ? ' big' : '')} onSubmit={go}>
      <Link2 size={big ? 20 : 16} />
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onPaste={(e) => {
          // long pasted text: keep it, but don't cram it into a one-line box visually
          const t = e.clipboardData.getData('text');
          if (t.length > 300) {
            e.preventDefault();
            onSubmit(t);
          }
        }}
        placeholder={big ? 'Paste a link (or a few), or paste page text…' : 'Add a link or paste text…'}
        aria-label="Link or text"
        autoFocus={big}
      />
      <button className="btn primary">{big ? <>Go <ArrowRight size={16} /></> : <Plus size={16} />}</button>
    </form>
  );
}
