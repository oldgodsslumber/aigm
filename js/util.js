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

/* A descriptive handle ("the scarred dockmaster", "a hooded figure") rather
 * than a proper name ("Garrick"). Used by the wiki upserts to decide when a
 * newly-learned proper name should replace a placeholder handle as an entry's
 * title (demoting the handle to an alias). Deliberately conservative: only
 * article-led or lowercase-led strings count, so two proper names never flip. */
function isDescriptiveHandle(s) {
  s = String(s || '').trim();
  if (!s) return false;
  if (/^(the|a|an|some|that|this|those|these)\s/i.test(s)) return true; // "the masked stranger"
  if (/^[a-z]/.test(s)) return true;                                     // lowercase start
  return false;
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

  /* Autoplay unlock (BOTH speechSynthesis AND the cloud-TTS <audio> element).
   * Browsers block speech/audio playback that isn't tied to a recent user
   * gesture. For device speech this kills drive-mode auto-read (it fires after
   * the async GM reply, long past the tap that started the turn). For cloud TTS
   * (ElevenLabs / AllTalk) it's worse: the audio plays only AFTER an async
   * fetch, so even a manual 🔊 tap is "too late" on iOS — the request still
   * spends credits, but play() is rejected and nothing is heard.
   *
   * Fix: on the first real gesture anywhere, (a) speak a silent utterance to
   * unlock synthesis, and (b) play a silent clip through ONE reusable <audio>
   * element to unlock it. We then route every cloud read through that same
   * unlocked element, so async play() is allowed for the rest of the session. */
  var SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
  var sharedAudio = null;
  var audioUnlocked = false;
  var synthUnlocked = false;

  function ensureAudioEl() {
    if (!sharedAudio && typeof Audio !== 'undefined') {
      sharedAudio = new Audio();
      sharedAudio.preload = 'auto';
    }
    return sharedAudio;
  }
  function primeAudio() {
    if (audioUnlocked) return;
    var a = ensureAudioEl();
    if (!a) return;
    try {
      a.src = SILENT_WAV;
      var p = a.play();
      /* stop the silent clip once it's unlocked — but never yank a real read
       * that may have started on the same element in the same gesture window. */
      if (p && p.then) p.then(function () { if (!audioEl) { try { a.pause(); a.currentTime = 0; } catch (e) {} } }).catch(function () {});
      audioUnlocked = true;   // the element is now user-activated; later async play() is allowed
    } catch (e) { /* ignore */ }
  }
  function prime() {
    if (synth && !synthUnlocked) {
      try {
        var u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
        synth.resume();
        synthUnlocked = true;
      } catch (e) { /* ignore */ }
    }
    primeAudio();
  }
  if (typeof document !== 'undefined') {
    var primeOnce = function () {
      prime();
      document.removeEventListener('pointerdown', primeOnce, true);
      document.removeEventListener('touchstart', primeOnce, true);
      document.removeEventListener('keydown', primeOnce, true);
    };
    document.addEventListener('pointerdown', primeOnce, true);
    document.addEventListener('touchstart', primeOnce, true);
    document.addEventListener('keydown', primeOnce, true);
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

  /* TTS provider: 'device' (Web Speech API, default), 'elevenlabs' (cloud, needs
   * an API key), or 'alltalk' (a local AllTalk TTS server). All provider prefs
   * live in localStorage, device-local like the rest of the read-aloud prefs —
   * they never sync. */
  var PROVIDERS = { elevenlabs: 1, alltalk: 1 };
  function getProvider() { var p = pref('aigm.ttsProvider', 'device'); return PROVIDERS[p] ? p : 'device'; }
  function setProvider(p) { setPref('aigm.ttsProvider', PROVIDERS[p] ? p : 'device'); }
  function getElevenKey() { return pref('aigm.elevenKey', ''); }
  function setElevenKey(k) { setPref('aigm.elevenKey', k || ''); }
  function getElevenVoice() { return pref('aigm.elevenVoice', ''); }
  function setElevenVoice(v) { setPref('aigm.elevenVoice', v || ''); }
  function getElevenModel() { return pref('aigm.elevenModel', 'eleven_multilingual_v2'); }
  function setElevenModel(m) { setPref('aigm.elevenModel', m || ''); }
  /* ElevenLabs is "ready" once a key and a voice are chosen. */
  function elevenReady() { return !!(getElevenKey() && getElevenVoice()); }

  /* AllTalk: a local TTS server. Needs a base URL (default = AllTalk's stock
   * 127.0.0.1:7851); the voice is one of the .wav files the server exposes. */
  function getAlltalkUrl() { return (pref('aigm.alltalkUrl', 'http://127.0.0.1:7851') || '').replace(/\/+$/, ''); }
  function setAlltalkUrl(u) { setPref('aigm.alltalkUrl', (u || '').replace(/\/+$/, '')); }
  function getAlltalkVoice() { return pref('aigm.alltalkVoice', ''); }
  function setAlltalkVoice(v) { setPref('aigm.alltalkVoice', v || ''); }
  /* "ready" once a server URL is set — the voice falls back to AllTalk's default. */
  function alltalkReady() { return !!getAlltalkUrl(); }

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

  /* Chrome stops feeding audio after ~15s of synthesis (a long-standing bug);
   * a periodic resume() keeps a multi-sentence read going to the end. */
  var keepAlive = null;
  var audioEl = null;            // the shared <audio> while a cloud read is active
  function stopAudio() {
    var a = audioEl; audioEl = null;
    if (!a) return;
    try { a.pause(); } catch (e) {}
    a.onended = a.onerror = null;
    if (a._blobUrl) { try { URL.revokeObjectURL(a._blobUrl); } catch (e) {} a._blobUrl = null; }
  }

  /* Play a source URL through the pre-unlocked shared element so async playback
   * is allowed on iOS. isBlob => we own the object URL and revoke it when the
   * read ends or is superseded. A rejected play() is surfaced (not swallowed),
   * since a silent failure here is exactly what wasted the user's credits. */
  function playThroughShared(src, rate, done, isBlob) {
    var a = ensureAudioEl();
    if (!a) { done(); return; }
    if (a._blobUrl) { try { URL.revokeObjectURL(a._blobUrl); } catch (e) {} }
    a._blobUrl = isBlob ? src : null;
    a.onended = done;
    a.onerror = function () { done(); };
    a.src = src;
    try { a.currentTime = 0; } catch (e) {}
    a.playbackRate = rate;
    audioEl = a;
    var p = a.play();
    if (p && p.catch) p.catch(function () {
      done();
      if (typeof Toast === 'function') Toast('Read-aloud was blocked by the browser. Tap anywhere once, then press 🔊 again.');
    });
  }
  function startKeepAlive() {
    stopKeepAlive();
    keepAlive = setInterval(function () {
      if (synth && current) { try { synth.resume(); } catch (e) {} }
      else stopKeepAlive();
    }, 8000);
  }
  function stopKeepAlive() { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } }

  function clearCurrent() {
    var s = current; current = null;
    stopKeepAlive();
    if (s && s.reset) { var r = s.reset; s.reset = null; r(); }
  }

  function stop() {
    clearCurrent();
    stopAudio();
    if (synth) synth.cancel();
  }

  /* Fetch the account's voices for the settings dropdown. cb(list|null) where
   * list is [{id, name}]. Errors (bad key, offline) resolve to null. */
  function elevenVoices(key, cb) {
    key = key || getElevenKey();
    if (!key) { cb(null); return; }
    fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': key } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var vs = (j && j.voices) || [];
        cb(vs.map(function (v) { return { id: v.voice_id, name: v.name + (v.category ? ' (' + v.category + ')' : '') }; }));
      })
      .catch(function () { cb(null); });
  }

  /* Speak via ElevenLabs: one request for the whole passage, played through an
   * <audio> element. Returns true synchronously (playback is async); onend fires
   * when audio finishes, errors, or is stopped — same contract as device speak. */
  function speakEleven(text, opts, session) {
    var rate = opts.rate || getRate();
    var done = function () { if (current === session) clearCurrent(); };
    fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(getElevenVoice()), {
      method: 'POST',
      headers: { 'xi-api-key': getElevenKey(), 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: text,
        model_id: getElevenModel(),
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    }).then(function (res) {
      if (current !== session) return null;           // superseded by a newer speak/stop
      if (!res.ok) {
        /* Surface ElevenLabs' own error detail. 402 = out of credits / quota;
         * 401 = bad or disabled key. The body is JSON like {detail:{message}}. */
        return res.text().then(function (body) {
          var msg = '';
          try { var j = JSON.parse(body); msg = (j.detail && (j.detail.message || j.detail.status)) || j.detail || ''; } catch (e) {}
          if (res.status === 402 && !msg) msg = 'out of credits / quota exceeded';
          if (res.status === 401 && !msg) msg = 'API key rejected';
          throw new Error('HTTP ' + res.status + (msg ? ' — ' + msg : ''));
        });
      }
      return res.blob();
    }).then(function (blob) {
      if (!blob || current !== session) return;
      playThroughShared(URL.createObjectURL(blob), rate, done, true);  // shared el => iOS allows async play
    }).catch(function (e) {
      done();
      if (typeof Toast === 'function') Toast('ElevenLabs read-aloud failed: ' + (e && e.message || 'error') + '.');
    });
    return true;
  }

  /* Fetch the AllTalk server's available voices for the settings dropdown.
   * cb(list|null) where list is [{id, name}]; errors resolve to null. */
  function alltalkVoices(url, cb) {
    url = (url || getAlltalkUrl()).replace(/\/+$/, '');
    if (!url) { cb(null); return; }
    fetch(url + '/api/voices')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var vs = (j && j.voices) || [];
        cb(vs.map(function (v) { return { id: v, name: v }; }));
      })
      .catch(function () { cb(null); });
  }

  /* Speak via a local AllTalk server: POST the passage to /api/tts-generate,
   * then play the WAV it writes (loaded by URL, so only the small JSON POST
   * needs CORS, not the audio). Same true-now / onend-later contract. */
  function speakAlltalk(text, opts, session) {
    var rate = opts.rate || getRate();
    var base = getAlltalkUrl();
    var done = function () { if (current === session) clearCurrent(); };
    var form = new URLSearchParams();
    form.set('text_input', text);
    form.set('text_filtering', 'standard');
    form.set('character_voice_gen', getAlltalkVoice() || 'female_01.wav');
    form.set('narrator_enabled', 'false');
    form.set('narrator_voice_gen', '');
    form.set('text_not_inside', 'character');
    form.set('language', 'en');
    form.set('output_file_name', 'aigm');
    form.set('output_file_timestamp', 'true');
    form.set('autoplay', 'false');
    form.set('autoplay_volume', '0.8');
    fetch(base + '/api/tts-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    }).then(function (res) {
      if (current !== session) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (j) {
      if (!j || current !== session) return;
      if (j.status !== 'generate-success') throw new Error(j.status || 'generation failed');
      var url = j.output_file_url || j.output_cache_url || '';
      if (/^\//.test(url)) url = base + url;          // AllTalk v2 returns a relative path
      if (!url) throw new Error('no audio URL returned');
      playThroughShared(url, rate, done, false);
    }).catch(function (e) {
      done();
      if (typeof Toast === 'function') Toast('AllTalk read-aloud failed: ' + (e && e.message || 'error') + '. Is the AllTalk server running?');
    });
    return true;
  }

  /* opts: { rate, pitch, lang, onend }. onend doubles as a UI-reset callback —
   * it fires when speech finishes naturally OR is stopped/superseded. */
  function speak(text, opts) {
    opts = opts || {};
    /* ElevenLabs path — only when selected AND configured; otherwise fall
     * through to the device voice so a half-set-up key never breaks read-aloud. */
    var provider = getProvider();
    if (provider === 'elevenlabs' && elevenReady()) {
      stop();
      var clean = stripMd(text);
      if (!clean) return false;
      var es = { reset: opts.onend || null };
      current = es;
      return speakEleven(clean, opts, es);
    }
    if (provider === 'alltalk' && alltalkReady()) {
      stop();
      var cleanAt = stripMd(text);
      if (!cleanAt) return false;
      var ats = { reset: opts.onend || null };
      current = ats;
      return speakAlltalk(cleanAt, opts, ats);
    }
    if (!supported()) return false;
    stop();
    var chunks = chunkText(stripMd(text));
    if (!chunks.length) return false;
    var session = { reset: opts.onend || null };
    current = session;
    var voice = opts.voice || chosenVoice();
    var rate = opts.rate || getRate();
    try { synth.resume(); } catch (e) {}   // clear any stuck paused state before queuing
    startKeepAlive();
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

  /* True when read-aloud can work at all (either provider). Drives whether the
   * 🔊 controls are offered, regardless of which provider is active. */
  function available() { return supported() || elevenReady() || alltalkReady(); }

  return {
    supported: supported, available: available, speak: speak, stop: stop, speaking: speaking, prime: prime,
    voices: voices, onVoices: onVoices,
    getVoiceURI: getVoiceURI, setVoiceURI: setVoiceURI,
    getRate: getRate, setRate: setRate,
    getProvider: getProvider, setProvider: setProvider,
    getElevenKey: getElevenKey, setElevenKey: setElevenKey,
    getElevenVoice: getElevenVoice, setElevenVoice: setElevenVoice,
    getElevenModel: getElevenModel, setElevenModel: setElevenModel,
    elevenReady: elevenReady, elevenVoices: elevenVoices,
    getAlltalkUrl: getAlltalkUrl, setAlltalkUrl: setAlltalkUrl,
    getAlltalkVoice: getAlltalkVoice, setAlltalkVoice: setAlltalkVoice,
    alltalkReady: alltalkReady, alltalkVoices: alltalkVoices
  };
})();

/* Speech-to-text via the Web Speech API's SpeechRecognition. Works in Chrome
 * (desktop + Android); iOS Safari does NOT implement it, so supported() returns
 * false there and callers fall back to the native keyboard dictation mic.
 *
 * Continuous dictation: the recognizer keeps listening until the caller stops
 * it. Chrome auto-ends a session after a few seconds of silence (and fires a
 * 'no-speech' error), which would cut you off mid-thought — bad for an RPG
 * where you pause 20–30s to decide your move. So we transparently restart the
 * recognizer whenever it ends on its own, accumulating the transcript across
 * restarts. Only an explicit stop() or a fatal mic error (permission denied /
 * no microphone) actually ends the session. Must be started from a user
 * gesture. */
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
    /* committed: final text from recognizer sessions that have already ended
     * (we transparently restart after each silence timeout). finalText mirrors
     * the best full transcript so far, for the onEnd callback. */
    var s = { stopped: false, fatal: null, committed: '', finalText: '', rec: null };
    session = s;

    function join(a, b) {
      a = (a || '').trim(); b = (b || '').trim();
      return a && b ? a + ' ' + b : a + b;
    }

    function build() {
      var rec = new Rec();
      rec.lang = opts.lang || 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      /* Recompute THIS session's transcript from the full results list on every
       * event instead of incrementally appending. Android Chrome re-fires final
       * results (and its resultIndex is unreliable), so an incremental "+=" would
       * duplicate phrases — "go this way" written twice. Recomputing is idempotent:
       * re-reported results just yield the same string. */
      var sessionFinal = '';
      rec.onresult = function (ev) {
        var fin = '', interim = '';
        for (var i = 0; i < ev.results.length; i++) {
          var r = ev.results[i];
          if (r.isFinal) fin += r[0].transcript;
          else interim += r[0].transcript;
        }
        sessionFinal = fin;
        s.finalText = join(s.committed, sessionFinal);
        if (opts.onText) opts.onText(join(s.finalText, interim), false);
      };
      rec.onerror = function (ev) {
        var err = ev.error || 'error';
        /* fatal errors really end the session; 'no-speech'/'aborted' are the
         * normal silence-timeout signals — let onend restart instead. */
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') s.fatal = err;
      };
      rec.onend = function () {
        if (session !== s) return;                 // superseded by a newer start/stop
        /* fold this session's final transcript into the committed total once,
         * here — not per-event — so a restart never re-counts what it heard. */
        s.committed = join(s.committed, sessionFinal);
        s.finalText = s.committed;
        if (s.stopped || s.fatal) {
          session = null;
          if (opts.onText && s.finalText.trim()) opts.onText(s.finalText.trim(), true);
          if (opts.onEnd) opts.onEnd(s.fatal || 'stopped');
          return;
        }
        /* ended on its own (silence) — keep listening */
        try { build(); } catch (e) { session = null; if (opts.onEnd) opts.onEnd('error'); }
      };
      s.rec = rec;
      rec.start();
    }

    try { build(); } catch (e) { session = null; return false; }
    return true;
  }

  function listening() { return !!session; }

  /* explicit stop — keeps any final transcript, fires onEnd('stopped') */
  function stop() {
    if (session) { session.stopped = true; try { session.rec.stop(); } catch (e) {} }
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
