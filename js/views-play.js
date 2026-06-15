/* AI GM — Play View: transcript center, sheet panel, scene header.
 * The chat loop, tag-protocol handling, rolls, sheet auto-apply + undo. */
window.Views = window.Views || {};

Views.play = async function (root, cid) {
  root.dataset.screenLabel = 'Play View';
  let campaign, pack, pc, scenes, scene, messages, sheetLog;
  let busy = false, awaitingSceneSummary = false, lastError = null;

  async function loadAll() {
    campaign = await Store.getCampaign(cid);
    pack = await Store.getPack(campaign.packId);
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
    sheetLog = await Store.listSheetEvents(cid);
  }
  await loadAll();
  await Store.touch(cid);

  /* ---------- shell ---------- */
  root.innerHTML = '';
  const play = h('div', { class: 'play', 'data-layout': Settings.get().layout });
  const logEl = h('div', { class: 'chat-log' });
  const banner = h('div', { class: 'play-banner', style: 'display:none' });
  const input = h('textarea', { class: 'composer-input', rows: '2', placeholder: 'What do you do?' });
  const sendBtn = h('button', { class: 'btn accent composer-send' }, 'Send');
  const sheetBody = h('div', { class: 'sheet-body' });
  const sceneTitleEl = h('span', { class: 'scene-title' });
  const pinsEl = h('span', { class: 'scene-pins' });

  const layoutBtn = h('button', { class: 'btn small ghost', title: 'Cycle Play View layout' }, '⊞ Layout');
  layoutBtn.addEventListener('click', function () {
    const order = ['sheet-right', 'sheet-left', 'focus'];
    const next = order[(order.indexOf(play.dataset.layout) + 1) % order.length];
    play.dataset.layout = next;
    Settings.set({ layout: next });
  });
  const sheetToggle = h('button', { class: 'btn small ghost sheet-toggle' }, 'Sheet');
  sheetToggle.addEventListener('click', function () { play.classList.toggle('sheet-open'); });
  const endSceneBtn = h('button', { class: 'btn small' }, 'End scene');
  endSceneBtn.addEventListener('click', endScene);

  const sheetPanel = h('aside', { class: 'sheet-panel' },
    h('div', { class: 'sheet-head' },
      h('h2', null, pc ? pc.name : 'No character'),
      h('button', { class: 'btn small ghost', onclick: showSheetLog }, 'History')),
    sheetBody);

  play.append(
    h('header', { class: 'scene-bar' },
      h('div', { class: 'scene-bar-left' },
        h('span', { class: 'scene-camp' }, campaign.name),
        sceneTitleEl, pinsEl),
      h('div', { class: 'scene-bar-actions' }, endSceneBtn, layoutBtn, sheetToggle)),
    h('div', { class: 'play-body' },
      h('div', { class: 'chat-zone' },
        banner, logEl,
        h('form', { class: 'composer', onsubmit: function (e) { e.preventDefault(); submit(); } },
          input, sendBtn)),
      sheetPanel));
  root.append(play);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  /* ---------- helpers ---------- */
  function rollDef(id) {
    return (pack.rollDefinitions || []).find(function (r) { return r.id === id; });
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

  /* ---------- sheet ---------- */
  async function logDiff(changes, source, transcriptMsgId) {
    if (!pc) return null;
    SheetUI.applyChanges(pc.sheetState, changes);
    await Store.saveCharacter(cid, pc);
    const evId = await Store.addSheetEvent(cid, {
      charId: pc.id, source: source, diff: changes, transcriptMsgId: transcriptMsgId || null
    });
    sheetLog = await Store.listSheetEvents(cid);
    renderSheet();
    return evId;
  }
  async function undoEvent(evId) {
    const ev = sheetLog.find(function (e) { return e.id === evId; });
    if (!ev || ev.undone) return;
    SheetUI.applyChanges(pc.sheetState, ev.diff, true);
    await Store.saveCharacter(cid, pc);
    ev.undone = true;
    await Store.updateSheetEvent(cid, ev);
    await Store.addSheetEvent(cid, { charId: pc.id, source: 'undo', diff: ev.diff.map(function (c) {
      return { field: c.field, from: c.to, to: c.from };
    }), reverses: ev.id });
    sheetLog = await Store.listSheetEvents(cid);
    renderSheet(); renderLog();
  }
  function renderSheet() {
    if (!pc) { sheetBody.innerHTML = '<p class="card-sub">This campaign has no character.</p>'; return; }
    SheetUI.render(sheetBody, {
      schema: pack.sheetSchema,
      state: pc.sheetState,
      onDiff: async function (changes) { await logDiff(changes, 'player'); }
    });
  }
  function showSheetLog() {
    const list = h('div', { class: 'sheetlog-list' });
    const events = sheetLog.slice().reverse();
    if (!events.length) list.append(h('p', { class: 'card-sub' }, 'No changes yet. The sheet is the log — every change lands here with an undo.'));
    events.forEach(function (ev) {
      const row = h('div', { class: 'sheetlog-row' + (ev.undone ? ' undone' : '') },
        h('span', { class: 'sl-src' }, ev.source),
        h('span', { class: 'sl-diff' }, SheetUI.describeChanges(ev.diff)),
        h('span', { class: 'sl-ts' }, fmtTime(ev.ts)));
      if (ev.source !== 'undo' && !ev.undone) {
        const u = h('button', { class: 'btn small ghost' }, 'Undo');
        u.addEventListener('click', async function () { await undoEvent(ev.id); Modal.close(); showSheetLog(); });
        row.append(u);
      }
      list.append(row);
    });
    Modal.open(h('div', { class: 'modal-wide' },
      h('h2', null, 'Sheet history'), list,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: Modal.close }, 'Close'))));
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
      (data.aliases || []).forEach(function (a) {
        if (a && found.aliases.indexOf(a) < 0 && a.toLowerCase() !== found.name.toLowerCase()) found.aliases.push(a);
      });
      (data.tags || []).forEach(function (t) { if (t && found.tags.indexOf(t) < 0) found.tags.push(t); });
      await Store.saveWiki(cid, found);
      return { id: found.id, name: found.name, updated: true };
    }
    const id = await Store.saveWiki(cid, {
      type: data.type || 'npc', name: name, aliases: data.aliases || [],
      tags: data.tags || [], body: data.body || '', createdBy: 'llm', mergedInto: null
    });
    return { id: id, name: name, updated: false };
  }

  /* ---------- the chat loop ---------- */
  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    await Store.addMessage(cid, { role: 'player', content: text, sceneId: scene.id });
    messages = await Store.listMessages(cid);
    renderLog();
    runTurn(0);
  }

  async function begin() {
    await Store.addMessage(cid, {
      role: 'info', sceneId: scene.id,
      content: 'SYSTEM: The player is ready. Open the first scene of the campaign — set the stage, then hand them a situation.'
    });
    messages = await Store.listMessages(cid);
    runTurn(0);
  }

  async function runTurn(depth) {
    if (keyMissing()) { showBanner('No Gemini API key set — add yours in Settings to play.', false); return; }
    hideBanner();
    setBusy(true);
    try {
      const settings = Settings.forCampaign(campaign);
      const wiki = await Store.listWiki(cid);
      const asm = Context.assemble({
        pack: pack, schema: pack.sheetSchema, character: pc,
        scenes: scenes, currentSceneId: scene.id, wiki: wiki,
        messages: messages, budget: Settings.budgetFor(settings)
      });
      const res = await LLM.chat({ settings: settings, system: asm.system, messages: asm.messages });
      if (res.model && res.limit) {
        Toast(res.label + ' · ' + res.used + '/' + res.limit + ' requests today');
      }
      const parsed = Tags.parse(res.text);
      const msg = {
        role: 'gm', content: res.text, sceneId: scene.id,
        blocks: parsed.blocks.map(function (b) { return { tag: b.tag, data: b.data }; }),
        blockMeta: {}, rollResults: {}
      };
      await Store.addMessage(cid, msg);
      messages = await Store.listMessages(cid);
      await processBlocks(messages[messages.length - 1], depth);
      messages = await Store.listMessages(cid);
    } catch (e) {
      console.error(e);
      lastError = e.message;
      showBanner(e.message, true);
    }
    setBusy(false);
  }

  async function processBlocks(msg, depth) {
    const lookups = [];
    const blocks = msg.blocks || [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      try {
        if (b.tag === 'gm-sheet') {
          if (!pc || !b.data.changes) continue;
          const evId = await logDiff(b.data.changes, 'llm', msg.id);
          msg.blockMeta[i] = { eventId: evId };
        } else if (b.tag === 'gm-wiki') {
          const r = await upsertWiki(b.data);
          if (r) msg.blockMeta[i] = { entryId: r.id, updated: r.updated };
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
      await runTurn(depth + 1);
    }
  }

  async function onRollComplete(msg, blockIndex, result) {
    msg.rollResults = msg.rollResults || {};
    msg.rollResults[blockIndex] = result;
    await Store.updateMessage(cid, msg);
    const payload = {
      roll: result.rollId, character: (msg.blocks[blockIndex].data || {}).character,
      dice: result.dice.map(function (d) { return d.value; }),
      outcome: result.outcome, summary: result.text
    };
    if (result.total != null) payload.total = result.total;
    if (result.successes != null) payload.successes = result.successes;
    if (result.complications) payload.complications = result.complications;
    if (result.sets) payload.sets = result.sets;
    if (result.difficulty != null) payload.difficulty = result.difficulty;
    await Store.addMessage(cid, { role: 'roll-result', content: Tags.fence('roll-result', payload), sceneId: scene.id });
    messages = await Store.listMessages(cid);
    await runTurn(0);
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
      Toast('Scene closed. Its summary now feeds the GM\'s memory.');
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
  function renderHeader() {
    sceneTitleEl.textContent = scene.title + (scene.status === 'active' ? '' : ' (closed)');
    pinsEl.innerHTML = '';
    (scene.pinnedEntryIds || []).forEach(async function (id) {
      const e = await Store.getWiki(cid, id);
      if (e) pinsEl.append(h('a', { class: 'tag-chip pin', href: '#/wiki/' + cid, title: 'Pinned to scene' }, '📌 ' + e.name));
    });
  }

  function renderBlock(msg, block, bi) {
    const meta = (msg.blockMeta || {})[bi] || {};
    if (block.tag === 'gm-roll') {
      return Dice.widget({
        def: rollDef(block.data.roll), data: block.data,
        result: (msg.rollResults || {})[bi] || null,
        onRoll: function (result) { onRollComplete(msg, bi, result); }
      });
    }
    if (block.tag === 'gm-sheet') {
      const ev = sheetLog.find(function (e) { return e.id === meta.eventId; });
      const note = h('div', { class: 'inline-notice sheet-notice' },
        h('span', { class: 'notice-icon' }, '✎'),
        h('span', null,
          h('strong', null, (block.data.character || '') + ' — sheet updated. '),
          SheetUI.describeChanges(block.data.changes),
          block.data.reason ? h('em', { class: 'notice-reason' }, ' (' + block.data.reason + ')') : null));
      if (ev && !ev.undone) {
        const u = h('button', { class: 'btn small ghost' }, 'Undo');
        u.addEventListener('click', function () { undoEvent(ev.id); });
        note.append(u);
      } else if (ev && ev.undone) {
        note.append(h('span', { class: 'undone-tag' }, 'undone'));
      }
      return note;
    }
    if (block.tag === 'gm-wiki') {
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
      parsed.segments.forEach(function (seg) {
        if (seg.type === 'text') {
          const t = seg.text.trim();
          if (t) el.append(h('div', { class: 'narration', html: md(t) }));
        } else {
          el.append(renderBlock(m, seg.block, bi));
          bi++;
        }
      });
      return el;
    }
    if (m.role === 'roll-result') {
      let line = 'Dice rolled.';
      try {
        const d = JSON.parse(m.content.replace(/```roll-result\n?/, '').replace(/```$/, ''));
        line = (d.character ? d.character + ' rolled: ' : 'Rolled: ') + (d.summary || d.outcome || '');
      } catch (e) { /* keep default */ }
      return h('div', { class: 'msg msg-info' }, h('span', { class: 'die-mini' }, '⚄'), ' ' + line);
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
    if (!messages.length) {
      const beginBtn = h('button', { class: 'btn accent' }, 'Begin the adventure');
      beginBtn.addEventListener('click', begin);
      logEl.append(h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, campaign.name),
        h('p', null, 'The GM knows the rules of ' + pack.meta.name + (pc ? ' and is ready to run ' + pc.name + '\'s story.' : '.')),
        keyMissing()
          ? h('p', null, h('a', { class: 'btn accent', href: '#/settings' }, 'Add your Gemini key to start'))
          : beginBtn));
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
  }

  renderHeader();
  renderSheet();
  renderLog();
  if (keyMissing() && messages.length) showBanner('No Gemini API key set — add yours in Settings to play.', false);
};
