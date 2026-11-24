// Grounded AI answers with no paid key.
// Provider order:
//   1. Chrome's built-in on-device AI (Gemini Nano via the Prompt API): free, private, no key.
//   2. Google Gemini with the user's own FREE API key (aistudio.google.com), if they add one.
//   3. Otherwise callers fall back to the local extractive engine.
// The model only sees the page text and is told to refuse when the answer is not in it.
import { shortTitle } from './nlp.js';

const SYSTEM = `You are WebPilot, a friendly web research assistant.
Rules:
- Use ONLY the page content provided. Never use outside knowledge or guess.
- If the answer is not in the pages, say: "I couldn't find that on these pages."
- Be short and plain-spoken (under 120 words). Use "- " bullets for lists. Use **bold** for key numbers.
- When several pages are given, name the page each fact comes from.`;

const KEY_STORE = 'wp2-gemini-key';
export const getKey = () => {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
};
export const setKey = (k) => {
  try { k ? localStorage.setItem(KEY_STORE, k.trim()) : localStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
};

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' */
export async function chromeAIStatus() {
  try {
    if (typeof LanguageModel === 'undefined') return 'unavailable';
    return await LanguageModel.availability({ expectedOutputs: [{ type: 'text', languages: ['en'] }] });
  } catch {
    return 'unavailable';
  }
}

export async function activeProvider() {
  const chrome = await chromeAIStatus();
  if (chrome !== 'unavailable') return 'chrome';
  if (getKey()) return 'gemini';
  return null;
}

const cache = new Map();

async function viaChrome(system, prompt) {
  const session = await LanguageModel.create({
    initialPrompts: [{ role: 'system', content: system }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  });
  try {
    return await session.prompt(prompt);
  } finally {
    session.destroy?.();
  }
}

async function viaGemini(system, prompt) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message?.split('.')[0] || 'Gemini returned ' + res.status);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text.trim()) throw new Error('Empty AI response');
  return text;
}

async function run(system, prompt) {
  const provider = await activeProvider();
  if (!provider) throw new Error('No AI available');
  const key = provider + system + prompt;
  if (cache.has(key)) return cache.get(key);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('AI took too long')), provider === 'chrome' ? 90000 : 40000));
  const text = (await Promise.race([provider === 'chrome' ? viaChrome(system, prompt) : viaGemini(system, prompt), timeout])).trim();
  cache.set(key, text);
  return text;
}

async function budget() {
  // On-device models have a small context window; cloud models get more text.
  return (await activeProvider()) === 'chrome' ? 9000 : 40000;
}

function context(list, total) {
  const per = Math.floor(total / list.length);
  return list.map((a, i) => `### Page ${i + 1}: ${shortTitle(a.title)}\n${a.clean.slice(0, per)}`).join('\n\n');
}

export async function aiSummary(a) {
  return run(SYSTEM, `${context([a], await budget())}\n\nIn 2-3 plain sentences, tell a busy person what this page is about and the single most useful thing to know. No preamble.`);
}

export async function aiVerdict(list) {
  return run(
    SYSTEM,
    `${context(list, await budget())}\n\nSomeone is choosing between these ${list.length} options. Give 3-4 short bullets saying who each option is best for, using concrete numbers from the pages. Then one final line starting with "**Bottom line:**". No table, no preamble.`
  );
}

export async function aiAnswer(question, list, history = []) {
  const past = history
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');
  return run(SYSTEM, `PAGES:\n${context(list, await budget())}\n\n${past ? 'CONVERSATION SO FAR:\n' + past + '\n\n' : ''}QUESTION: ${question}`);
}
