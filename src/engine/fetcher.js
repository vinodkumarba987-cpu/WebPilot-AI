// Live page fetching. Browsers block cross-origin reads, so we go through free,
// key-less public readers. These are third-party services: they can be slow,
// rate-limited, or refused by the target site — paste mode always works.

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Request timed out')), ms)),
  ]);
}

export function normalizeUrl(input) {
  const s = input.trim();
  if (!s) throw new Error('Please enter a URL.');
  const url = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) throw new Error();
    return u.toString();
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
}

export function looksLikeHtml(text) {
  return /<\/?(html|body|div|p|article|section|h[1-6]|ul|table)\b/i.test(text);
}

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.title ||
    doc.querySelector('h1')?.textContent ||
    '';
  doc.querySelectorAll('script,style,noscript,svg,iframe,nav,footer,form,button,template,aside').forEach((n) => n.remove());
  const root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
  const out = [];
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  const walk = (node) => {
    if (node.nodeType === 3) { out.push(node.textContent.replace(/\s+/g, ' ')); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) { out.push('\n\n# ' + clean(node.textContent) + '\n\n'); return; }
    if (tag === 'li') { out.push('\n- '); node.childNodes.forEach(walk); out.push('\n'); return; }
    if (tag === 'tr') {
      const cells = [...node.children].map((c) => clean(c.textContent)).filter(Boolean);
      if (cells.length) out.push('\n| ' + cells.join(' | ') + ' |\n');
      return;
    }
    if (tag === 'br') { out.push('\n'); return; }
    const block = /^(p|div|section|article|main|header|ul|ol|table|dl|dt|dd|blockquote|pre|figure|figcaption)$/.test(tag);
    if (block) out.push('\n');
    node.childNodes.forEach(walk);
    if (block) out.push('\n');
  };
  if (root) walk(root);
  const text = out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: clean(title), text };
}

async function viaJina(url) {
  const res = await withTimeout(fetch('https://r.jina.ai/' + url), 25000);
  if (!res.ok) throw new Error('Reader returned ' + res.status);
  const txt = await res.text();
  const title = (txt.match(/^Title:\s*(.*)$/m) || [])[1] || '';
  const idx = txt.indexOf('Markdown Content:');
  const content = idx >= 0 ? txt.slice(idx + 17).trim() : txt;
  if (content.length < 200) throw new Error('Reader returned too little content');
  return { title, raw: content, via: 'r.jina.ai reader' };
}

async function viaAllOrigins(url) {
  const res = await withTimeout(fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url)), 20000);
  if (!res.ok) throw new Error('Proxy returned ' + res.status);
  const html = await res.text();
  const { title, text } = htmlToText(html);
  if (text.length < 200) throw new Error('Proxy returned too little content');
  return { title, raw: text, via: 'allorigins proxy' };
}

export async function fetchPage(input, onStep) {
  const url = normalizeUrl(input);
  const errors = [];
  for (const [name, fn] of [['reader', viaJina], ['proxy', viaAllOrigins]]) {
    try {
      onStep?.(name === 'reader' ? 'Fetching via public reader…' : 'Retrying via backup proxy…');
      const r = await fn(url);
      return { ...r, url, title: r.title || new URL(url).hostname };
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(
    'Could not fetch this page (' + errors.join('; ') + '). Some sites block automated readers — copy the page text and use “Paste content” instead.'
  );
}
