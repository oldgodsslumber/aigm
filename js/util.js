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
  var readyCbs = [];

  function emitReady() {
    var cbs = readyCbs; readyCbs = [];
    cbs.forEach(function (c) { try { c(); } catch (e) {} });
  }
  /* The voice list loads asynchronously (and on iOS is often empty until first
   * use). Touch it now and re-notify listeners whenever it changes. */
  if (synth && 'onvoiceschanged' in synth) {
    synth.onvoiceschanged = function () { try { synth.getVoices(); } catch (e) {} emitReady(); };
  }

  function supported() {
    /* iOS WebKit doesn't always report the constructor as typeof "function",
     * so check for existence, not the exact type. */
    return !!synth && typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  function voices() {
    if (!synth) return [];
    try { return synth.getVoices() || []; } catch (e) { return []; }
  }
  /* Call cb once voices are available — immediately if already loaded, on the
   * voiceschanged event otherwise, with a short poll as an iOS fallback. */
  function onVoices(cb) {
    if (voices().length) { cb(); return; }
    readyCbs.push(cb);
    var tries = 0;
    var poll = function () {
      if (voices().length) { emitReady(); return; }
      if (++tries < 10) setTimeout(poll, 250);
    };
    setTimeout(poll, 250);
  }

  function pref(key, def) { try { var v = localStorage.getItem(key); return v == null ? def : v; } catch (e) { return def; } }
  function setPref(key, val) { try { if (val == null || val === '') localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) {} }

  function getVoiceURI() { return pref('aigm.ttsVoice', ''); }
  function setVoiceURI(uri) { setPref('aigm.ttsVoice', uri || ''); }
  function getRate() { var r = parseFloat(pref('aigm.ttsRate', '1')); return (r >= 0.5 && r <= 2) ? r : 1; }
  function setRate(r) { setPref('aigm.ttsRate', String(r)); }

  /* resolve the saved preference to a live voice object (URI first, then name) */
  function chosenVoice() {
    var uri = getVoiceURI();
    if (!uri) return null;
    var vs = voices();
    return vs.filter(function (v) { return v.voiceURI === uri; })[0] ||
           vs.filter(function (v) { return v.name === uri; })[0] || null;
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
    var voice = opts.voice || chosenVoice();
    var rate = opts.rate || getRate();
    chunks.forEach(function (c, idx) {
      var u = new SpeechSynthesisUtterance(c);
      u.rate = rate;
      u.pitch = opts.pitch || 1;
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      else u.lang = opts.lang || 'en-US';
      if (idx === chunks.length - 1) {
        var done = function () { if (current === session) clearCurrent(); };
        u.onend = done; u.onerror = done;
      }
      synth.speak(u);
    });
    return true;
  }

  function speaking() { return !!current; }

  return {
    supported: supported, speak: speak, stop: stop, speaking: speaking,
    voices: voices, onVoices: onVoices,
    getVoiceURI: getVoiceURI, setVoiceURI: setVoiceURI,
    getRate: getRate, setRate: setRate
  };
})();

/* Speech-to-text via the Web Speech API's SpeechRecognition. Works in Chrome
 * (desktop + Android); iOS Safari does NOT implement it, so supported() returns
 * false there and callers fall back to the native keyboard dictation mic.
 * Single-shot by design: start a session, the caller gets interim text live and
 * a final transcript on end. Must be started from a user gesture. */
var Listen = (function () {
  var Rec = (typeof window !== 'undefined') &&
    (window.SpeechRecognition || window.webkitSpeechRecognition) || null;
  var session = null;

  function supported() { return !!Rec; }

  /* opts: { onText(text, isFinal), onEnd(reason), lang }. Returns true if a
   * recognition session started, false if unsupported. */
  function start(opts) {
    if (!Rec) return false;
    stop();
    opts = opts || {};
    var rec = new Rec();
    rec.lang = opts.lang || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;          // one utterance, then hand back the text
    rec.maxAlternatives = 1;
    var s = { rec: rec, stopped: false };
    session = s;
    var finalText = '';
    rec.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (opts.onText) opts.onText((finalText + interim).trim(), false);
    };
    rec.onerror = function (ev) {
      if (session === s) session = null;
      if (opts.onEnd) opts.onEnd(ev.error || 'error');
    };
    rec.onend = function () {
      if (session === s) session = null;
      if (opts.onText && finalText.trim()) opts.onText(finalText.trim(), true);
      if (opts.onEnd) opts.onEnd(s.stopped ? 'stopped' : 'ended');
    };
    try { rec.start(); } catch (e) { session = null; return false; }
    return true;
  }

  function listening() { return !!session; }

  function stop() {
    if (session) { session.stopped = true; try { session.rec.stop(); } catch (e) {} session = null; }
  }

  return { supported: supported, start: start, stop: stop, listening: listening };
})();

/* Drive Mode — a device-local preference (like the TTS voice), kept in
 * localStorage so it survives reloads but never syncs per-campaign. */
var DriveMode = (function () {
  function enabled() { try { return localStorage.getItem('aigm.driveMode') === '1'; } catch (e) { return false; } }
  function set(on) { try { if (on) localStorage.setItem('aigm.driveMode', '1'); else localStorage.removeItem('aigm.driveMode'); } catch (e) {} }
  return { enabled: enabled, set: set };
})();

function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}
