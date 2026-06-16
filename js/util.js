/* AI GM — small shared helpers (no dependencies, loaded first) */

function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/* Markdown-lite for GM narration: paragraphs, **bold**, *italic*, `code` */
function md(text) {
  const paras = String(text || '').trim().split(/\n{2,}/);
  return paras.map(function (p) {
    let h = esc(p.trim());
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\n/g, '<br>');
    return '<p>' + h + '</p>';
  }).join('');
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

/* h('div', {class:'x', onclick:fn}, child1, 'text', ...) */
function h(tag, attrs) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null) continue;
    if (Array.isArray(c)) c.forEach(function (x) { if (x != null) el.append(x); });
    else el.append(c);
  }
  return el;
}

/* Strip markdown + fenced blocks down to plain prose for text-to-speech */
function stripMd(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')   // gm-* / code fences — never spoken
    .replace(/[*_`#>]/g, '')           // bold/italic/code/heading/quote marks
    .replace(/\s+/g, ' ')
    .trim();
}

/* Text-to-speech via the Web Speech API. Works in Chrome/Safari on iOS and
 * Android (and desktop) — iOS routes it through the same system voices Siri
 * uses. iOS quirks handled here: cancel before each new utterance, split long
 * text into sentence-sized chunks (WebKit stalls on big strings), and warm the
 * async voice list. speak() must be called from a user gesture on iOS. */
var Speech = (function () {
  var synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
  var current = null;            // active session; .reset resets the caller's UI

  /* touch the voice list so it's populated by the time we speak */
  if (synth && 'onvoiceschanged' in synth) {
    synth.onvoiceschanged = function () { try { synth.getVoices(); } catch (e) {} };
  }

  function supported() {
    /* iOS WebKit doesn't always report the constructor as typeof "function",
     * so check for existence, not the exact type. */
    return !!synth && typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  /* break prose into ~200-char, sentence-aligned chunks */
  function chunkText(text) {
    var parts = String(text || '').match(/[^.!?]+[.!?]*\s*/g) || [];
    var out = [], buf = '';
    parts.forEach(function (p) {
      if (buf && (buf + p).length > 200) { out.push(buf.trim()); buf = p; }
      else buf += p;
    });
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function clearCurrent() {
    var s = current; current = null;
    if (s && s.reset) { var r = s.reset; s.reset = null; r(); }
  }

  function stop() {
    clearCurrent();
    if (synth) synth.cancel();
  }

  /* opts: { rate, pitch, lang, onend }. onend doubles as a UI-reset callback —
   * it fires when speech finishes naturally OR is stopped/superseded. */
  function speak(text, opts) {
    if (!supported()) return false;
    stop();
    var chunks = chunkText(stripMd(text));
    if (!chunks.length) return false;
    opts = opts || {};
    var session = { reset: opts.onend || null };
    current = session;
    chunks.forEach(function (c, idx) {
      var u = new SpeechSynthesisUtterance(c);
      u.rate = opts.rate || 1;
      u.pitch = opts.pitch || 1;
      u.lang = opts.lang || 'en-US';
      if (idx === chunks.length - 1) {
        var done = function () { if (current === session) clearCurrent(); };
        u.onend = done; u.onerror = done;
      }
      synth.speak(u);
    });
    return true;
  }

  function speaking() { return !!current; }

  return { supported: supported, speak: speak, stop: stop, speaking: speaking };
})();

function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}
