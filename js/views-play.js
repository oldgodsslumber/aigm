/* AI GM — Play View: transcript center, scene header.
 * System-agnostic: no dice, no character sheet. The chat loop, tag-protocol
 * handling (wiki / lookup / scene), and scene management. */
window.Views = window.Views || {};

Views.play = async function (root, cid) {
  root.dataset.screenLabel = 'Play View';
  let campaign, pc, scenes, scene, messages;
  let busy = false, awaitingSceneSummary = false, lastError = null, turnRequests = 0, lastGmId = null;
  let lastReadId = null, firstRender = true; /* drive-mode auto-read: only speak NEW replies, not history */
  let pendingPlayer = null; /* { id, text } of a player move awaiting its first GM reply, so we can roll it back on error */

  async function loadAll() {
    campaign = await Store.getCampaign(cid);
    const chars = await Store.listCharacters(cid);
    pc = chars.find(function (c) { return !c.isNPC; }) || chars[0];
    scenes = await Store.listScenes(cid);
    scene = scenes.find(function (s) { return s.id === campaign.currentSceneId; });
    if (!scene) {
      const sid = await Store.saveScene(cid, { title: 'Scene 1', summary: '', status: 'active', pinnedEntryIds: [], startedAt: Date.now() });
      campaign.currentSceneId = sid;
      await Store.saveCampaign(campaign);
      scenes = await Store.listScenes(cid);
      scene = scenes.find(function (s) { return s.id === sid; });
    }
    messages = await Store.listMessages(cid);
  }
  await loadAll();
  await Store.touch(cid);

  /* ---------- shell ---------- */
  root.innerHTML = '';
  const drive = DriveMode.enabled();   // hands-free, glanceable layout for the car
  const play = h('div', { class: 'play' + (drive ? ' drive-mode' : ''), 'data-layout': 'focus' });
  const logEl = h('div', { class: 'chat-log' });
  const banner = h('div', { class: 'play-banner', style: 'display:none' });
  const input = h('textarea', { class: 'composer-input', rows: drive ? '3' : '2', placeholder: 'What do you do?' });
  const sendBtn = h('button', { class: 'btn accent composer-send' }, 'Send');
  const sceneTitleEl = h('span', { class: 'scene-title' });
  const pinsEl = h('span', { class: 'scene-pins' });
  const reqMeter = h('a', { class: 'req-meter', href: '#/settings', title: 'Gemini requests used today — click for the full breakdown' });

  const endSceneBtn = h('button', { class: 'btn small' }, 'End scene');
  endSceneBtn.addEventListener('click', endScene);
  const setupBtn = h('button', { class: 'btn small ghost', title: 'Edit premise, boundaries, character & cast' }, 'Story & cast');
  setupBtn.addEventListener('click', editStorySetup);
  const saveCharBtn = h('button', { class: 'btn small ghost', title: 'Snapshot this character\'s current state & story so the next adventure can continue from it' }, 'Save character');
  saveCharBtn.addEventListener('click', async function () {
    const lib = await Store.saveCharacterProgress(cid);
    Toast(lib ? lib.name + '\'s progress saved — new stories can continue from here.'
              : 'This story has no linked character to save.');
  });

  /* ---------- drive-mode controls (two big, glanceable buttons) ---------- */
  const talkBtn = h('button', { type: 'button', class: 'btn drive-btn drive-talk' }, '🎤 Talk');
  const readDriveBtn = h('button', { type: 'button', class: 'btn drive-btn drive-read' }, '🔊 Read');
  const driveBar = h('div', { class: 'drive-bar' }, talkBtn, readDriveBtn);

  /* 🎤 Talk: where the browser supports in-page recognition (Chrome/Android),
   * dictate straight into the box; otherwise focus the field so the device's
   * keyboard mic (iOS) can do it. Tap again to stop. */
  talkBtn.addEventListener('click', function () {
    if (Listen.listening()) { Listen.stop(); return; }
    if (!Listen.supported()) {
      input.focus();
      Toast('Tap the microphone on your keyboard to dictate.');
      return;
    }
    const base = input.value.trim() ? input.value.trim() + ' ' : '';
    talkBtn.classList.add('listening');
    talkBtn.textContent = '● Listening… tap to stop';
    const reset = function () { talkBtn.classList.remove('listening'); talkBtn.textContent = '🎤 Talk'; };
    const ok = Listen.start({
      onText: function (text) { input.value = base + text; },
      onEnd: function (reason) {
        reset();
        if (reason === 'not-allowed' || reason === 'service-not-allowed') {
          Toast('Microphone access is blocked — allow it for this site to use 🎤 Talk.');
        } else if (reason === 'audio-capture') {
          Toast('No microphone found on this device.');
        } else {
          input.focus();
        }
      }
    });
    if (!ok) { reset(); input.focus(); }
  });

  /* 🔊 Read / auto-read: speak the latest GM narration. Shared so the manual
   * tap and the automatic read after a new reply keep the button in sync. */
  function readLatestGm(fromAuto) {
    if (Speech.speaking()) { Speech.stop(); if (!fromAuto) return; }
    const gm = messages.slice().reverse().find(function (m) { return m.role === 'gm'; });
    const txt = narrationOf(gm);
    if (!txt) { if (!fromAuto) Toast('Nothing to read yet.'); return; }
    const reset = function () { readDriveBtn.classList.remove('playing'); readDriveBtn.textContent = '🔊 Read'; };
    readDriveBtn.classList.add('playing');
    readDriveBtn.textContent = '⏹ Stop';
    const ok = Speech.speak(txt, { onend: reset });
    if (!ok) { reset(); if (!fromAuto) Toast('Text-to-speech isn\'t available in this browser.'); }
  }
  readDriveBtn.addEventListener('click', function () { readLatestGm(false); });

  play.append(
    h('header', { class: 'scene-bar' },
      h('div', { class: 'scene-bar-left' },
        h('span', { class: 'scene-camp' }, campaign.name),
        sceneTitleEl, pinsEl),
      h('div', { class: 'scene-bar-actions' }, reqMeter, saveCharBtn, setupBtn, endSceneBtn)),
    h('div', { class: 'play-body' },
      h('div', { class: 'chat-zone' },
        banner, logEl,
        h('form', { class: 'composer', onsubmit: function (e) { e.preventDefault(); submit(); } },
          input, sendBtn),
        drive ? driveBar : null)));
  root.append(play);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  /* ---------- helpers ---------- */
  /* Strip a weak model's chain-of-thought / planning dump, keeping the WHOLE
   * narration. Conservative by design — losing story is worse than leaving a
   * stray line. Two stages, both preserving gm-* blocks:
   *  1. The scratchpad reliably ENDS with a self-review checklist ("...? Yes").
   *     If present, the narration is everything after the LAST such line.
   *     (Narration almost never contains "? Yes", so this won't cut story.)
   *  2. Otherwise, only drop bullet/header lines and strip "Label:*" prefixes
   *     (keeping the prose after them) — never delete a prose line. */
  function stripScratchpad(text) {
    const raw = String(text || '');
    const fences = raw.match(/```gm-[a-z]+[\s\S]*?```/g) || [];
    const body = raw.replace(/```gm-[a-z]+[\s\S]*?```/g, '');
    const lines = body.split(/\r?\n/);
    const reattach = function (s) {
      let out = s.trim();
      fences.forEach(function (f) { if (out.indexOf(f) < 0) out += '\n\n' + f; });
      return out;
    };

    let lastCheck = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/\?\s*(yes|no)\b/i.test(lines[i])) lastCheck = i;
    }
    if (lastCheck >= 0) {
      const tail = lines.slice(lastCheck + 1).join('\n').trim();
      if (tail.length >= 60) return reattach(tail);
    }

    /* fallback: drop only obvious scratchpad, keep every prose line */
    const kept = lines.map(function (ln) {
      const s = ln.trim();
      if (!s) return ln;
      if (/^[\*\-•]\s/.test(s)) return null;                 // bullet
      if (/^#{1,6}\s/.test(s)) return null;                  // header
      const m = s.match(/^[A-Z][A-Za-z ’'\/]{0,28}:\*\s*(.*)$/); // "Opening:* <prose>"
      if (m) return m[1] ? m[1] : null;
      return ln;
    }).filter(function (ln) { return ln !== null; }).join('\n').replace(/\n{3,}/g, '\n\n');
    return reattach(kept.length ? kept : raw);
  }

  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b;
    input.disabled = b;
    renderLog();
  }
  function showBanner(msg, retry) {
    banner.style.display = '';
    banner.innerHTML = '';
    banner.append(h('span', null, msg));
    if (retry) {
      const r = h('button', { class: 'btn small' }, 'Retry');
      r.addEventListener('click', function () { hideBanner(); runTurn(0); });
      banner.append(r);
    }
    if (/key|Settings/i.test(msg)) banner.append(h('a', { class: 'btn small', href: '#/settings' }, 'Settings'));
  }
  function hideBanner() { banner.style.display = 'none'; lastError = null; }

  function keyMissing() {
    const s = Settings.forCampaign(campaign);
    return s.backend === 'gemini' && !s.geminiKey;
  }

  /* spoken text of a GM message: narration only, no gm-* blocks or markup */
  function narrationOf(m) {
    if (!m || m.role !== 'gm') return '';
    return Tags.parse(m.content).segments
      .filter(function (s) { return s.type === 'text'; })
      .map(function (s) { return (s.text || '').trim(); })
      .filter(Boolean).join('\n\n');
  }

  /* ---------- wiki upserts ---------- */
  async function upsertWiki(data) {
    const entries = await Store.listWiki(cid);
    const name = String(data.name || '').trim();
    if (!name) return null;
    const found = entries.find(function (e) {
      if (e.mergedInto) return false;
      const names = [e.name].concat(e.aliases || []).map(function (n) { return n.toLowerCase(); });
      return names.indexOf(name.toLowerCase()) >= 0;
    });
    if (found) {
      found.body = data.body || found.body;
      found.type = data.type || found.type;
      if (data.hidden === true) found.hidden = true;
      if (data.secret && String(data.secret).trim()) found.secret = String(data.secret).trim();
      (data.aliases || []).forEach(function (a) {
        if (a && found.aliases.indexOf(a) < 0 && a.toLowerCase() !== found.name.toLowerCase()) found.aliases.push(a);
      });
      (data.tags || []).forEach(function (t) { if (t && found.tags.indexOf(t) < 0) found.tags.push(t); });
      await Store.saveWiki(cid, found);
      return { id: found.id, name: found.name, updated: true, hidden: !!found.hidden, secret: !!(found.secret && found.secret.trim()) };
    }
    const id = await Store.saveWiki(cid, {
      type: data.type || 'npc', name: name, aliases: data.aliases || [],
      tags: data.tags || [], body: data.body || '', createdBy: 'llm', mergedInto: null,
      hidden: data.hidden === true, secret: (data.secret && String(data.secret).trim()) || ''
    });
    return { id: id, name: name, updated: false, hidden: data.hidden === true, secret: !!(data.secret && String(data.secret).trim()) };
  }

  /* ---------- the chat loop ---------- */
  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    const id = await Store.addMessage(cid, { role: 'player', content: text, sceneId: scene.id });
    pendingPlayer = { id: id, text: text };
    messages = await Store.listMessages(cid);
    renderLog();
    runTurn(0);
  }

  /* A player move failed to get any GM reply (API error, no key). Roll the move
   * out of the transcript, drop it back into the box, and tell the player — so
   * it's unambiguous that nothing was sent and they can just send again. */
  async function restorePlayerTurn(bannerMsg) {
    const p = pendingPlayer; pendingPlayer = null;
    if (!p) { showBanner(bannerMsg, false); return; }
    try { await Store.truncateFrom(cid, p.id); } catch (e) { /* ignore */ }
    messages = await Store.listMessages(cid);
    if (!input.value.trim()) input.value = p.text;
    renderLog();
    showBanner(bannerMsg, false);
    if (!input.disabled) input.focus();
  }

  async function editStorySetup() {
    const format = formatPicker(campaign.format || 'campaign');
    const genre = genrePicker(campaign.genres || []);
    const settingTa = h('textarea', { rows: '2', placeholder: 'Where and when? The world, era, place.' }, campaign.setting || '');
    const charTa = h('textarea', { rows: '4', placeholder: 'Who are you? Background, look, personality, what you\'re good at, what you want.' }, (pc && pc.description) || '');
    const premiseTa = h('textarea', { rows: '5', placeholder: 'Where does the story start? What\'s the situation, the hook, the job?' }, campaign.premise || '');
    const boundsTa = h('textarea', { rows: '4', placeholder: 'Tone, content to keep in or out — e.g. "pulpy and fun, fade to black on gore, no harm to children".' }, campaign.boundaries || '');

    /* ---- cast: wiki entries pinned to the CURRENT scene ---- */
    const allWiki = await Store.listWiki(cid);
    let pinnedIds = (scene.pinnedEntryIds || []).slice();
    const existingWrap = h('div', { class: 'cast-list' });
    function renderExisting() {
      existingWrap.innerHTML = '';
      const pinned = pinnedIds
        .map(function (id) { return allWiki.find(function (e) { return e.id === id; }); })
        .filter(function (e) { return e && !e.mergedInto; });
      if (!pinned.length) { existingWrap.append(h('p', { class: 'card-sub' }, 'Nothing pinned to this scene yet.')); return; }
      pinned.forEach(function (e) {
        const rm = h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Unpin' }, 'Unpin');
        rm.addEventListener('click', function () {
          pinnedIds = pinnedIds.filter(function (x) { return x !== e.id; });
          renderExisting();
        });
        existingWrap.append(h('div', { class: 'cast-row' },
          h('div', { class: 'cast-row-head' }, h('span', null, '📌 ' + e.name + ' · ' + e.type), rm)));
      });
    }
    renderExisting();

    const newRows = [];
    const newWrap = h('div', { class: 'cast-list' });
    function addCastRow() {
      const nameI = h('input', { type: 'text', placeholder: 'Name' });
      const typeS = h('select', null,
        h('option', { value: 'npc' }, 'NPC'),
        h('option', { value: 'faction' }, 'Faction'),
        h('option', { value: 'location' }, 'Location'),
        h('option', { value: 'item' }, 'Item'));
      const descI = h('input', { type: 'text', placeholder: 'Who/what they are — one or two lines the GM should know' });
      const del = h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove' }, '×');
      const rowEl = h('div', { class: 'cast-row' },
        h('div', { class: 'cast-row-head' }, nameI, typeS, del), descI);
      const ref = { name: nameI, type: typeS, desc: descI };
      del.addEventListener('click', function () {
        const i = newRows.indexOf(ref); if (i >= 0) newRows.splice(i, 1);
        rowEl.remove();
      });
      newRows.push(ref);
      newWrap.append(rowEl);
      nameI.focus();
    }
    const addCastBtn = h('button', { class: 'btn small', type: 'button' }, '+ Add character / NPC');
    addCastBtn.addEventListener('click', addCastRow);

    const saveBtn = h('button', { class: 'btn accent' }, 'Save setup');
    saveBtn.addEventListener('click', async function () {
      campaign.format = format.get();
      campaign.genres = genre.get();
      campaign.setting = settingTa.value.trim();
      campaign.premise = premiseTa.value.trim();
      campaign.boundaries = boundsTa.value.trim();
      await Store.saveCampaign(campaign);
      if (pc) { pc.description = charTa.value.trim(); await Store.saveCharacter(cid, pc); }
      for (const r of newRows) {
        const cn = r.name.value.trim();
        if (!cn) continue;
        const id = await Store.saveWiki(cid, {
          type: r.type.value || 'npc', name: cn, aliases: [], tags: [],
          body: r.desc.value.trim(), createdBy: 'player', mergedInto: null
        });
        pinnedIds.push(id);
      }
      scene.pinnedEntryIds = pinnedIds;
      await Store.saveScene(cid, scene);
      renderHeader();
      Modal.close();
      Toast('Setup saved — the GM will use it from the next reply.');
    });

    Modal.open(h('div', null,
      h('h2', null, 'Story & cast setup'),
      h('p', { class: 'card-sub' }, 'These are sent to the GM with every turn. Boundaries are treated as hard limits that override genre conventions.'),
      h('label', { class: 'form-row' }, h('span', null, 'Play format'), format.el),
      h('label', { class: 'form-row' }, h('span', null, 'Genre(s)'), genre.el),
      h('label', { class: 'form-row' }, h('span', null, 'Setting'), settingTa),
      pc ? h('label', { class: 'form-row' }, h('span', null, 'Who is your character?'), charTa) : null,
      h('label', { class: 'form-row' }, h('span', null, 'Premise & starting situation'), premiseTa),
      h('label', { class: 'form-row' }, h('span', null, 'Tone & boundaries'), boundsTa),
      h('div', { class: 'create-section' },
        h('h3', null, 'Cast pinned to this scene'),
        h('p', { class: 'card-sub' }, 'NPCs, factions, or places the GM should know now. Pinned cast is always in the GM\'s context.'),
        existingWrap, newWrap, addCastBtn),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), saveBtn)));
  }

  async function begin() {
    const hasPremise = campaign.premise && campaign.premise.trim();
    const wiki = await Store.listWiki(cid);
    const cast = wiki.filter(function (e) { return !e.mergedInto && e.createdBy === 'player'; });
    let open = 'SYSTEM: The player is ready. Open the first scene of the campaign — set the stage, then hand them a situation.';
    if (hasPremise) open += ' Build the opening directly from the PREMISE the player set up; do not invent a different hook.';
    if (cast.length) open += ' The player has pre-established this cast — work them in naturally as they fit: ' +
      cast.map(function (e) { return e.name; }).join(', ') + '.';
    await Store.addMessage(cid, { role: 'info', sceneId: scene.id, content: open });
    messages = await Store.listMessages(cid);
    runTurn(0);
  }

  /* edit a GM reply's text in place (fix a wrong detail by hand) */
  function editMessage(m) {
    const ta = h('textarea', { rows: '12', class: 'edit-msg-input' }, m.content);
    const save = h('button', { class: 'btn accent' }, 'Save');
    save.addEventListener('click', async function () {
      m.content = ta.value;
      await Store.updateMessage(cid, m);
      messages = await Store.listMessages(cid);
      Modal.close();
      renderLog();
    });
    const actions = h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'));
    /* if this reply was auto-cleaned, let the player pull back the full original */
    if (m.raw && m.raw !== m.content) {
      const orig = h('button', { class: 'btn' }, 'Load original (uncleaned)');
      orig.addEventListener('click', function () { ta.value = m.raw; ta.focus(); });
      actions.append(orig);
    }
    actions.append(save);
    Modal.open(h('div', { class: 'modal-wide' },
      h('h2', null, 'Edit the scene'),
      h('p', { class: 'card-sub' }, 'Edit the GM\'s text directly. Any fenced blocks (wiki, scene) are shown as written — leave them intact unless you mean to change them.'),
      ta, actions));
  }

  /* regenerate the latest GM reply: rewind to the trigger and re-run the turn */
  async function regenerateGm(m) {
    if (busy) return;
    await Store.truncateFrom(cid, m.id);
    messages = await Store.listMessages(cid);
    renderLog();
    runTurn(0);
  }

  async function runTurn(depth) {
    if (depth === 0) turnRequests = 0; /* depth 0 = a fresh player-initiated turn; deeper = chained follow-ups */
    if (keyMissing()) {
      const msg = 'No Gemini API key set — add yours in Settings to play.';
      if (depth === 0 && pendingPlayer) await restorePlayerTurn(msg); else showBanner(msg, false);
      return;
    }
    hideBanner();
    setBusy(true);
    try {
      const settings = Settings.forCampaign(campaign);
      const wiki = await Store.listWiki(cid);
      const asm = Context.assemble({
        character: pc,
        scenes: scenes, currentSceneId: scene.id, wiki: wiki,
        genres: campaign.genres, setting: campaign.setting, format: campaign.format,
        premise: campaign.premise, boundaries: campaign.boundaries,
        rulesNotes: campaign.rulesNotes, recap: campaign.recap,
        messages: messages, budget: Settings.budgetFor(settings)
      });
      const res = await LLM.chat({ settings: settings, system: asm.system, messages: asm.messages });
      turnRequests++;
      renderRequestMeter();
      if (res.model && res.limit) {
        Toast(res.label + ' · ' + res.used + '/' + res.limit + ' today' +
          (turnRequests > 1 ? ' · request ' + turnRequests + ' this turn' : ''));
      }
      /* Weak free models (Gemma) have no separate thinking channel and dump
       * their scratchpad — echoed prompt, planning, self-checks — into the
       * reply, with the real narration last. Strip that for those models, but
       * keep the raw reply on the message so nothing is ever truly lost. */
      const isGemma = /^gemma/i.test(res.model || '');
      const replyText = isGemma ? stripScratchpad(res.text) : res.text;
      if (isGemma) console.log('[AI GM] gemma reply cleaned ' + res.text.length + '→' + replyText.length + ' chars\nRAW:\n' + res.text);
      const parsed = Tags.parse(replyText);
      const msg = {
        role: 'gm', content: replyText, sceneId: scene.id,
        blocks: parsed.blocks.map(function (b) { return { tag: b.tag, data: b.data }; }),
        blockMeta: {}
      };
      if (isGemma && replyText !== res.text) msg.raw = res.text;
      await Store.addMessage(cid, msg);
      pendingPlayer = null; /* a GM reply now exists — the player's move was consumed */
      messages = await Store.listMessages(cid);
      await processBlocks(messages[messages.length - 1], depth);
      messages = await Store.listMessages(cid);
    } catch (e) {
      console.error(e);
      lastError = e.message;
      /* A fresh player move that never produced a reply: put it back in the box
       * so it's clear it must be re-sent. Otherwise (begin/regenerate/follow-up,
       * or a turn that already has narration) keep the Retry banner. */
      if (depth === 0 && pendingPlayer) {
        await restorePlayerTurn('The GM couldn’t answer:\n' + e.message +
          '\n\nYour move was put back in the box — send it again when you’re ready.');
      } else {
        showBanner(e.message, true);
      }
    } finally {
      setBusy(false); /* always clear the "GM considers…" state, even if the catch path itself errors */
    }
  }

  async function processBlocks(msg, depth) {
    const lookups = [];
    const blocks = msg.blocks || [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      try {
        if (b.tag === 'gm-wiki') {
          const r = await upsertWiki(b.data);
          if (r) msg.blockMeta[i] = { entryId: r.id, updated: r.updated, hidden: r.hidden };
        } else if (b.tag === 'gm-lookup') {
          lookups.push(b.data.query);
        } else if (b.tag === 'gm-scene') {
          if (awaitingSceneSummary) openSceneEditor(b.data);
        }
      } catch (e) { console.warn('[AI GM] block failed:', b.tag, e); }
    }
    await Store.updateMessage(cid, msg);

    if (lookups.length && depth < 2) {
      const wiki = await Store.listWiki(cid);
      const results = [];
      lookups.forEach(function (q) {
        const ql = String(q || '').toLowerCase();
        wiki.filter(function (e) {
          if (e.mergedInto) return false;
          return [e.name].concat(e.aliases || [], e.tags || []).some(function (n) {
            return n && n.toLowerCase().indexOf(ql) >= 0;
          });
        }).forEach(function (e) {
          if (!results.some(function (r) { return r.name === e.name; }))
            results.push({ type: e.type, name: e.name, aliases: e.aliases, body: e.body });
        });
      });
      await Store.addMessage(cid, {
        role: 'info', sceneId: scene.id,
        content: Tags.fence('lookup-result', { query: lookups.join('; '), results: results.length ? results : 'no matches' })
      });
      messages = await Store.listMessages(cid);
      renderLog();
      /* Only spend another Gemini request if the GM's reply was essentially
       * just the lookup (little or no narration yet). If it already wrote a
       * full response, the looked-up facts ride into the next player turn's
       * context for free instead of triggering an immediate follow-up call. */
      const narration = Tags.parse(msg.content).segments
        .filter(function (s) { return s.type === 'text'; })
        .map(function (s) { return (s.text || '').trim(); }).join(' ').trim();
      if (narration.length < 40) {
        await runTurn(depth + 1);
      }
    }
  }

  /* ---------- scenes ---------- */
  async function endScene() {
    if (busy) return;
    awaitingSceneSummary = true;
    await Store.addMessage(cid, {
      role: 'info', sceneId: scene.id,
      content: 'SYSTEM: The player is ending this scene now. Reply with exactly one gm-scene block summarizing the scene — title and 5–10 sentence summary. No other text, no rolls.'
    });
    messages = await Store.listMessages(cid);
    renderLog();
    await runTurn(0);
    if (awaitingSceneSummary) {
      /* model didn't comply — let the player write it */
      openSceneEditor({ title: scene.title, summary: '' });
    }
  }

  function openSceneEditor(data) {
    awaitingSceneSummary = false;
    const titleInp = h('input', { type: 'text', value: data.title || scene.title });
    const sumTa = h('textarea', { rows: '8' }, data.summary || '');
    const save = h('button', { class: 'btn accent' }, 'Close scene & continue');
    save.addEventListener('click', async function () {
      scene.title = titleInp.value.trim() || scene.title;
      scene.summary = sumTa.value.trim();
      scene.status = 'closed';
      scene.closedAt = Date.now();
      await Store.saveScene(cid, scene);
      const n = scenes.filter(function (s) { return s.status === 'closed'; }).length + 2;
      const sid = await Store.saveScene(cid, { title: 'Scene ' + n, summary: '', status: 'active', pinnedEntryIds: [], startedAt: Date.now() });
      campaign.currentSceneId = sid;
      await Store.saveCampaign(campaign);
      scenes = await Store.listScenes(cid);
      scene = scenes.find(function (s) { return s.id === sid; });
      Modal.close();
      renderHeader(); renderLog();
      const fmtHint = campaign.format === 'multishot'
        ? ' Consider “Update plan” in the Wiki to recalc the villain\'s scheme.'
        : (campaign.format === 'oneshot' ? ' You can generate a fresh AI Plan in the Wiki for the next one.' : '');
      Toast('Scene closed. Its summary now feeds the GM\'s memory.' + fmtHint);
    });
    Modal.open(h('div', { class: 'modal-wide' },
      h('h2', null, 'End of scene'),
      h('p', { class: 'card-sub' }, 'The GM drafted this summary — it becomes the campaign\'s memory of the scene. Edit freely.'),
      h('label', { class: 'form-row' }, h('span', null, 'Scene title'), titleInp),
      h('label', { class: 'form-row' }, h('span', null, 'Summary'), sumTa),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), save)));
  }

  /* ---------- rendering ---------- */
  /* Read a pinned wiki entry aloud — name then public body only (never the
   * GM-only secret). In drive mode this is how the player re-checks a face they
   * can't keep straight (e.g. six Columbo suspects) without taking eyes off the
   * road. Toggles: tapping the speaking chip stops it. */
  function speakEntry(e) {
    if (Speech.speaking()) { Speech.stop(); return; }
    const body = String(e.body || '').trim();
    const txt = body ? e.name + '. ' + body : e.name;
    const ok = Speech.speak(txt, {});
    if (!ok) Toast('Text-to-speech isn\'t available in this browser.');
  }

  function renderHeader() {
    sceneTitleEl.textContent = scene.title + (scene.status === 'active' ? '' : ' (closed)');
    pinsEl.innerHTML = '';
    (scene.pinnedEntryIds || []).forEach(async function (id) {
      const e = await Store.getWiki(cid, id);
      if (!e) return;
      if (drive) {
        /* tap to hear who they are — glanceable recap, no navigation away */
        const chip = h('button', { type: 'button', class: 'tag-chip pin',
          title: 'Tap to hear ' + e.name + '\'s details' }, '🔊 ' + e.name);
        chip.addEventListener('click', function () { speakEntry(e); });
        pinsEl.append(chip);
      } else {
        pinsEl.append(h('a', { class: 'tag-chip pin', href: '#/wiki/' + cid, title: 'Pinned to scene' }, '📌 ' + e.name));
      }
    });
  }

  /* Persistent, always-accurate request counter so multi-request turns
   * (a lookup follow-up, a roll result) are visible — not hidden behind a
   * toast that overwrites itself. */
  function renderRequestMeter() {
    const s = Settings.forCampaign(campaign);
    if (s.backend !== 'gemini' || !LLM.geminiUsage) { reqMeter.style.display = 'none'; return; }
    reqMeter.style.display = '';
    const usage = LLM.geminiUsage();
    const total = usage.reduce(function (n, u) { return n + u.used; }, 0);
    reqMeter.textContent = '🛰 ' + total + ' today' + (turnRequests > 1 ? ' · ' + turnRequests + ' this turn' : '');
    reqMeter.title = 'Gemini requests used today:\n' +
      usage.map(function (u) { return '  ' + u.label + ': ' + u.used + '/' + u.limit; }).join('\n') +
      (turnRequests ? '\n\nThis turn so far: ' + turnRequests + ' request' + (turnRequests === 1 ? '' : 's') : '') +
      '\n\nClick for the full breakdown in Settings.';
  }

  function renderBlock(msg, block, bi) {
    const meta = (msg.blockMeta || {})[bi] || {};
    if (block.tag === 'gm-wiki') {
      /* Hidden or secret writes are GM-only — show nothing at all in the log,
       * not even a placeholder, so the player gets no hint a secret was set. */
      if (meta.hidden || block.data.hidden === true || (block.data.secret && String(block.data.secret).trim())) {
        return h('span', { style: 'display:none' });
      }
      return h('div', { class: 'inline-notice wiki-notice' },
        h('span', { class: 'notice-icon' }, '✦'),
        h('span', null, 'Wiki ' + (meta.updated ? 'updated' : 'entry') + ': '),
        h('a', { href: '#/wiki/' + cid }, block.data.name),
        h('span', { class: 'notice-type' }, ' · ' + (block.data.type || '')));
    }
    if (block.tag === 'gm-lookup') {
      return h('div', { class: 'inline-notice lookup-notice' },
        h('span', { class: 'notice-icon' }, '🔎'),
        h('span', null, 'The GM checked the wiki for “' + (block.data.query || '') + '”.'));
    }
    if (block.tag === 'gm-scene') {
      return h('div', { class: 'inline-notice scene-notice' },
        h('span', { class: 'notice-icon' }, '❧'),
        h('span', null, 'Scene summary proposed: ', h('strong', null, block.data.title || '')));
    }
    return h('div');
  }

  function renderMessage(m) {
    if (m.role === 'player') {
      return h('div', { class: 'msg msg-player' }, h('div', { class: 'msg-bubble', html: md(m.content) }));
    }
    if (m.role === 'gm') {
      const el = h('div', { class: 'msg msg-gm' });
      const parsed = Tags.parse(m.content);
      let bi = 0;
      let narration = '';
      parsed.segments.forEach(function (seg) {
        if (seg.type === 'text') {
          const t = seg.text.trim();
          if (t) { el.append(h('div', { class: 'narration', html: md(t) })); narration += (narration ? '\n\n' : '') + t; }
        } else {
          try {
            el.append(renderBlock(m, seg.block, bi));
          } catch (err) {
            console.warn('[AI GM] block render failed:', seg.block && seg.block.tag, err);
            el.append(h('div', { class: 'inline-notice' },
              h('span', { class: 'notice-icon' }, '⚠'),
              h('span', null, 'A “' + (seg.block && seg.block.tag || 'GM') + '” block could not be displayed (the GM sent something malformed). The story continues below.')));
          }
          bi++;
        }
      });
      const actions = h('div', { class: 'msg-actions' });
      if (narration.trim()) {
        const readBtn = h('button', { class: 'btn small ghost', title: 'Read this pass aloud' }, '🔊 Read');
        const resetRead = function () { readBtn.textContent = '🔊 Read'; delete readBtn.dataset.playing; };
        readBtn.addEventListener('click', function () {
          if (readBtn.dataset.playing) { Speech.stop(); return; }
          readBtn.textContent = '⏹ Stop';
          readBtn.dataset.playing = '1';
          const ok = Speech.speak(narration, { onend: resetRead });
          if (!ok) { resetRead(); Toast('Text-to-speech isn\'t available in this browser.'); }
        });
        actions.append(readBtn);
      }
      const editBtn = h('button', { class: 'btn small ghost' }, 'Edit');
      editBtn.addEventListener('click', function () { editMessage(m); });
      actions.append(editBtn);
      if (m.id === lastGmId) {
        const regenBtn = h('button', { class: 'btn small ghost' }, '↻ Regenerate');
        regenBtn.addEventListener('click', function () { regenerateGm(m); });
        actions.append(regenBtn);
      }
      el.append(actions);
      return el;
    }
    if (m.role === 'info') {
      if (m.content.indexOf('```lookup-result') === 0) {
        return h('div', { class: 'msg msg-info' }, 'Wiki results returned to the GM.');
      }
      if (m.content.indexOf('SYSTEM: The player is ending') === 0) {
        return h('div', { class: 'msg msg-info' }, 'You signal the end of the scene.');
      }
      if (m.content.indexOf('SYSTEM: The player is ready') === 0) {
        return h('div', { class: 'msg msg-info' }, '— The story begins —');
      }
      return h('div', { class: 'msg msg-info' }, m.content);
    }
    return h('div');
  }

  function renderLog() {
    logEl.innerHTML = '';
    /* the most recent GM reply can be regenerated (redone in place) */
    lastGmId = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'gm') { lastGmId = messages[i].id; break; }
    }
    if (!messages.length) {
      const beginBtn = h('button', { class: 'btn accent' }, 'Begin the adventure');
      beginBtn.addEventListener('click', begin);
      logEl.append(h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, campaign.name),
        h('p', null, pc ? 'The GM is ready to run ' + pc.name + '\'s story.' : 'The GM is ready to run your story.'),
        h('p', { class: 'card-sub' }, 'Nothing is written until you press Begin. If you want, set up the wiki and run AI Plan first — add world info and let the AI design the threat\'s hidden countdown — then begin.'),
        keyMissing()
          ? h('p', null, h('a', { class: 'btn accent', href: '#/settings' }, 'Add your Gemini key to start'))
          : h('div', { class: 'empty-actions' },
              h('a', { class: 'btn', href: '#/wiki/' + cid }, 'Set up wiki & AI Plan'),
              beginBtn)));
      return;
    }
    let lastSceneId = null;
    messages.forEach(function (m) {
      if (m.sceneId !== lastSceneId) {
        const sc = scenes.find(function (s) { return s.id === m.sceneId; });
        logEl.append(h('div', { class: 'scene-divider' }, h('span', null, (sc ? sc.title : 'Scene'))));
        lastSceneId = m.sceneId;
      }
      logEl.append(renderMessage(m));
    });
    if (busy) logEl.append(h('div', { class: 'msg msg-thinking' }, h('span', { class: 'thinking-dots' }, 'The GM considers'), ''));
    logEl.scrollTop = logEl.scrollHeight;

    /* Drive mode: read each NEW GM reply aloud automatically. The first render
     * just sets the baseline so we don't replay the whole backlog on open.
     * (Browsers may block auto-play TTS without a recent gesture — the 🔊 Read
     * button is the manual fallback.) */
    if (firstRender) { firstRender = false; lastReadId = lastGmId; }
    else if (drive && !busy && lastGmId && lastGmId !== lastReadId) {
      lastReadId = lastGmId;
      readLatestGm(true);
    }
  }

  renderHeader();
  renderLog();
  renderRequestMeter();
  if (keyMissing() && messages.length) showBanner('No Gemini API key set — add yours in Settings to play.', false);
};
