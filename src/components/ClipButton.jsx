import React, { useEffect, useRef } from 'react';
import { X, MousePointerClick, Bookmark } from 'lucide-react';

// A bookmarklet: one click on any website sends that page's visible text here.
// Works on sites that block automated readers and on pages behind a login,
// because the text is read by the user's own browser.
function bookmarkletCode() {
  const app = location.origin + location.pathname;
  const body = `(()=>{const r=document.querySelector('article')||document.querySelector('main')||document.body;const d={type:'webpilot-page',title:document.title,url:location.href,text:r.innerText.slice(0,150000)};const w=window.open(${JSON.stringify(app + '#clip')},'webpilot');if(!w){alert('Please allow pop-ups for WebPilot.');return}let n=0;const t=setInterval(()=>{try{w.postMessage(d,'*')}catch(e){}if(++n>40)clearInterval(t)},400);window.addEventListener('message',e=>{if(e.data==='webpilot-ack')clearInterval(t)})})()`;
  return 'javascript:' + encodeURIComponent(body);
}

export default function ClipModal({ onClose }) {
  const linkRef = useRef(null);
  useEffect(() => {
    // set via DOM so React doesn't block the javascript: URL
    linkRef.current?.setAttribute('href', bookmarkletCode());
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Use WebPilot on any site">
        <button className="icon-btn close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <h2>Use WebPilot on any website</h2>
        <p className="muted">Add one button to your browser. Then, on any page you're reading — shopping, news, even pages behind a login — click it and WebPilot opens with that page ready.</p>
        <ol className="steps">
          <li>
            <span>1</span>
            <div>
              Show your bookmarks bar (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>), then drag this button onto it:
              <div className="bm-wrap">
                <a ref={linkRef} className="bookmarklet" onClick={(e) => { e.preventDefault(); alert('Drag this button to your bookmarks bar instead of clicking it.'); }}>
                  <Bookmark size={15} /> WebPilot it
                </a>
              </div>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>Open any webpage and click <b>WebPilot it</b> in your bookmarks bar. <MousePointerClick size={14} /></div>
          </li>
          <li>
            <span>3</span>
            <div>The page appears here, summarized. Click it on a second page to compare them.</div>
          </li>
        </ol>
        <p className="muted small">The page text goes straight from your browser to this tab. WebPilot doesn't need a login, and the text isn't sent through a reader service.</p>
      </div>
    </div>
  );
}
