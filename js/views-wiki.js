/* AI GM — Wiki view: browse, search, edit, merge, pin. */
window.Views = window.Views || {};

Views.wiki = async function (root, cid) {
  root.dataset.screenLabel = 'Wiki View';
  const campaign = await Store.getCampaign(cid);
  let entries = await Store.listWiki(cid);
  const TYPES = ['pc', 'npc', 'location', 'faction', 'item', 'event', 'plan'];
  let typeFilter = '', query = '', showHidden = false;

  root.innerHTML = '';
  const listEl = h('div', { class: 'card-grid wiki-grid' });
  const search = h('input', { type: 'search', class: 'wiki-search', placeholder: 'Search names, aliases, tags…' });
  search.addEventListener('input', debounce(function () { query = search.value.toLowerCase(); renderList(); }, 200));

  const chips = h('div', { class: 'chip-row' });
  [''].concat(TYPES).forEach(function (t) {
    const c = h('button', { class: 'chip' + (t === typeFilter ? ' on' : '') }, t || 'all');
    c.addEventListener('click', function () {
      typeFilter = t;
      chips.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on');
      renderList();
    });
    chips.append(c);
  });

  const hiddenToggle = h('button', { class: 'chip hidden-toggle', title: 'Reveal GM-only entries the player can\'t normally see' }, '🔒 Show hidden');
  hiddenToggle.addEventListener('click', function () {
    showHidden = !showHidden;
    hiddenToggle.classList.toggle('on', showHidden);
    hiddenToggle.textContent = (showHidden ? '🔓 Hide GM-only' : '🔒 Show hidden');
    renderList();
  });

  const newBtn = h('button', { class: 'btn accent' }, 'New entry');
  newBtn.addEventListener('click', function () {
    openEditor({ type: 'npc', name: '', aliases: [], tags: [], body: '', createdBy: 'user', mergedInto: null });
  });

  /* ---- "Add world info": freeform notes filed into entries by the LLM ---- */
  const worldTa = h('textarea', { class: 'world-intake-input', rows: '4', placeholder: 'Paste or type anything about your world — characters, places, factions, history, items. This won’t start a scene or advance the story; it just gets filed into the wiki as entries.' });
  const intakeBtn = h('button', { class: 'btn accent' }, 'Add to wiki');
  const intakeStatus = h('span', { class: 'card-sub intake-status' });
  intakeBtn.addEventListener('click', runIntake);
  worldTa.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runIntake(); }
  });

  /* ---- "Generate from a topic": pull a setting/franchise in via the LLM ---- */
  const topicInp = h('input', { type: 'text', class: 'topic-input', placeholder: 'A setting or franchise to import — e.g. “Star Wars: the Galactic Civil War” or “Marvel: the Avengers”' });
  const webChk = h('input', { type: 'checkbox' });
  const topicBtn = h('button', { class: 'btn accent' }, 'Generate entries');
  const topicStatus = h('span', { class: 'card-sub intake-status' });
  topicBtn.addEventListener('click', runTopic);
  topicInp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); runTopic(); }
  });

  /* ---- AI Plan: generate / update a hidden, MotW-style threat plan ---- */
  const planBtn = h('button', { class: 'btn' }, '✦ AI Plan');
  planBtn.addEventListener('click', function () { openPlanModal(false); });
  const updatePlanBtn = h('button', { class: 'btn' }, '↻ Update plan');
  updatePlanBtn.addEventListener('click', function () { openPlanModal(true); });

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('h1', null, 'Wiki', h('span', { class: 'head-sub' }, campaign.name)),
      h('div', { class: 'page-head-actions' }, planBtn, updatePlanBtn, newBtn)),
    h('details', { class: 'wiki-intake', open: '' },
      h('summary', null, 'Add world info'),
      h('p', { class: 'card-sub' }, 'Drop in lore and notes; they’re filed into the wiki as characters, locations, factions, items, and events — without touching the story.'),
      worldTa,
      h('div', { class: 'wiki-intake-actions' }, intakeBtn, intakeStatus),
      h('div', { class: 'topic-gen' },
        h('p', { class: 'card-sub' }, 'Or pull a setting in from a topic — the AI writes the entries. Tick “Search the web” for live, grounded facts (Gemini only).'),
        topicInp,
        h('div', { class: 'wiki-intake-actions' },
          topicBtn,
          h('label', { class: 'inline-pair' }, webChk, h('span', null, 'Search the web')),
          topicStatus))),
    h('div', { class: 'wiki-toolbar' }, search, chips, hiddenToggle),
    listEl));

  function planExists() {
    return entries.some(function (e) { return !e.mergedInto && e.type === 'plan'; });
  }

  /* Robustly turn ANY model reply into clean entry objects — we don't trust the
   * model to format well (weak free models dump prose, markdown, partial JSON).
   * Strategy: try strict JSON, then an array substring, then a balanced-brace
   * scan that pulls every {...} object out of prose, then gm-wiki fences. Every
   * candidate is run through sanitizeEntry, which is what actually "cleans"
   * the data: valid type, trimmed name, array aliases/tags, de-marked + capped
   * body. Anything without a usable name is dropped (never dumped raw). */
  const ENTRY_TYPES = ['pc', 'npc', 'location', 'faction', 'item', 'event', 'plan'];

  function relaxedParse(s) {
    try { return JSON.parse(s); } catch (e) { /* retry */ }
    try { return JSON.parse(String(s).replace(/,\s*([}\]])/g, '$1')); } catch (e) { return undefined; }
  }

  /* pull out every top-level {...} object, respecting strings/escapes */
  function scanObjects(s) {
    const out = [];
    let depth = 0, start = -1, inStr = false, esc = false, q = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === q) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; q = c; }
      else if (c === '{') { if (depth === 0) start = i; depth++; }
      else if (c === '}') { if (depth > 0) { depth--; if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; } } }
    }
    return out;
  }

  function toArr(v) {
    let list = [];
    if (Array.isArray(v)) list = v;
    else if (typeof v === 'string') list = v.split(',');
    return list.map(function (x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); })
      .filter(Boolean).slice(0, 12);
  }

  function sanitizeEntry(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const name = String(o.name == null ? '' : o.name).replace(/\s+/g, ' ').trim();
    if (!name || name.length > 100) return null; // no name / a sentence, not an entry
    let type = String(o.type == null ? '' : o.type).toLowerCase().trim();
    if (ENTRY_TYPES.indexOf(type) < 0) type = 'npc';
    const cleanText = function (val, cap) {
      let s = String(val == null ? '' : val)
        .replace(/```[\s\S]*?```/g, ' ')   // drop code fences
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (s.length > cap) s = s.slice(0, cap).trim() + '…';
      return s;
    };
    const out = { type: type, name: name, aliases: toArr(o.aliases), tags: toArr(o.tags), body: cleanText(o.body, 2000) };
    if (o.hidden === true || o.hidden === 'true') out.hidden = true;
    const secret = cleanText(o.secret, 2000);
    if (secret) out.secret = secret;
    return out;
  }

  function parseWikiBlocks(text) {
    const candidates = [];
    const addFrom = function (v) {
      if (Array.isArray(v)) v.forEach(addFrom);
      else if (v && typeof v === 'object') {
        if (Array.isArray(v.entries)) v.entries.forEach(addFrom);
        else candidates.push(v);
      }
    };

    let t = String(text || '').trim();
    const fence = t.match(/```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();

    /* 1. whole reply as JSON */
    const whole = relaxedParse(t);
    if (whole !== undefined) addFrom(whole);

    /* 2. the first [...] array substring */
    if (!candidates.length) {
      const open = t.indexOf('['), close = t.lastIndexOf(']');
      if (open >= 0 && close > open) { const arr = relaxedParse(t.slice(open, close + 1)); if (arr !== undefined) addFrom(arr); }
    }

    /* 3. every balanced {...} object found anywhere in the text */
    if (!candidates.length) {
      scanObjects(t).forEach(function (chunk) { const o = relaxedParse(chunk); if (o !== undefined) addFrom(o); });
    }

    /* 4. gm-wiki fenced blocks, if the model used them */
    if (!candidates.length) {
      Tags.parse(text).blocks.filter(function (b) { return b.tag === 'gm-wiki'; })
        .forEach(function (b) { addFrom(b.data); });
    }

    const cleaned = [];
    candidates.forEach(function (o) { const s = sanitizeEntry(o); if (s) cleaned.push(s); });
    return cleaned;
  }

  /* Name/alias-based upsert: update an existing entry if the name matches,
   * otherwise create. Mirrors the GM's in-play wiki upsert. opts.hiddenOnCreate
   * marks NEW entries hidden (used by the AI Plan flow); existing entries keep
   * their own hidden flag unless the block explicitly sets hidden:true. */
  async function upsertFromData(data, opts) {
    opts = opts || {};
    const name = String(data.name || '').trim();
    if (!name) return null;
    const list = await Store.listWiki(cid);
    const found = list.find(function (e) {
      if (e.mergedInto) return false;
      const names = [e.name].concat(e.aliases || []).map(function (n) { return n.toLowerCase(); });
      return names.indexOf(name.toLowerCase()) >= 0;
    });
    if (found) {
      found.aliases = found.aliases || [];
      found.tags = found.tags || [];
      found.body = data.body || found.body;
      found.type = data.type || found.type;
      if (data.hidden === true) found.hidden = true;
      if (data.secret && String(data.secret).trim()) found.secret = String(data.secret).trim();
      (data.aliases || []).forEach(function (a) {
        if (a && found.aliases.indexOf(a) < 0 && a.toLowerCase() !== found.name.toLowerCase()) found.aliases.push(a);
      });
      (data.tags || []).forEach(function (t) { if (t && found.tags.indexOf(t) < 0) found.tags.push(t); });
      await Store.saveWiki(cid, found);
      return { updated: true };
    }
    await Store.saveWiki(cid, {
      type: data.type || 'npc', name: name, aliases: data.aliases || [],
      tags: data.tags || [], body: data.body || '', createdBy: 'llm', mergedInto: null,
      hidden: opts.hiddenOnCreate === true || data.hidden === true,
      secret: (data.secret && String(data.secret).trim()) || ''
    });
    return { updated: false };
  }

  async function runIntake() {
    const text = worldTa.value.trim();
    if (!text || intakeBtn.disabled) return;
    const settings = Settings.forCampaign(campaign);
    if (settings.backend === 'gemini' && !settings.geminiKey) {
      Toast('No Gemini API key set — add yours in Settings.');
      return;
    }
    intakeBtn.disabled = true;
    const origLabel = intakeBtn.textContent;
    intakeBtn.textContent = 'Reading…';
    intakeStatus.textContent = '';
    try {
      const existingNames = entries.filter(function (e) { return !e.mergedInto; }).map(function (e) { return e.name; });
      const system = Context.wikiIntakePrompt({ genres: campaign.genres, setting: campaign.setting, existingNames: existingNames });
      const res = await LLM.chat({ settings: settings, system: system, messages: [{ role: 'user', content: text }], maxTokens: 4096, thinking: false, jsonMode: true, temperature: 0.2 });
      const datas = parseWikiBlocks(res.text);
      console.log('[wiki] intake parsed ' + datas.length + ' entries from reply (' + (res.text || '').length + ' chars)', datas.length ? '' : res.text);
      let created = 0, updated = 0;
      for (const d of datas) {
        const r = await upsertFromData(d);
        if (!r) continue;
        if (r.updated) updated++; else created++;
      }
      entries = await Store.listWiki(cid);
      renderList();
      if (!datas.length) {
        intakeStatus.textContent = 'No entries found in that text — try adding specific names and details.';
      } else {
        worldTa.value = '';
        intakeStatus.textContent = created + ' added, ' + updated + ' updated.';
        Toast(created + ' entr' + (created === 1 ? 'y' : 'ies') + ' added' + (updated ? ', ' + updated + ' updated' : '') + '.');
      }
    } catch (e) {
      console.error(e);
      Toast(e.message);
    }
    intakeBtn.disabled = false;
    intakeBtn.textContent = origLabel;
  }

  async function runTopic() {
    const topic = topicInp.value.trim();
    if (!topic || topicBtn.disabled) return;
    const settings = Settings.forCampaign(campaign);
    if (settings.backend === 'gemini' && !settings.geminiKey) {
      Toast('No Gemini API key set — add yours in Settings.');
      return;
    }
    const grounded = webChk.checked && settings.backend === 'gemini';
    if (webChk.checked && !grounded) Toast('Web search needs the Gemini backend — generating from model knowledge instead.');
    topicBtn.disabled = true;
    const origLabel = topicBtn.textContent;
    topicBtn.textContent = grounded ? 'Searching…' : 'Generating…';
    topicStatus.textContent = '';
    try {
      const existingNames = entries.filter(function (e) { return !e.mergedInto; }).map(function (e) { return e.name; });
      const system = Context.wikiTopicPrompt({ topic: topic, grounded: grounded, genres: campaign.genres, setting: campaign.setting, existingNames: existingNames });
      const res = await LLM.chat({ settings: settings, system: system, messages: [{ role: 'user', content: 'Generate the wiki entries for: ' + topic }], grounding: grounded, maxTokens: 4096, thinking: false, jsonMode: true, temperature: 0.2 });
      const datas = parseWikiBlocks(res.text);
      console.log('[wiki] topic parsed ' + datas.length + ' entries from reply (' + (res.text || '').length + ' chars)', datas.length ? '' : res.text);
      let created = 0, updated = 0;
      for (const d of datas) {
        const r = await upsertFromData(d);
        if (!r) continue;
        if (r.updated) updated++; else created++;
      }
      entries = await Store.listWiki(cid);
      renderList();
      if (!datas.length) {
        topicStatus.textContent = 'No entries generated — try a more specific topic.';
      } else {
        topicInp.value = '';
        topicStatus.textContent = created + ' added, ' + updated + ' updated.';
        Toast(created + ' entr' + (created === 1 ? 'y' : 'ies') + ' added' + (updated ? ', ' + updated + ' updated' : '') + '.');
      }
    } catch (e) {
      console.error(e);
      Toast(e.message);
    }
    topicBtn.disabled = false;
    topicBtn.textContent = origLabel;
  }

  function currentPlanBody() {
    return entries.filter(function (e) { return !e.mergedInto && e.type === 'plan'; })
      .map(function (e) { return e.name + ':\n' + (e.body || ''); }).join('\n\n');
  }

  async function buildRecap() {
    const scenes = await Store.listScenes(cid);
    const messages = await Store.listMessages(cid);
    const parts = [];
    scenes.filter(function (s) { return s.status === 'closed' && s.summary; })
      .forEach(function (s) { parts.push('— ' + (s.title || 'Scene') + ': ' + s.summary); });
    messages.filter(function (m) { return m.role === 'player' || m.role === 'gm'; })
      .slice(-8).forEach(function (m) { parts.push((m.role === 'gm' ? 'GM: ' : 'Player: ') + m.content); });
    let recap = parts.join('\n');
    if (recap.length > 2800) recap = recap.slice(recap.length - 2800);
    return recap;
  }

  function openPlanModal(isUpdate) {
    if (isUpdate && !planExists()) { Toast('No plan yet — use “AI Plan” to create one first.'); return; }
    const threatTa = h('textarea', { rows: '3', placeholder: isUpdate
      ? 'What’s changed? Optional — e.g. “the players killed the lieutenant; escalate the timeline.” Leave blank to let the AI revise from what’s happened.'
      : 'Who or what is the threat, and what do they want? Optional — leave blank to let the AI choose from your world.' });
    const go = h('button', { class: 'btn accent' }, isUpdate ? 'Update plan' : 'Generate plan');
    go.addEventListener('click', function () { runPlan(isUpdate, threatTa.value.trim(), go); });

    const kids = [
      h('h2', null, isUpdate ? 'Update the threat’s plan' : 'AI Plan — design the hidden threat'),
      h('p', { class: 'card-sub' }, 'Builds a Monster of the Week-style countdown: a six-step plan the threat carries out unless the players disrupt it, plus its secrets — all stored as GM-only entries the player can’t see but the GM uses behind the scenes.'),
      h('label', { class: 'form-row' }, h('span', null, isUpdate ? 'Adjustments' : 'Threat & goal'), threatTa)
    ];
    if (isUpdate) {
      kids.push(h('label', { class: 'form-row' }, h('span', null, 'Current plan'),
        h('textarea', { rows: '6', readonly: '' }, currentPlanBody())));
    }
    kids.push(h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), go));
    Modal.open(h('div', { class: 'modal-wide' }, kids));
  }

  async function runPlan(isUpdate, threatText, btn) {
    const settings = Settings.forCampaign(campaign);
    if (settings.backend === 'gemini' && !settings.geminiKey) {
      Toast('No Gemini API key set — add yours in Settings.');
      return;
    }
    btn.disabled = true;
    const origLabel = btn.textContent;
    btn.textContent = 'Designing…';
    try {
      const existingNames = entries.filter(function (e) { return !e.mergedInto; }).map(function (e) { return e.name; });
      const recap = await buildRecap();
      const system = Context.planPrompt({
        genres: campaign.genres, setting: campaign.setting, format: campaign.format, threat: threatText,
        isUpdate: isUpdate, existingNames: existingNames,
        existingPlan: isUpdate ? currentPlanBody() : '', recap: recap
      });
      const trigger = (isUpdate ? 'Update the hidden threat plan now.' : 'Create the hidden threat plan now.') +
        (threatText ? '\n\n' + threatText : '');
      const res = await LLM.chat({ settings: settings, system: system, messages: [{ role: 'user', content: trigger }], maxTokens: 4096, thinking: false, jsonMode: true, temperature: 0.2 });
      const datas = parseWikiBlocks(res.text);
      console.log('[wiki] plan parsed ' + datas.length + ' entries from reply (' + (res.text || '').length + ' chars)', datas.length ? '' : res.text);
      let created = 0, updated = 0;
      for (const d of datas) {
        const r = await upsertFromData(d, { hiddenOnCreate: true });
        if (!r) continue;
        if (r.updated) updated++; else created++;
      }
      entries = await Store.listWiki(cid);
      renderList();
      Modal.close();
      if (!datas.length) Toast('The AI returned no plan entries — try again or add a threat description.');
      else Toast('Plan ' + (isUpdate ? 'updated' : 'created') + ': ' + created + ' hidden entr' + (created === 1 ? 'y' : 'ies') + ' added' + (updated ? ', ' + updated + ' updated' : '') + '. Toggle “Show hidden” to review.');
    } catch (e) {
      console.error(e);
      Toast(e.message);
    }
    btn.disabled = false;
    btn.textContent = origLabel;
  }

  function visible() {
    return entries.filter(function (e) {
      if (e.mergedInto) return false;
      if (e.hidden && !showHidden) return false;
      if (typeFilter && e.type !== typeFilter) return false;
      if (query) {
        const hay = [e.name].concat(e.aliases || [], e.tags || []).join(' ').toLowerCase() + ' ' + (e.body || '').toLowerCase();
        if (hay.indexOf(query) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  }

  function renderList() {
    listEl.innerHTML = '';
    const v = visible();
    if (!v.length) {
      listEl.append(h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, 'Nothing here yet.'),
        h('p', null, 'The wiki grows during play — the GM records NPCs, places, and events as they\'re established. You can also add entries by hand.')));
      return;
    }
    v.forEach(function (e) {
      const card = h('button', { class: 'wiki-card' + (e.hidden ? ' hidden' : '') },
        h('div', { class: 'wiki-card-top' },
          h('span', { class: 'tag-chip type-' + e.type }, e.type),
          e.hidden ? h('span', { class: 'wiki-hidden-badge', title: 'Hidden from the player (GM only)' }, '🔒 hidden') : null,
          (!e.hidden && showHidden && e.secret && e.secret.trim()) ? h('span', { class: 'wiki-hidden-badge', title: 'Has a GM-only secret section' }, '🔒 secret') : null,
          e.createdBy === 'llm' ? h('span', { class: 'wiki-by' }, 'GM') : null),
        h('h2', null, e.name),
        (e.aliases && e.aliases.length) ? h('p', { class: 'card-meta' }, 'aka ' + e.aliases.join(', ')) : null,
        h('p', { class: 'wiki-body-preview' }, (e.body || '').slice(0, 160) + ((e.body || '').length > 160 ? '…' : '')),
        (showHidden && !e.hidden && e.secret && e.secret.trim())
          ? h('p', { class: 'wiki-secret-preview' }, '🔒 ' + e.secret.trim().slice(0, 160) + (e.secret.trim().length > 160 ? '…' : '')) : null,
        (e.tags && e.tags.length) ? h('p', { class: 'card-meta' }, '# ' + e.tags.join('  # ')) : null);
      card.addEventListener('click', function () { openEditor(e); });
      listEl.append(card);
    });
  }

  async function openEditor(e) {
    const scene = campaign.currentSceneId ? await Store.getScene(cid, campaign.currentSceneId) : null;
    const pinned = scene && (scene.pinnedEntryIds || []).indexOf(e.id) >= 0;

    const typeSel = h('select', null, TYPES.map(function (t) { return h('option', { value: t }, t); }));
    typeSel.value = e.type || 'npc';
    const nameInp = h('input', { type: 'text', value: e.name || '' });
    const aliasInp = h('input', { type: 'text', value: (e.aliases || []).join(', '), placeholder: 'comma-separated' });
    const tagInp = h('input', { type: 'text', value: (e.tags || []).join(', '), placeholder: 'comma-separated' });
    const bodyTa = h('textarea', { rows: '7' }, e.body || '');
    const secretTa = h('textarea', { rows: '4', class: 'secret-input', placeholder: 'GM-only notes the player never sees — twists, true intentions, what they don\'t know yet. The public Body above stays visible; this stays hidden.' }, e.secret || '');
    const hiddenChk = h('input', { type: 'checkbox' });
    hiddenChk.checked = !!e.hidden;

    const save = h('button', { class: 'btn accent' }, 'Save');
    save.addEventListener('click', async function () {
      if (!nameInp.value.trim()) { Toast('A name is required.'); return; }
      e.type = typeSel.value;
      e.name = nameInp.value.trim();
      e.aliases = aliasInp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      e.tags = tagInp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      e.body = bodyTa.value.trim();
      e.secret = secretTa.value.trim();
      e.hidden = hiddenChk.checked;
      e.createdBy = e.createdBy || 'user';
      await Store.saveWiki(cid, e);
      entries = await Store.listWiki(cid);
      Modal.close();
      renderList();
    });

    const actions = h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'));

    if (e.id && scene) {
      const pinBtn = h('button', { class: 'btn' }, pinned ? 'Unpin from scene' : 'Pin to current scene');
      pinBtn.addEventListener('click', async function () {
        const sc = await Store.getScene(cid, scene.id);
        sc.pinnedEntryIds = sc.pinnedEntryIds || [];
        const i = sc.pinnedEntryIds.indexOf(e.id);
        if (i >= 0) sc.pinnedEntryIds.splice(i, 1); else sc.pinnedEntryIds.push(e.id);
        await Store.saveScene(cid, sc);
        Toast(i >= 0 ? 'Unpinned.' : 'Pinned — this entry now rides along in the GM\'s context.');
        Modal.close();
      });
      actions.append(pinBtn);
    }
    if (e.id) {
      const mergeBtn = h('button', { class: 'btn' }, 'Merge into…');
      mergeBtn.addEventListener('click', function () { openMerge(e); });
      actions.append(mergeBtn);
    }
    actions.append(save);

    Modal.open(h('div', { class: 'modal-wide' },
      h('h2', null, e.id ? 'Edit entry' : 'New entry'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'form-row' }, h('span', null, 'Type'), typeSel),
        h('label', { class: 'form-row' }, h('span', null, 'Name'), nameInp)),
      h('label', { class: 'form-row' }, h('span', null, 'Aliases'), aliasInp),
      h('label', { class: 'form-row' }, h('span', null, 'Tags'), tagInp),
      h('label', { class: 'form-row' }, h('span', null, 'Body'), bodyTa),
      h('label', { class: 'form-row' }, h('span', null, 'Secret (GM only)'), secretTa),
      h('label', { class: 'inline-pair hidden-row' }, hiddenChk,
        h('span', null, 'Hide the WHOLE entry from the player (GM only). Leave off to keep the entry public but keep the Secret section hidden.')),
      actions));
  }

  function openMerge(src) {
    const others = entries.filter(function (x) { return x.id !== src.id && !x.mergedInto; });
    if (!others.length) { Toast('No other entries to merge into.'); return; }
    const sel = h('select', null, others.map(function (x) {
      return h('option', { value: x.id }, x.name + ' (' + x.type + ')');
    }));
    const go = h('button', { class: 'btn accent' }, 'Merge');
    go.addEventListener('click', async function () {
      const target = entries.find(function (x) { return x.id === sel.value; });
      /* soft merge: source survives, marked mergedInto; target absorbs names + body */
      [src.name].concat(src.aliases || []).forEach(function (n) {
        if (n && target.aliases.indexOf(n) < 0 && n.toLowerCase() !== target.name.toLowerCase()) target.aliases.push(n);
      });
      (src.tags || []).forEach(function (t) { if (target.tags.indexOf(t) < 0) target.tags.push(t); });
      if (src.body) target.body = (target.body ? target.body + '\n\n' : '') + src.body;
      src.mergedInto = target.id;
      await Store.saveWiki(cid, target);
      await Store.saveWiki(cid, src);
      entries = await Store.listWiki(cid);
      Modal.close();
      renderList();
      Toast('Merged “' + src.name + '” into “' + target.name + '”.');
    });
    Modal.open(h('div', null,
      h('h2', null, 'Merge “' + src.name + '”'),
      h('p', { class: 'card-sub' }, 'The merged entry isn\'t deleted — it\'s marked as merged, and its names become aliases of the target so lookups still find it.'),
      h('label', { class: 'form-row' }, h('span', null, 'Merge into'), sel),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), go)));
  }

  renderList();
};
