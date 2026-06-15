/* AI GM — LLM backends. Both consume the same {system, messages} shape.
 * messages: [{role: 'user'|'assistant', content: string}]
 * Returns {text}. Throws Error with a player-friendly message. */
const LLM = (function () {

  async function gemini(settings, system, messages) {
    if (!settings.geminiKey) throw new Error('No Gemini API key set. Add yours in Settings — it stays on this device.');
    const model = settings.geminiModel || 'gemini-2.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(settings.geminiKey);
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      }),
      generationConfig: { temperature: settings.temperature, maxOutputTokens: 2048 }
    };
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('Could not reach Gemini — check your connection.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error.message; } catch (e) { /* ignore */ }
      if (res.status === 400 && /API key/i.test(detail)) throw new Error('Gemini rejected the API key. Check it in Settings.');
      if (res.status === 403 || res.status === 401) throw new Error('Gemini rejected the API key. Check it in Settings.');
      if (res.status === 404) throw new Error('Model "' + model + '" not found. Check the model name in Settings.');
      if (res.status === 429) throw new Error('Gemini rate limit hit. Wait a moment and retry.');
      throw new Error('Gemini error (' + res.status + ')' + (detail ? ': ' + detail : ''));
    }
    const data = await res.json();
    const cand = data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) {
      const reason = cand && cand.finishReason;
      throw new Error('Gemini returned no text' + (reason ? ' (finishReason: ' + reason + ')' : '') + '.');
    }
    return { text: text };
  }

  async function local(settings, system, messages) {
    const base = (settings.localUrl || 'http://localhost:5000/v1').replace(/\/+$/, '');
    const body = {
      model: settings.localModel || undefined,
      messages: [{ role: 'system', content: system }].concat(messages.map(function (m) {
        return { role: m.role, content: m.content };
      })),
      temperature: settings.temperature,
      max_tokens: 1024
    };
    let res;
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Could not reach the local endpoint at ' + base +
        '. Is the backend running with its API enabled and CORS allowed for this origin? (Chrome required for local mode.)');
    }
    if (!res.ok) throw new Error('Local endpoint error (' + res.status + ').');
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Local endpoint returned no text.');
    return { text: text };
  }

  return {
    chat: async function (opts) {
      const s = opts.settings;
      if (s.backend === 'local') return local(s, opts.system, opts.messages);
      return gemini(s, opts.system, opts.messages);
    }
  };
})();
