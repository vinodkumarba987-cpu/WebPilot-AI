# WebPilot

**Understand any webpage in seconds.** Paste a link to get the essentials, paste a few links to compare them, then ask questions. Answers come only from the page.

Built for the hackathon track *Beyond the Browser – Reimagine How We Use the Web*.

## Run (easiest: just Python)

1. Install Python 3.8+ if you don't have it (python.org).
2. In this folder, run:

```bash
python run.py
```

WebPilot opens in your browser. Press Ctrl+C in the terminal to stop it. Nothing else to install.

## Run for development (needs Node.js 18+)

```bash
npm install
npm run dev              # http://localhost:5173, live reload
python run.py --update   # rebuild and re-embed the app into run.py
```

## What it does

1. **Paste a link or text.** You get a short summary, key points, quick facts (price, specs) and good/watch-out points.
2. **Paste more links.** You get a side-by-side table with the lowest price highlighted, a recommendation, and each page's strengths and weak spots.
3. **Ask anything.** You get a plain answer with a "Where this comes from" list of quotes. If the answer isn't on the page, it says so.
4. **"WebPilot it" button.** This is a bookmark you drag to your bookmarks bar once. On any site (including ones that block readers, or pages behind a login) one click sends that page here.

## AI (no paid key)

| Mode | How |
| --- | --- |
| On-device AI | Chrome's built-in Prompt API (Gemini Nano). Free, private, used automatically when the browser supports it. |
| Gemini (optional) | Paste a **free** key from aistudio.google.com into the AI menu. It's stored only in your browser. |
| No AI | A local engine in the browser that picks out key sentences and finds answers by search. It quotes the page and always works. |

The AI only gets the page text and is told to refuse if the answer isn't in it.

## What's live vs. demo

- Links are fetched through free public readers (r.jina.ai, then allorigins). Some sites block them; the "WebPilot it" button or pasting text always works.
- "Compare 3 laptops" uses bundled **fictional** demo pages.
