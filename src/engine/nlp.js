// WebPilot local intelligence engine.
// 100% in-browser, deterministic and *extractive*: every summary line, fact and
// answer is copied from the supplied page text, so it cannot invent information.

const STOP = new Set(`a about above after again against all am an and any are as at be because been before
being below between both but by can could did do does doing down during each few for from further had has have
having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no
nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the
their theirs them themselves then there these they this those through to too under until up very was we were what
when where which while who whom why will with would you your yours yourself yourselves also may might must shall
cant wont its im youre were theyre theres thats lets get got one new use used using via per etc yes like make made
many much even well back way within without upon however every each another our us any both still yet into onto
than just across around among whether whose www http https com html`.split(/\s+/));

const QUESTION_STOP = new Set(`what which does how much many tell about give list show explain describe find
please know want need is are the can could would should whats who when where why do did there any compare
difference between versus info information detail details`.split(/\s+/));

const SYNONYMS = {
  cost: ['price'], price: ['cost', 'priced'], cheap: ['price', 'affordable'], cheapest: ['price'],
  expensive: ['price'], weight: ['weigh', 'lightweight', 'kg'], heavy: ['weight'], light: ['weight', 'lightweight'],
  screen: ['display'], display: ['screen'], cpu: ['processor', 'chip'], processor: ['cpu', 'chip', 'core'],
  ram: ['memory'], memory: ['ram'], storage: ['ssd'], ssd: ['storage'], battery: ['hour', 'wh'],
  warranty: ['guarantee'], release: ['launch', 'available'], launch: ['release', 'available'],
};

export function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export function tokenize(text, keepStop = false) {
  const raw = (text.toLowerCase().match(/[a-z0-9][a-z0-9'+#.-]*[a-z0-9+#]|[a-z0-9]/g) || [])
    .map((t) => t.replace(/'s$/, '').replace(/'/g, ''));
  return raw.filter((t) => t && (keepStop || (!STOP.has(t) && (t.length > 2 || /\d/.test(t)))));
}

/* ------------------------------------------------------------------ parsing */

export function cleanMarkdown(raw) {
  return raw
    .replace(/\r/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[[^\]]*\]\]\([^)]*\)/g, '') // wiki-style citation links [[5]](url)
    .replace(/\[(?:\d+|[a-z]|citation needed|note \d+)\]/gi, '')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/<?https?:\/\/[^\s)>]+>?/g, '')
    .replace(/[ \t]+/g, ' ');
}

export function parseDocument(raw) {
  const text = cleanMarkdown(raw || '');
  const lines = text.split('\n').map((l) => l.trim());
  const blocks = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (!l) continue;
    if (/^(=+|-{3,}|\*{3,}|_{3,})$/.test(l)) continue;
    if (i + 1 < lines.length && /^(=+|-{3,})$/.test(lines[i + 1]) && l.length < 120) {
      heading = l;
      blocks.push({ type: 'heading', text: l, heading });
      i++;
      continue;
    }
    let m;
    if ((m = l.match(/^#{1,6}\s+(.*)$/))) {
      heading = m[1].replace(/#+$/, '').trim();
      if (/^(references|notes|citations|footnotes|external links|further reading|see also|bibliography|sources)$/i.test(heading)) break;
      if (heading) blocks.push({ type: 'heading', text: heading, heading });
      continue;
    }
    if (/^[|:\-\s]+$/.test(l) && l.includes('-')) continue; // table separator
    if (l.startsWith('|') || l.split('|').length >= 3) {
      const cells = l.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length) {
        blocks.push({ type: 'row', cells, text: cells.join(' — '), heading });
        continue;
      }
    }
    if ((m = l.match(/^(?:[-*+•▪◦]|\d+[.)])\s+(.*)$/))) {
      blocks.push({ type: 'bullet', text: m[1].trim(), heading });
      continue;
    }
    l = l.replace(/^>\s*/, '');
    // Plain-text pages (e.g. clipped innerText): a short label line followed by a list is a heading.
    const next = lines.slice(i + 1).find(Boolean) || '';
    if (l.split(/\s+/).length <= 5 && !/[.!?:,;]$/.test(l) && /^(?:[-*+•▪◦]|\d+[.)])\s+/.test(next)) {
      heading = l;
      blocks.push({ type: 'heading', text: l, heading });
      continue;
    }
    blocks.push({ type: 'para', text: l, heading });
  }
  return { text, blocks };
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ extractors */

const PRICE_RE = /(?:[$€£₹¥]\s?\d[\d,]*(?:\.\d{1,2})?|\b(?:USD|EUR|GBP|INR|Rs\.?)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|INR|dollars|euros|rupees)\b)(?:\s?(?:\/|per\s)\s?(?:mo|month|yr|year|user|seat)\b)?/gi;
const MEASURE_RE = /\b\d+(?:\.\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mAh|Wh|MP|mm|cm|kg|lbs?|inch(?:es)?|-inch|hours?|hrs|nits|fps|Mbps|Gbps|cores?|threads|watts?|W)\b/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?\s?%/g;
const DATE_RE = /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2}|(?:Q[1-4]|H[12])\s+\d{4})\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const URL_RE = /\bhttps?:\/\/[^\s)<>"']+/g;

const KEY_SYN = {
  screen: 'display', 'display size': 'display', 'screen size': 'display', 'battery life': 'battery',
  cpu: 'processor', chip: 'processor', chipset: 'processor', ram: 'memory', 'memory ram': 'memory',
  ssd: 'storage', 'storage capacity': 'storage', cost: 'price', 'starting price': 'price', pricing: 'price',
  os: 'operating system', 'graphics card': 'graphics', gpu: 'graphics', 'weight kg': 'weight',
};
export function normKey(k) {
  const s = k.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return KEY_SYN[s] || s;
}

function uniqBy(arr, fn) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = fn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function contextFor(match, sentences) {
  const s = sentences.find((x) => x.text.includes(match));
  return s ? s.text : '';
}

function extractSpecs(blocks) {
  const specs = [];
  const seen = new Set();
  for (const b of blocks) {
    let k, v;
    if (b.type === 'row' && b.cells.length === 2) [k, v] = b.cells;
    else if (b.type === 'bullet' || b.type === 'para') {
      const m = b.text.match(/^([A-Za-z][\w /()&.+'-]{1,38}?)\s*[:：]\s+(.{1,160})$/);
      if (m) [, k, v] = m;
    }
    if (!k || !v) continue;
    k = k.trim();
    if (k.split(/\s+/).length > 5) continue;
    if (/^(https?|title|url source|markdown content|published time|note|source)$/i.test(k)) continue;
    if (/^(key|spec|specification|feature|item|attribute)s?$/i.test(k)) continue;
    const nk = normKey(k);
    if (seen.has(nk)) continue;
    seen.add(nk);
    specs.push({ key: k, value: v.trim(), norm: nk });
  }
  return specs.slice(0, 40);
}

function parseAmount(str) {
  const n = parseFloat(str.replace(/^[^\d]+/, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const POS_RE = /\b(best|excellent|outstanding|fast(?:er|est)?|great|improved|long(?:er)?-lasting|lightweight|premium|bright(?:er|est)?|powerful|efficient|affordable|free|easy|reliable|secure|stunning|sharp|quiet|superb|impressive|generous|seamless|smooth|durable|advantages?|benefits?|upgraded?|vivid|crisp|comfortable|plenty)\b/gi;
const NEG_RE = /\b(however|lacks?|lacking|limited|expensive|pricey|heavy|heavier|slow(?:er)?|drawbacks?|downsides?|cannot|can't|missing|weak(?:er)?|poor|worse|issues?|problems?|bulky|noisy|loud|dim(?:mer)?|costly|disadvantages?|unfortunately|struggles?|no longer|not ideal|trade-?offs?)\b/gi;
const PRO_HEAD = /^\W*(?:the\s+)?(pros?|advantages?|strengths?|benefits?|what we like|highlights|why buy)\b/i;
const CON_HEAD = /^\W*(?:the\s+)?(cons?|disadvantages?|drawbacks?|limitations?|weakness(?:es)?|what we don.?t like|watch out)\b/i;

function countRe(text, re) {
  return (text.match(re) || []).length;
}

function prosCons(sentences, scoreOf) {
  const pros = [], cons = [];
  for (const s of sentences) {
    const h = s.heading || '';
    const isPro = PRO_HEAD.test(h), isCon = CON_HEAD.test(h);
    if (isPro && !isCon) { pros.push({ text: s.text, w: 10 + scoreOf(s) }); continue; }
    if (isCon && !isPro) { cons.push({ text: s.text, w: 10 + scoreOf(s) }); continue; }
    if (s.type === 'row') continue;
    const p = countRe(s.text, POS_RE), n = countRe(s.text, NEG_RE);
    if (p > n) pros.push({ text: s.text, w: p + scoreOf(s) });
    else if (n > p) cons.push({ text: s.text, w: n + scoreOf(s) });
  }
  const top = (a) => a.sort((x, y) => y.w - x.w).slice(0, 5).map((x) => x.text);
  return { pros: top(pros), cons: top(cons) };
}

/* ------------------------------------------------------------------ analysis */

const cache = new Map();

export function analyze(doc) {
  const key = doc.id + ':' + (doc.raw || '').length;
  if (cache.has(key)) return cache.get(key);

  const { text, blocks } = parseDocument((doc.raw || '').slice(0, 250000));
  const sentences = [];
  const surface = new Map();
  blocks.forEach((b) => {
    if (b.type === 'heading') return;
    const parts = b.type === 'row' ? [b.text] : splitSentences(b.text);
    parts.forEach((p) => {
      const words = p.split(/\s+/).length;
      if (words < 3) return;
      const raw = tokenize(p);
      const tokens = raw.map(stem);
      raw.forEach((w, i) => {
        const m = surface.get(tokens[i]) || new Map();
        m.set(w, (m.get(w) || 0) + 1);
        surface.set(tokens[i], m);
      });
      sentences.push({ i: sentences.length, text: p, heading: b.heading, type: b.type, tokens, words });
    });
  });
  const display = (st) => {
    const m = surface.get(st);
    if (!m) return st;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const tf = new Map();
  sentences.forEach((s) => s.tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1)));
  let maxTf = 1;
  tf.forEach((v) => { if (v > maxTf) maxTf = v; });

  // sentence salience
  const total = sentences.length || 1;
  const scores = new Map();
  sentences.forEach((s) => {
    const uniq = [...new Set(s.tokens)];
    let sc = uniq.length ? uniq.reduce((a, t) => a + tf.get(t) / maxTf, 0) / Math.sqrt(uniq.length + 2) : 0;
    if (s.i < total * 0.2) sc *= 1.2;
    if (/\d/.test(s.text)) sc *= 1.1;
    if (s.type === 'row') sc *= 0.6;
    scores.set(s.i, sc);
  });
  const scoreOf = (s) => scores.get(s.i) || 0;

  // summary with diversity (skip near-duplicates)
  const nSum = Math.max(3, Math.min(6, Math.round(total * 0.15)));
  const cands = sentences
    .filter((s) => s.words >= 6 && s.words <= 60 && s.type !== 'row')
    .sort((a, b) => scoreOf(b) - scoreOf(a));
  const chosen = [];
  for (const s of cands) {
    if (chosen.length >= nSum) break;
    const set = new Set(s.tokens);
    const dup = chosen.some((c) => {
      const inter = c.tokens.filter((t) => set.has(t)).length;
      return inter / Math.max(1, Math.min(set.size, new Set(c.tokens).size)) > 0.6;
    });
    if (!dup) chosen.push(s);
  }
  const summary = chosen.slice().sort((a, b) => a.i - b.i).map((s) => s.text);
  const tldr = summary[0] || '';

  // keywords (unigrams + repeated bigrams)
  const bi = new Map();
  sentences.forEach((s) => {
    for (let i = 0; i < s.tokens.length - 1; i++) {
      const a = s.tokens[i], b = s.tokens[i + 1];
      if (/^\d/.test(a) || /^\d/.test(b) || a === b) continue;
      const k = a + ' ' + b;
      bi.set(k, (bi.get(k) || 0) + 1);
    }
  });
  const bigrams = [...bi.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const covered = new Set(bigrams.flatMap(([k]) => k.split(' ')));
  const unis = [...tf.entries()]
    .filter(([t]) => !/^[\d.]+$/.test(t) && t.length > 2 && !covered.has(t))
    .sort((a, b) => b[1] - a[1]);
  const keywords = [
    ...bigrams.map(([k, c]) => ({ term: k.split(' ').map(display).join(' '), score: c * 1.8 })),
    ...unis.slice(0, 14 - bigrams.length).map(([t, c]) => ({ term: display(t), score: c })),
  ].sort((a, b) => b.score - a.score);
  const topTerms = [...tf.entries()].filter(([t]) => !/^[\d.]+$/.test(t)).sort((a, b) => b[1] - a[1]).map(([t]) => t);

  // extraction
  const all = (re) => [...new Set(text.match(re) || [])];
  const prices = uniqBy(
    all(PRICE_RE).map((p) => ({ value: p.trim(), amount: parseAmount(p), context: contextFor(p, sentences) })),
    (p) => p.value.replace(/\s/g, '').toLowerCase()
  ).slice(0, 20);
  const measurements = uniqBy(all(MEASURE_RE).map((m) => m.trim()), (m) => m.toLowerCase().replace(/\s/g, '')).slice(0, 30);
  const percents = all(PERCENT_RE).slice(0, 20);
  const dates = all(DATE_RE).slice(0, 20);
  const emails = all(EMAIL_RE).slice(0, 10);
  const links = [...new Set((doc.raw || '').slice(0, 250000).match(URL_RE) || [])].map((u) => u.replace(/[.,;]+$/, '')).filter((u) => !/#cite|\.(png|jpe?g|svg|gif|webp)$/i.test(u)).slice(0, 15);
  const specs = extractSpecs(blocks);
  const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text).slice(0, 30);
  const facts = sentences
    .filter((s) => /\d/.test(s.text) && s.words >= 5 && s.type !== 'row' && !/^[A-Za-z][\w /()&.+'-]{1,38}:\s/.test(s.text))
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 8)
    .sort((a, b) => a.i - b.i)
    .map((s) => s.text);
  const keyPoints = sentences
    .filter((s) => s.type === 'bullet' && s.words >= 4 && !/^[A-Za-z][\w /()&.+'-]{1,38}:\s/.test(s.text))
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 6)
    .map((s) => s.text);

  const wordCount = (text.match(/[A-Za-z0-9][\w'’-]*/g) || []).length;
  const pos = countRe(text, POS_RE), neg = countRe(text, NEG_RE);
  const tone = pos + neg < 3 ? 'Neutral' : pos > neg * 1.5 ? 'Positive' : neg > pos * 1.5 ? 'Critical' : 'Balanced';
  const { pros, cons } = prosCons(sentences, scoreOf);

  const result = {
    id: doc.id, title: doc.title, url: doc.url, sentences, tf, topTerms, display,
    clean: blocks.map((b) => (b.type === 'heading' ? '## ' + b.text : b.type === 'bullet' ? '- ' + b.text : b.text)).join('\n'),
    summary, tldr, keywords, keyPoints, facts, prices, measurements, percents, dates, emails, links, specs, headings,
    pros, cons, tone,
    stats: { words: wordCount, sentences: sentences.length, readingMin: Math.max(1, Math.round(wordCount / 220)), headings: headings.length },
  };
  cache.set(key, result);
  return result;
}

/* ------------------------------------------------------------------ comparison */

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  a.forEach((v, k) => { na += v * v; if (b.has(k)) dot += v * b.get(k); });
  b.forEach((v) => { nb += v * v; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export const shortTitle = (t) => (t || '').split(/ [—|–] /)[0];

export function formatMoney(p) {
  return p ? p.value : '—';
}

export function compareDocs(list) {
  // list: analysis objects (>= 2)
  const n = list.length;
  const pairs = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) pairs.push({ a: i, b: j, sim: cosine(list[i].tf, list[j].tf) });
  const similarity = pairs.length ? pairs.reduce((s, p) => s + p.sim, 0) / pairs.length : 0;

  const topSets = list.map((a) => new Set(a.topTerms.slice(0, 60)));
  const shared = list[0].topTerms
    .slice(0, 60)
    .filter((t) => topSets.every((s) => s.has(t)))
    .slice(0, 12)
    .map((t) => list[0].display(t));
  const unique = list.map((a, i) => {
    const others = list.filter((_, j) => j !== i);
    return a.topTerms
      .slice(0, 40)
      .filter((t) => others.every((o) => !o.topTerms.slice(0, 120).includes(t)))
      .slice(0, 8)
      .map((t) => a.display(t));
  });

  // price row: lowest standalone price per doc (ignore per-month add-ons only if others exist)
  const mainPrice = (a) => {
    const ps = a.prices.filter((p) => p.amount != null && p.amount > 0);
    if (!ps.length) return null;
    const priceSpec = a.specs.find((s) => s.norm === 'price');
    if (priceSpec) {
      const hit = ps.find((p) => priceSpec.value.includes(p.value));
      if (hit) return hit;
    }
    return ps[0];
  };
  const priceVals = list.map(mainPrice);
  const amounts = priceVals.map((p) => (p ? p.amount : null));
  const validAmounts = amounts.filter((x) => x != null);
  const minIdx = validAmounts.length >= 2 ? amounts.indexOf(Math.min(...validAmounts)) : null;

  const rows = [];
  rows.push({ label: 'Main price found', values: priceVals.map(formatMoney), best: minIdx, bestNote: 'Lowest' });

  // spec alignment
  const keyCount = new Map();
  const keyLabel = new Map();
  list.forEach((a) => a.specs.forEach((s) => {
    if (s.norm === 'price') return;
    keyCount.set(s.norm, (keyCount.get(s.norm) || 0) + 1);
    if (!keyLabel.has(s.norm)) keyLabel.set(s.norm, s.key);
  }));
  const specKeys = [...keyCount.entries()]
    .filter(([, c]) => c >= 2 || n === 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([k]) => k);
  specKeys.forEach((k) => {
    rows.push({
      label: keyLabel.get(k).replace(/^\w/, (c) => c.toUpperCase()),
      values: list.map((a) => a.specs.find((s) => s.norm === k)?.value || '—'),
      best: null,
      spec: true,
    });
  });
  const words = list.map((a) => a.stats.words);
  rows.push({ label: 'Content length', values: words.map((w) => w.toLocaleString() + ' words'), best: words.indexOf(Math.max(...words)), bestNote: 'Most detailed' });
  rows.push({ label: 'Reading time', values: list.map((a) => a.stats.readingMin + ' min'), best: null });
  rows.push({ label: 'Tone', values: list.map((a) => a.tone), best: null });
  rows.push({ label: 'Top keywords', values: list.map((a) => a.keywords.slice(0, 4).map((k) => k.term).join(', ')), best: null });

  const highlights = [];
  if (minIdx != null) highlights.push(`${shortTitle(list[minIdx].title)} has the lowest price (${priceVals[minIdx].value}).`);
  list.forEach((a) => {
    const good = a.pros.slice(0, 2).join(' · ');
    const bad = a.cons[0];
    if (good || bad) highlights.push(`${shortTitle(a.title)}: ${good || '—'}${bad ? ` (but: ${bad.replace(/^\w/, (c) => c.toLowerCase())})` : ''}`);
  });
  return { similarity, pairs, shared, unique, rows, highlights };
}

/* ------------------------------------------------------------------ Q&A */

function bm25Search(query, list) {
  const qRaw = tokenize(query).filter((t) => !QUESTION_STOP.has(t)).map(stem);
  const qTerms = [...new Set(qRaw)];
  if (!qTerms.length) return { qTerms, hits: [] };
  const weights = new Map(qTerms.map((t) => [t, 1]));
  qTerms.forEach((t) => (SYNONYMS[t] || []).forEach((s) => { const st = stem(s); if (!weights.has(st)) weights.set(st, 0.5); }));

  const docs = [];
  list.forEach((a) => a.sentences.forEach((s) => docs.push({ a, s })));
  const N = docs.length || 1;
  const avgdl = docs.reduce((x, d) => x + d.s.tokens.length, 0) / N || 1;
  const df = new Map();
  docs.forEach(({ s }) => new Set(s.tokens).forEach((t) => { if (weights.has(t)) df.set(t, (df.get(t) || 0) + 1); }));

  const k1 = 1.4, b = 0.75;
  const need = qTerms.length <= 2 ? 1 : Math.ceil(qTerms.length * 0.5);
  const hits = [];
  docs.forEach(({ a, s }) => {
    const f = new Map();
    s.tokens.forEach((t) => { if (weights.has(t)) f.set(t, (f.get(t) || 0) + 1); });
    if (!f.size) return;
    const matchedOrig = qTerms.filter((t) => f.has(t) || (SYNONYMS[t] || []).some((x) => f.has(stem(x)))).length;
    if (matchedOrig < need) return;
    let score = 0;
    f.forEach((freq, t) => {
      const d = df.get(t) || 0;
      const idf = Math.log(1 + (N - d + 0.5) / (d + 0.5));
      score += weights.get(t) * idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * s.tokens.length) / avgdl)));
    });
    score *= 1 + 0.25 * (matchedOrig / qTerms.length);
    if (/\d/.test(s.text)) score *= 1.15;
    hits.push({ score, text: s.text, source: a.title, heading: s.heading });
  });
  hits.sort((x, y) => y.score - x.score);
  return { qTerms: [...weights.keys()], hits: uniqBy(hits, (h) => h.text).slice(0, 4) };
}

export function answerQuestion(question, inList) {
  let list = inList;
  const q = question.trim();
  const ql = q.toLowerCase();
  if (!list.length) {
    return { intro: 'There are no sources in scope yet. Analyze a URL, paste content or load a sample page first, then ask me about it.', groups: [], kind: 'empty' };
  }
  if (/^(hi|hello|hey|help|what can you do)\b/.test(ql) && ql.length < 30) {
    return {
      intro: `I'm answering from ${list.length} source${list.length > 1 ? 's' : ''}. Try asking:`,
      groups: [{ title: null, items: ['“Summarize this page”', '“What are the prices?”', '“Show the specs”', '“Compare these pages”', '“What is the battery life?”'].map((t) => ({ text: t })) }],
      kind: 'help',
    };
  }

  // If the question names a specific source (e.g. "price of the Nimbus"), focus on it.
  const qset = new Set(tokenize(q).map(stem));
  const titleToks = list.map((a) => new Set(tokenize(shortTitle(a.title)).map(stem)));
  const named = list.filter((a, i) => [...titleToks[i]].some((t) => qset.has(t) && titleToks.filter((s) => s.has(t)).length === 1));
  let searchQ = q;
  if (named.length && named.length < list.length) {
    const nameToks = new Set(named.flatMap((a) => tokenize(shortTitle(a.title)).map(stem)));
    const rest = q.split(/\s+/).filter((w) => !nameToks.has(stem(w.toLowerCase().replace(/[^a-z0-9.-]/g, '')))).join(' ');
    if (tokenize(rest).filter((t) => !QUESTION_STOP.has(t)).length) searchQ = rest;
    list = named;
  }

  const multi = list.length > 1;
  const { qTerms, hits } = bm25Search(searchQ, list);
  const retrieval = hits.length ? [{ title: 'Relevant passages', items: hits.map((h) => ({ text: h.text, source: h.source, heading: h.heading })) }] : [];

  if (/\b(summar\w*|overview|tl;?dr|gist|main points?|what is (this|it) about|key takeaways?)\b/.test(ql)) {
    return {
      intro: multi ? `Here are extractive summaries of your ${list.length} sources:` : `Summary of “${list[0].title}”:`,
      groups: list.map((a) => ({ title: multi ? a.title : null, items: a.summary.slice(0, 4).map((t) => ({ text: t, source: a.title })) })),
      kind: 'summary', terms: [],
    };
  }

  if (/\b(price|prices|pricing|cost|costs|how much|cheap\w*|expensive|afford\w*)\b/.test(ql)) {
    const withPrices = list.filter((a) => a.prices.length);
    if (withPrices.length) {
      let intro = 'Prices found in the sources:';
      if (multi && withPrices.length > 1) {
        const cmp = compareDocs(list);
        if (cmp.highlights[0] && cmp.rows[0].best != null) intro = cmp.highlights[0] + ' All prices found:';
      }
      return {
        intro,
        groups: withPrices.map((a) => ({ title: a.title, items: uniqBy(a.prices.slice(0, 6).map((p) => ({ text: p.context || p.value, source: a.title, tag: p.value })), (x) => x.text) })),
        kind: 'prices', terms: qTerms,
      };
    }
    if (!hits.length) return notFound(q, 'No prices or currency amounts appear in the analyzed content.');
  }

  if (multi && /\b(compare|comparison|differ\w*|vs\.?|versus|better|which (one|is)|similar\w*)\b/.test(ql)) {
    const cmp = compareDocs(list);
    return {
      intro: 'Here is how they compare, based only on the pages:',
      groups: [{ title: 'Highlights', items: cmp.highlights.map((t) => ({ text: t, derived: true })) }, ...retrieval],
      kind: 'compare', terms: qTerms,
    };
  }

  if (/\b(specs?|specifications?|tech(nical)? details?)\b/.test(ql)) {
    const withSpecs = list.filter((a) => a.specs.length);
    if (withSpecs.length) {
      return {
        intro: 'Specifications extracted from the sources:',
        groups: withSpecs.map((a) => ({ title: a.title, items: a.specs.slice(0, 10).map((s) => ({ text: `${s.key}: ${s.value}`, source: a.title })) })),
        kind: 'specs', terms: [],
      };
    }
  }

  if (/\b(pros?|cons?|advantages?|disadvantages?|drawbacks?|downsides?|strengths?|weakness\w*)\b/.test(ql)) {
    const wantCons = /\b(cons?|disadvantages?|drawbacks?|downsides?|weakness\w*)\b/.test(ql);
    const wantPros = /\b(pros?|advantages?|strengths?)\b/.test(ql);
    const groups = [];
    list.forEach((a) => {
      if (wantPros || !wantCons) a.pros.length && groups.push({ title: `${multi ? a.title + ' — ' : ''}Advantages`, items: a.pros.map((t) => ({ text: t, source: a.title })) });
      if (wantCons || !wantPros) a.cons.length && groups.push({ title: `${multi ? a.title + ' — ' : ''}Disadvantages`, items: a.cons.map((t) => ({ text: t, source: a.title })) });
    });
    if (groups.length) return { intro: 'Here is what the sources say:', groups, kind: 'proscons', terms: [] };
  }

  if (!hits.length) return notFound(q);
  return {
    intro: hits.length === 1 ? 'I found one passage that answers this:' : `I found ${hits.length} relevant passages:`,
    groups: [{ title: null, items: hits.map((h) => ({ text: h.text, source: h.source, heading: h.heading })) }],
    kind: 'answer', terms: qTerms,
  };
}

function notFound(q, extra) {
  return {
    intro: `I couldn't find information about “${q}” in your sources.${extra ? ' ' + extra : ''} I only answer from the pages you've analyzed, so I won't guess.`,
    groups: [], kind: 'notfound',
  };
}
