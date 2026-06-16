/* AI GM — Wiki view: browse, search, edit, merge, pin. */
window.Views = window.Views || {};

Views.wiki = async function (root, cid) {
  root.dataset.screenLabel = 'Wiki View';
  const campaign = await Store.getCampaign(cid);
  let entries = await Store.listWiki(cid);
  const TYPES = ['pc', 'npc', 'location', 'faction', 'item', 'event'];
  let typeFilter = '', query = '';

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

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('h1', null, 'Wiki', h('span', { class: 'head-sub' }, campaign.name)),
      newBtn),
    h('details', { class: 'wiki-intake', open: '' },
      h('summary', null, 'Add world info'),
      h('p', { class: 'card-sub' }, 'Drop in lore and notes; they’re filed into the wiki as characters, locations, factions, items, and events — without touching the story.'),
      worldTa,
      h('div', { class: 'wiki-intake-actions' }, intakeBtn, intakeStatus)),
    h('div', { class: 'wiki-toolbar' }, search, chips),
    listEl));

  /* Name/alias-based upsert: update an existing entry if the name matches,
   * otherwise create. Mirrors the GM's in-play wiki upsert. */
  async function upsertFromData(data) {
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
      (data.aliases || []).forEach(function (a) {
        if (a && found.aliases.indexOf(a) < 0 && a.toLowerCase() !== found.name.toLowerCase()) found.aliases.push(a);
      });
      (data.tags || []).forEach(function (t) { if (t && found.tags.indexOf(t) < 0) found.tags.push(t); });
      await Store.saveWiki(cid, found);
      return { updated: true };
    }
    await Store.saveWiki(cid, {
      type: data.type || 'npc', name: name, aliases: data.aliases || [],
      tags: data.tags || [], body: data.body || '', createdBy: 'llm', mergedInto: null
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
      const res = await LLM.chat({ settings: settings, system: system, messages: [{ role: 'user', content: text }] });
      const blocks = Tags.parse(res.text).blocks.filter(function (b) { return b.tag === 'gm-wiki'; });
      let created = 0, updated = 0;
      for (const b of blocks) {
        const r = await upsertFromData(b.data);
        if (!r) continue;
        if (r.updated) updated++; else created++;
      }
      entries = await Store.listWiki(cid);
      renderList();
      if (!blocks.length) {
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

  function visible() {
    return entries.filter(function (e) {
      if (e.mergedInto) return false;
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
      const card = h('button', { class: 'wiki-card' },
        h('div', { class: 'wiki-card-top' },
          h('span', { class: 'tag-chip type-' + e.type }, e.type),
          e.createdBy === 'llm' ? h('span', { class: 'wiki-by' }, 'GM') : null),
        h('h2', null, e.name),
        (e.aliases && e.aliases.length) ? h('p', { class: 'card-meta' }, 'aka ' + e.aliases.join(', ')) : null,
        h('p', { class: 'wiki-body-preview' }, (e.body || '').slice(0, 160) + ((e.body || '').length > 160 ? '…' : '')),
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

    const save = h('button', { class: 'btn accent' }, 'Save');
    save.addEventListener('click', async function () {
      if (!nameInp.value.trim()) { Toast('A name is required.'); return; }
      e.type = typeSel.value;
      e.name = nameInp.value.trim();
      e.aliases = aliasInp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      e.tags = tagInp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      e.body = bodyTa.value.trim();
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
