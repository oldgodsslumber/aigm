/* AI GM — LLM backends. Both consume the same {system, messages} shape.
 * messages: [{role: 'user'|'assistant', content: string}]
 * Returns {text, model?, used?, limit?, label?}.
 * Throws Error with a player-friendly message.
 *
 * Gemini behavior adapted from the Story Bible app:
 *  - Safety filters fully disabled (BLOCK_NONE) so dramatic RPG content
 *    isn't refused.
 *  - Automatic model fall-through: when the chosen model hits its daily
 *    free-tier limit (tracked locally) or returns a 429, the next model in
 *    the chain is used instead — invisibly to the player.
 *  - Per-model daily request counts are tracked in localStorage so the UI
 *    can remind the player how many requests they've spent today. */
const LLM = (function () {

  /* Weak models (Gemma, most local endpoints) forget the REPLY MARKER rule by
   * the time they generate — it's buried near the top of a long prompt. Repeat
   * it as the LAST thing they see, right before the reply, so they actually
   * emit the marker and views-play can cut their scratchpad cleanly. */
  const REPLY_REMINDER = 'REMINDER — Before your reply you may think or plan, but you MUST write the marker <<<REPLY>>> on its own line, then put your in-character narration (and any gm-* blocks) after it. Everything before the marker is discarded. Do this on EVERY turn.';

  /* Append the reminder to the last user turn (Gemini "contents" shape: parts). */
  function remindGemini(contents) {
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') { contents[i].parts.push({ text: '\n\n' + REPLY_REMINDER }); return; }
    }
    contents.push({ role: 'user', parts: [{ text: REPLY_REMINDER }] });
  }

  /* ---- Fallback chain for free-tier Gemini usage ----
   * Start at the top; when a model hits its daily limit or a 429, fall
   * through to the next. dailyLimit values are Google's free-tier numbers
   * (mid-2026); Google adjusts these often — edit here if they change. */
  const GEMINI_FALLBACK_CHAIN = [
    { id: 'gemini-2.5-flash',      dailyLimit: 20,   label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', dailyLimit: 20,   label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemma-4-31b-it',        dailyLimit: 1500, label: 'Gemma 4 31B' },
    { id: 'gemma-4-26b-a4b-it',    dailyLimit: 1500, label: 'Gemma 4 26B-A4B' }
  ];

  /* Curated, valid model IDs for the Settings picker — so the player selects a
   * known-good id instead of typing one (a typo yields a 400 "unexpected model
   * name format"). The first four are the auto-fallback chain. */
  const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash — default, auto-falls through · 20/day free' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite — faster · 20/day free' },
    { id: 'gemma-4-31b-it',        label: 'Gemma 4 31B — dense, big free quota · 1500/day' },
    { id: 'gemma-4-26b-a4b-it',    label: 'Gemma 4 26B-A4B — MoE, big free quota · 1500/day' },
    { id: 'gemma-4-e4b-it',        label: 'Gemma 4 E4B — small / fast' },
    { id: 'gemma-4-e2b-it',        label: 'Gemma 4 E2B — smallest / fastest' },
    { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro — smartest, lowest free quota' },
    { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash — older (often paid tier)' },
    { id: 'gemma-3-27b-it',        label: 'Gemma 3 27B — availability varies' },
    { id: 'gemma-3-12b-it',        label: 'Gemma 3 12B — availability varies' }
  ];

  /* ---- Per-model daily usage tracking (localStorage) ----
   * { date: "YYYY-MM-DD", counts: { modelId: n } }. Resets at local midnight. */
  const USAGE_KEY = 'aigm:llm-usage';

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function getUsage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(USAGE_KEY));
      if (parsed && parsed.date === todayKey()) return parsed;
    } catch (e) { /* ignore */ }
    return { date: todayKey(), counts: {} };
  }

  function setUsage(u) { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); }

  function bumpUsage(modelId) {
    const u = getUsage();
    u.counts[modelId] = (u.counts[modelId] || 0) + 1;
    setUsage(u);
    return u.counts[modelId];
  }

  function markExhausted(modelId) {
    const u = getUsage();
    const entry = GEMINI_FALLBACK_CHAIN.find(function (c) { return c.id === modelId; });
    /* bump to the limit (or +1 if off-chain) so pickActiveModel skips it */
    u.counts[modelId] = entry ? entry.dailyLimit : (u.counts[modelId] || 0) + 1;
    setUsage(u);
  }

  function limitFor(modelId) {
    const entry = GEMINI_FALLBACK_CHAIN.find(function (c) { return c.id === modelId; });
    return entry ? entry.dailyLimit : 0;
  }

  function labelFor(modelId) {
    const entry = GEMINI_FALLBACK_CHAIN.find(function (c) { return c.id === modelId; });
    return entry ? entry.label : modelId;
  }

  /* Pick the model to actually call. If the chosen model is in the chain and
   * exhausted for today, return the next non-exhausted one. A model the user
   * picked manually (off-chain, e.g. gemini-2.5-pro) is returned as-is. */
  function pickActiveModel(chosen) {
    const u = getUsage();
    const start = GEMINI_FALLBACK_CHAIN.findIndex(function (c) { return c.id === chosen; });
    if (start < 0) return chosen; // manual override outside the chain
    for (let i = start; i < GEMINI_FALLBACK_CHAIN.length; i++) {
      const e = GEMINI_FALLBACK_CHAIN[i];
      if ((u.counts[e.id] || 0) < e.dailyLimit) return e.id;
    }
    /* everything exhausted — return the last so the user sees Google's real
     * rate-limit error rather than nothing */
    return GEMINI_FALLBACK_CHAIN[GEMINI_FALLBACK_CHAIN.length - 1].id;
  }

  /* Safety filters fully off. The GM narrates action, danger, and violence
   * that Gemini's defaults routinely block as "harmful". BLOCK_NONE may be
   * rejected by projects without billing — if so the user sees that error
   * and can switch to a Gemma model (not filtered the same way). */
  const SAFETY_OFF = [
    { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY',   threshold: 'BLOCK_NONE' }
  ];

  /* Build a player-friendly Gemini error message from the HTTP status and
   * the raw error body. The most important case is a 429 with limit:0, which
   * is NOT a temporary rate limit — it means the key has no free-tier quota
   * (usually a billing-enabled project, or a key not made through AI Studio). */
  function buildGeminiErrorMessage(status, errText, model) {
    let err = {};
    try { err = (JSON.parse(errText).error) || {}; } catch (e) { /* ignore */ }
    const msg = err.message || '';
    const details = Array.isArray(err.details) ? err.details : [];

    if (status === 429) {
      /* Google packs the specifics into error.details:
       *   - QuotaFailure: which quota tripped (quotaId / quotaMetric names the
       *     window — "PerDay" vs "PerMinute") and its limit (0 = no quota).
       *   - RetryInfo: how long to wait (retryDelay like "27s").
       * We read these structured fields, falling back to the message text. */
      let quotaId = '', quotaMetric = '', limitZero = false, retrySecs = null;
      details.forEach(function (d) {
        const type = d['@type'] || '';
        if (/QuotaFailure/i.test(type) && Array.isArray(d.violations)) {
          d.violations.forEach(function (v) {
            quotaId = quotaId || v.quotaId || '';
            quotaMetric = quotaMetric || v.quotaMetric || '';
            if (v.quotaValue === '0' || v.quotaValue === 0) limitZero = true;
          });
        }
        if (/RetryInfo/i.test(type) && d.retryDelay) {
          const rm = String(d.retryDelay).match(/(\d+)/);
          if (rm) retrySecs = rm[1];
        }
      });
      if (retrySecs == null) {
        const m = msg.match(/retry in (\d+)/i);
        if (m) retrySecs = m[1];
      }
      const quotaStr = quotaId + ' ' + quotaMetric;
      const perDay = /PerDay|RequestsPerDay/i.test(quotaStr);
      const perMinute = /PerMinute|RequestsPerMinute/i.test(quotaStr);

      /* No quota at all — billing-enabled or non-AI-Studio key. Not temporary. */
      if (limitZero || (/limit:\s*0/i.test(msg) && /free_tier/i.test(msg))) {
        return [
          'Gemini ' + status + ' — this API key has zero free-tier quota (not a temporary rate limit).',
          'Most likely the key is from a Google Cloud project with billing enabled, or it wasn\'t created through AI Studio.',
          'Fix: open https://aistudio.google.com/app/api-keys, delete this key, create a new one and let AI Studio pick the project, then paste it into Settings.'
        ].join('\n');
      }
      /* Daily free-tier quota used up — won't clear until midnight Pacific. */
      if (perDay) {
        return [
          'Gemini daily quota used up for ' + labelFor(model) + ' — you\'ve hit Google\'s free-tier requests-per-day limit.',
          'This resets at midnight Pacific, not in a few seconds. The app already falls through to other models automatically;',
          'if they\'re all spent, switch to a Gemma model in Settings (much larger daily quota) or try again tomorrow.'
        ].join('\n');
      }
      /* Per-minute burst limit — genuinely temporary, clears in seconds. */
      if (perMinute) {
        return 'Gemini per-minute rate limit hit for ' + labelFor(model) + ' (too many requests too fast). ' +
          'This clears on its own' + (retrySecs ? ' — wait ~' + retrySecs + 's and try again.' : ' in under a minute — just wait and retry.');
      }
      /* Window unknown — generic 429 with whatever retry hint we found. */
      return 'Gemini rate limit hit for ' + labelFor(model) + '.' + (retrySecs ? ' Retry in ~' + retrySecs + 's.' : '');
    }
    if (status === 400 && /API key not valid/i.test(msg)) {
      return 'Gemini rejected the API key — re-paste it from https://aistudio.google.com/app/api-keys (starts with AIza…).';
    }
    if (status === 400 && /API key/i.test(msg)) return 'Gemini rejected the API key. Check it in Settings.';
    if (status === 401 || status === 403) return 'Gemini rejected the API key, or it lacks access to ' + model + '. Check it in Settings.';
    if (status === 404) return 'Model "' + model + '" not found. Check the model name in Settings.';
    if (status >= 500 && status < 600) {
      return 'Gemini ' + status + ' — Google\'s API is temporarily unavailable. This is on their end; it usually clears in a few seconds.' +
        (msg ? '\n\nGoogle\'s message: ' + msg.slice(0, 200) : '');
    }
    return 'Gemini error (' + status + ')' + (msg ? ': ' + msg : '');
  }

  /* Build a player-friendly message for a 200-OK response that carried no text.
   * Unlike HTTP errors (handled in buildGeminiErrorMessage), these come back as
   * a successful call whose candidate has no usable parts. Gemini signals the
   * actual reason two ways:
   *   - promptFeedback.blockReason — the *input* was blocked before generation
   *   - candidate.finishReason     — generation started then stopped/was cut
   * We surface each distinctly so the player knows whether to rephrase, retry,
   * switch models, or raise the token budget. */
  function buildEmptyResponseMessage(data, cand, model) {
    /* 1) The whole prompt was rejected — nothing was generated at all. */
    const pf = data && data.promptFeedback;
    if (pf && pf.blockReason) {
      if (/SAFETY/i.test(pf.blockReason)) {
        return 'Gemini blocked your prompt as unsafe before generating anything. ' +
          'Safety filters are already off for ' + labelFor(model) + ', so this is a hard block — ' +
          'try rephrasing, or switch to a Gemma model in Settings (filtered differently).';
      }
      return 'Gemini blocked your prompt (' + pf.blockReason + ') before generating anything. ' +
        'Try rephrasing it, or switch models in Settings.';
    }

    /* 2) Generation started, then stopped without emitting text. */
    const reason = cand && cand.finishReason;
    switch (reason) {
      case 'MAX_TOKENS':
        return 'Gemini hit its output limit before returning any text — its "thinking" used the whole budget. ' +
          'Try a narrower topic, raise the token budget, or pick a non-2.5 model in Settings.';
      case 'SAFETY':
        return 'Gemini stopped on its safety filter and returned nothing. ' +
          'Filters are already off for ' + labelFor(model) + ', so try rephrasing, ' +
          'or switch to a Gemma model in Settings (filtered differently).';
      case 'RECITATION':
        return 'Gemini stopped because its reply matched copyrighted/recited material. ' +
          'Rephrase to ask for original content, or retry — this is often non-deterministic.';
      case 'PROHIBITED_CONTENT':
      case 'SPII':
      case 'BLOCKLIST':
        return 'Gemini refused to answer (' + reason + ') and returned nothing. ' +
          'Try rephrasing, or switch models in Settings.';
      case 'OTHER':
        return 'Gemini stopped for an unspecified reason (finishReason: OTHER) and returned no text. ' +
          'This is usually transient — try again, or switch models in Settings.';
      case 'STOP':
      case undefined:
      case null:
        /* Finished "normally" but empty — typically a 2.5 model whose thinking
         * ate the entire budget, or a momentary hiccup. */
        return 'Gemini returned an empty reply. This usually means its "thinking" consumed the output budget — ' +
          'retry, raise the token budget, or pick a non-2.5 model (e.g. a Gemma) in Settings.';
      default:
        return 'Gemini returned no text (finishReason: ' + reason + '). Try again, or switch models in Settings.';
    }
  }

  /* fetch with an abort-based timeout so a stuck request fails fast instead of
   * hanging the UI forever. */
  async function fetchTimeout(url, init, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, ms);
    try {
      return await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function callGeminiModel(settings, model, system, messages, options) {
    options = options || {};
    const grounding = options.grounding === true;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(settings.geminiKey);

    /* Gemma models on the Gemini API are not part of the tunable-safety system
     * and are not in the structured-output model set (per Google's docs). They
     * accept systemInstruction, but to be maximally robust we fold the system
     * prompt into the first user turn for Gemma and omit safetySettings — both
     * are Gemini-only features whose presence can make a Gemma call fail. */
    const isGemma = /^gemma/i.test(model);

    const contents = messages.map(function (m) {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    });

    const body = {
      contents: contents,
      generationConfig: {
        temperature: (options.temperature != null ? options.temperature : settings.temperature),
        maxOutputTokens: options.maxTokens || 2048
      }
    };
    /* Gemini 2.5 models "think" by default, which consumes the output budget —
     * on extraction tasks that can exhaust it before any text is emitted
     * (finishReason MAX_TOKENS, empty parts). Disable thinking when asked. */
    if (options.thinking === false && /gemini-2\.5-flash/i.test(model)) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    /* JSON mode — guarantees a parseable JSON reply. Gemini-only, and not
     * combinable with grounding (search returns prose + citations). */
    if (options.jsonMode && !isGemma && !grounding) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    if (system) {
      if (isGemma) {
        const firstUser = contents.find(function (c) { return c.role === 'user'; });
        if (firstUser) firstUser.parts.unshift({ text: system + '\n\n' });
        else contents.unshift({ role: 'user', parts: [{ text: system }] });
      } else {
        body.systemInstruction = { parts: [{ text: system }] };
      }
    }
    if (isGemma) remindGemini(contents);
    if (!isGemma) body.safetySettings = SAFETY_OFF;
    /* Grounding with Google Search — Gemini 2.x only (Gemma can't ground). The
     * model retrieves live web results and folds the facts into its reply. */
    if (grounding && !isGemma) body.tools = [{ google_search: {} }];
    const timeoutMs = grounding ? 120000 : 60000;
    console.log('[llm] gemini call', { model: model, grounding: grounding, maxTokens: body.generationConfig.maxOutputTokens });
    let res;
    try {
      res = await fetchTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('Gemini timed out after ' + Math.round(timeoutMs / 1000) + 's' +
          (grounding ? ' — web search can be slow or blocked on this key; try again with “Search the web” off.' : ' — try again, or pick a faster model in Settings.'));
      }
      throw new Error('Could not reach Gemini — check your connection.');
    }
    if (!res.ok) {
      let errText = '';
      try { errText = await res.text(); } catch (e) { /* ignore */ }
      const err = new Error(buildGeminiErrorMessage(res.status, errText, model));
      err.status = res.status;
      throw err;
    }
    /* A 200 means Google accepted and ran the call — it consumes a free-tier
     * request NOW, before we know whether usable text came back. Count it here
     * so an empty or filtered reply (thinking ate the budget, soft block,
     * finishReason MAX_TOKENS) is still tallied — that response spent quota just
     * like a good one. Errors that never reach a 200 (429, 5xx, timeouts) skip
     * this and are correctly NOT counted, since Google doesn't bill them. */
    const used = bumpUsage(model);
    const data = await res.json();
    const cand = data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) {
      throw new Error(buildEmptyResponseMessage(data, cand, model));
    }
    return { text: text, used: used };
  }

  async function gemini(settings, system, messages, options) {
    if (!settings.geminiKey) throw new Error('No Gemini API key set. Add yours in Settings — it stays on this device.');
    options = options || {};

    const chosen = settings.geminiModel || 'gemini-2.5-flash';

    /* Grounded request: pin to a Gemini model (Gemma can't search). Fall back
     * only to Flash Lite on a 429 — never to a non-grounding model. */
    const gen = { grounding: options.grounding === true, maxTokens: options.maxTokens, thinking: options.thinking, jsonMode: options.jsonMode, temperature: options.temperature };

    if (options.grounding) {
      let active = /^gemini/i.test(chosen) ? chosen : 'gemini-2.5-flash';
      let result;
      try {
        result = await callGeminiModel(settings, active, system, messages, gen);
      } catch (err) {
        if (err.status !== 429 || active === 'gemini-2.5-flash-lite') throw err;
        markExhausted(active);
        active = 'gemini-2.5-flash-lite';
        result = await callGeminiModel(settings, active, system, messages, gen);
      }
      return { text: result.text, model: active, label: labelFor(active), used: result.used, limit: limitFor(active) };
    }

    let active = pickActiveModel(chosen);
    if (active !== chosen) {
      console.log('[llm] ' + chosen + ' exhausted for today — falling through to ' + active);
    }

    let result;
    try {
      result = await callGeminiModel(settings, active, system, messages, gen);
    } catch (err) {
      /* On a 429, mark this model exhausted and try the next in the chain.
       * Handles the case where Google's count is ahead of our local one. */
      if (err.status !== 429) throw err;
      markExhausted(active);
      const next = pickActiveModel(active);
      if (next === active) throw err; // no more chain to fall through to
      console.log('[llm] ' + active + ' hit 429 — auto-switching to ' + next);
      active = next;
      result = await callGeminiModel(settings, active, system, messages, gen);
    }

    return { text: result.text, model: active, label: labelFor(active), used: result.used, limit: limitFor(active) };
  }

  async function local(settings, system, messages, options) {
    options = options || {};
    const base = (settings.localUrl || 'http://localhost:5000/v1').replace(/\/+$/, '');
    const convo = messages.map(function (m) { return { role: m.role, content: m.content }; });
    /* Same marker reminder as Gemma — local endpoints are weak too (see above). */
    for (let i = convo.length - 1; i >= 0; i--) {
      if (convo[i].role === 'user') { convo[i].content += '\n\n' + REPLY_REMINDER; break; }
    }
    const body = {
      model: settings.localModel || undefined,
      messages: [{ role: 'system', content: system }].concat(convo),
      temperature: (options.temperature != null ? options.temperature : settings.temperature),
      max_tokens: options.maxTokens || 1024
    };
    let res;
    try {
      res = await fetchTimeout(base + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, 120000);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The local endpoint timed out after 120s.');
      throw new Error('Could not reach the local endpoint at ' + base +
        '. Is the backend running with its API enabled and CORS allowed for this origin? (Chrome required for local mode.)');
    }
    if (!res.ok) throw new Error('Local endpoint error (' + res.status + ').');
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Local endpoint returned no text.');
    return { text: text };
  }

  /* Retry transient server-side failures (5xx). A 429 is NOT retried here —
   * Gemini handles rate limits by switching models inside gemini(). */
  const MAX_RETRIES = 2;
  const RETRY_DELAYS_MS = [1500, 4000];

  function isTransientError(err) {
    const msg = (err && err.message) || String(err);
    return /\b5\d\d\b/.test(msg) && /(temporarily unavailable|UNAVAILABLE|INTERNAL|server|overloaded)/i.test(msg);
  }

  return {
    chat: async function (opts) {
      const s = opts.settings;
      const run = function () {
        const gen = { grounding: opts.grounding === true, maxTokens: opts.maxTokens, thinking: opts.thinking, jsonMode: opts.jsonMode === true, temperature: opts.temperature };
        if (s.backend === 'local') return local(s, opts.system, opts.messages, gen);
        return gemini(s, opts.system, opts.messages, gen);
      };
      let lastErr = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = RETRY_DELAYS_MS[attempt - 1] || 4000;
          console.log('[llm] transient error, retry ' + attempt + '/' + MAX_RETRIES + ' after ' + delay + 'ms');
          await new Promise(function (r) { setTimeout(r, delay); });
        }
        try {
          return await run();
        } catch (err) {
          lastErr = err;
          if (!isTransientError(err)) throw err;
        }
      }
      throw new Error((lastErr && lastErr.message ? lastErr.message : String(lastErr)) +
        '\n\n(Retried ' + MAX_RETRIES + ' times — the provider\'s API is having sustained problems. Try again in a minute.)');
    },
    /* Selectable Gemini/Gemma model IDs for the Settings dropdown. */
    models: function () { return GEMINI_MODELS.slice(); },
    /* Today's Gemini request usage, for the UI reminder. Returns an array of
     * { id, label, used, limit } for each model in the fallback chain. */
    geminiUsage: function () {
      const u = getUsage();
      return GEMINI_FALLBACK_CHAIN.map(function (c) {
        return { id: c.id, label: c.label, used: u.counts[c.id] || 0, limit: c.dailyLimit };
      });
    }
  };
})();
