/* AI GM — Campaign List view (landing after sign-in). */
window.Views = window.Views || {};

/* Shared genre picker — preset chips (multi-select) plus a free-text field for
 * anything not listed. Reused by the create form and the in-play Story setup.
 * Returns { el, get() } where get() yields the combined genre list. */
window.GENRES = ['Fantasy', 'Sci-Fi', 'Horror', 'Mystery', 'Modern', 'Historical',
  'Post-Apocalyptic', 'Cyberpunk', 'Western', 'Superhero', 'Noir', 'Steampunk',
  'Space Opera', 'Urban Fantasy', 'Comedy', 'Romance'];
function genrePicker(selected) {
  const chosen = new Set(selected || []);
  const presetLower = window.GENRES.map(function (g) { return g.toLowerCase(); });
  const row = h('div', { class: 'chip-row genre-chips' });
  window.GENRES.forEach(function (g) {
    const c = h('button', { class: 'chip' + (chosen.has(g) ? ' on' : ''), type: 'button' }, g);
    c.addEventListener('click', function () {
      if (chosen.has(g)) { chosen.delete(g); c.classList.remove('on'); }
      else { chosen.add(g); c.classList.add('on'); }
    });
    row.append(c);
  });
  const extras = (selected || []).filter(function (g) { return presetLower.indexOf(String(g).toLowerCase()) < 0; });
  const customInp = h('input', { type: 'text', placeholder: 'Other genres, comma-separated', value: extras.join(', ') });
  function get() {
    const out = [];
    window.GENRES.forEach(function (g) { if (chosen.has(g)) out.push(g); });
    customInp.value.split(',').forEach(function (s) {
      const t = s.trim(); if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }
  return { el: h('div', { class: 'genre-picker' }, row, customInp), get: get };
}
window.genrePicker = genrePicker;

/* Play format — shapes the villain countdown's scale & pacing. Single-select
 * card picker, reused by the create form and the in-play Story setup. */
window.FORMATS = [
  { id: 'oneshot', label: 'One-shot', tag: 'Action movie', desc: 'A single session. The villain’s scheme is tight and fast; generate a fresh one whenever you like.' },
  { id: 'multishot', label: 'Multi-shot', tag: 'TV series', desc: 'A multi-session arc. The villain’s plan has several components; recalculate it between sessions as things change.' },
  { id: 'campaign', label: 'Campaign', tag: 'Fantasy epic', desc: 'Open-ended and freeform. The countdown is a looming background threat, leaving room for side quests.' }
];
function formatPicker(selected) {
  let chosen = selected || 'campaign';
  const row = h('div', { class: 'format-cards' });
  window.FORMATS.forEach(function (f) {
    const card = h('button', { class: 'format-card' + (f.id === chosen ? ' on' : ''), type: 'button' },
      h('span', { class: 'format-tag' }, f.tag),
      h('strong', null, f.label),
      h('span', { class: 'format-desc' }, f.desc));
    card.addEventListener('click', function () {
      chosen = f.id;
      row.querySelectorAll('.format-card').forEach(function (x) { x.classList.remove('on'); });
      card.classList.add('on');
    });
    row.append(card);
  });
  return { el: row, get: function () { return chosen; } };
}
window.formatPicker = formatPicker;

Views.campaigns = async function (root, openCreateCharId) {
  root.dataset.screenLabel = 'Campaign List';
  const campaigns = await Store.listCampaigns();

  root.innerHTML = '';
  const wrap = h('div', { class: 'page narrow' });
  wrap.append(h('div', { class: 'page-head' },
    h('h1', null, 'Campaigns'),
    h('button', { class: 'btn accent', onclick: openCreate }, 'New campaign')
  ));

  if (!campaigns.length) {
    wrap.append(h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'No campaigns yet.'),
      h('p', null, 'A campaign is one ongoing story: a character, a premise, and everything the table remembers.'),
      h('button', { class: 'btn accent', onclick: openCreate }, 'Start your first campaign')
    ));
  } else {
    const grid = h('div', { class: 'card-grid' });
    for (const c of campaigns) {
      const chars = await Store.listCharacters(c.id);
      const pc = chars.find(function (x) { return !x.isNPC; });
      const card = h('a', { class: 'campaign-card', href: '#/play/' + c.id },
        h('h2', null, c.name),
        h('p', { class: 'card-sub' }, pc ? pc.name : 'No character'),
        h('p', { class: 'card-meta' }, c.lastPlayedAt ? 'Last played ' + fmtTime(c.lastPlayedAt) : 'Never played')
      );
      const del = h('button', { class: 'card-del', 'aria-label': 'Delete ' + c.name, title: 'Delete campaign' }, '×');
      del.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); confirmDelete(c); });
      card.append(del);
      grid.append(card);
    }
    wrap.append(grid);
  }

  /* ---- ready-to-play examples: a full campaign, prepped; just add yourself ---- */
  const examples = (typeof Examples !== 'undefined' && Examples.list()) || [];
  if (examples.length) {
    const exGrid = h('div', { class: 'card-grid' });
    examples.forEach(function (ex) {
      const card = h('button', { class: 'campaign-card example-card', type: 'button' },
        h('span', { class: 'example-badge' }, 'Ready to play'),
        h('h2', null, ex.title),
        h('p', { class: 'card-sub' }, ex.tagline));
      card.addEventListener('click', function () { startExample(ex); });
      exGrid.append(card);
    });
    wrap.append(h('div', { class: 'examples-section' },
      h('h2', { class: 'section-title' }, 'Example adventures'),
      h('p', { class: 'card-sub' }, 'Jump straight in — a full campaign with the cast, the wiki, and the villain\'s plan already prepared. You just name your character and play.'),
      exGrid));
  }
  root.append(wrap);

  function startExample(ex) {
    const nameInp = ex.fixedPC ? null : h('input', { type: 'text', value: ex.defaultCharName, autocomplete: 'off' });
    const go = h('button', { class: 'btn accent' }, 'Begin');
    go.addEventListener('click', async function () {
      go.disabled = true;
      try {
        const cid = await Examples.instantiate(ex.id, nameInp ? nameInp.value : null);
        Modal.close();
        location.hash = '#/play/' + cid;
      } catch (e) { console.error(e); Toast(e.message); go.disabled = false; }
    });
    if (nameInp) nameInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    Modal.open(h('div', null,
      h('h2', null, ex.title),
      h('p', { class: 'card-sub' }, ex.blurb),
      ex.fixedPC
        ? h('p', null, 'You play ' + ex.pcName + '. Everything is ready — the cast, the wiki, and what\'s coming for you. Press Begin and the opening scene starts.')
        : h('p', null, 'Everything is ready — the cast, the wiki, and the villain\'s plan. Give your character a name; you\'ll introduce yourself in the opening scene, in your own words.'),
      nameInp ? h('label', { class: 'form-row' }, h('span', null, 'Your character\'s name'), nameInp) : null,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), go)));
    if (nameInp) { nameInp.focus(); nameInp.select(); }
  }

  function confirmDelete(c) {
    /* Hard delete with type-the-name confirm — the one destructive act in the app. */
    const inp = h('input', { type: 'text', placeholder: c.name, autocomplete: 'off' });
    const btn = h('button', { class: 'btn danger', disabled: '' }, 'Delete forever');
    inp.addEventListener('input', function () {
      if (inp.value === c.name) btn.removeAttribute('disabled'); else btn.setAttribute('disabled', '');
    });
    btn.addEventListener('click', async function () {
      await Store.deleteCampaign(c.id);
      Modal.close();
      Views.campaigns(root);
    });
    Modal.open(h('div', null,
      h('h2', null, 'Delete “' + c.name + '”?'),
      h('p', null, 'This permanently deletes the campaign — transcript, characters, wiki, journal, everything. There is no undo.'),
      h('p', null, 'Type the campaign name to confirm:'),
      inp,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), btn)
    ));
  }

  async function openCreate(presetCharId) {
    /* openCreate doubles as an onclick handler (gets an Event), so only honor a
     * real character id passed from the roster's "New story with…" action. */
    if (presetCharId && typeof presetCharId !== 'string') presetCharId = null;
    const libChars = await Store.listLibChars();
    const nameInp = h('input', { type: 'text', placeholder: 'e.g. The Hollow Ford Debt' });

    /* play format — one-shot / multi-shot / campaign (shapes the threat plan) */
    const format = formatPicker('campaign');

    /* world & genre — sets the kind of story and where it happens */
    const genre = genrePicker([]);
    const settingTa = h('textarea', { rows: '2', placeholder: 'Where and when? The world, era, place — e.g. "rain-soaked neon megacity, 2099" or "a frostbitten Norse coast".' });

    /* ---- character: continue one from the library, or make a new one ---- */
    const charInp = h('input', { type: 'text', placeholder: 'Character name' });
    const charDescTa = h('textarea', { rows: '3', placeholder: 'Who are you? Name aside — background, look, personality, what you\'re good at, what you want. Plain text; the GM reads this.' });

    let charMode = libChars.length ? 'existing' : 'new';
    let selectedCharId = presetCharId || (libChars[0] && libChars[0].id) || null;
    if (presetCharId) charMode = 'existing';

    const existingSel = h('select', null, libChars.map(function (c) {
      return h('option', { value: c.id }, c.name + (c.lastPlayedCampaignId ? ' · continuing' : ' · new'));
    }));
    if (selectedCharId) existingSel.value = selectedCharId;
    const existingNote = h('p', { class: 'card-sub' });
    function refreshNote() {
      const c = libChars.find(function (x) { return x.id === existingSel.value; });
      existingNote.textContent = c && c.storySoFar
        ? 'This story continues from where ' + c.name + ' left off — their bio, current condition, and what\'s happened so far carry over.'
        : (c ? c.name + ' starts this story fresh (no prior adventures recorded yet).' : '');
    }
    existingSel.addEventListener('change', function () { selectedCharId = existingSel.value; refreshNote(); });
    refreshNote();

    const newCharBox = h('div', null,
      h('label', { class: 'form-row' }, h('span', null, 'Character name'), charInp),
      h('label', { class: 'form-row' }, h('span', null, 'Who is your character?'), charDescTa));
    const existingBox = h('div', null,
      h('label', { class: 'form-row' }, h('span', null, 'Character'), existingSel),
      existingNote);

    const modeNew = h('button', { class: 'chip' + (charMode === 'new' ? ' on' : ''), type: 'button' }, 'New character');
    const modeExisting = h('button', { class: 'chip' + (charMode === 'existing' ? ' on' : ''), type: 'button' }, 'Continue a character');
    function syncMode() {
      modeNew.classList.toggle('on', charMode === 'new');
      modeExisting.classList.toggle('on', charMode === 'existing');
      newCharBox.style.display = charMode === 'new' ? '' : 'none';
      existingBox.style.display = charMode === 'existing' ? '' : 'none';
    }
    modeNew.addEventListener('click', function () { charMode = 'new'; syncMode(); });
    modeExisting.addEventListener('click', function () { charMode = 'existing'; syncMode(); });
    const charSection = h('div', { class: 'create-section' },
      h('h3', null, 'Character'),
      libChars.length
        ? h('p', { class: 'card-sub' }, 'Start a new character, or carry one of your existing characters into this story.')
        : h('p', { class: 'card-sub' }, 'Create a character for this story. You can carry them into future stories later.'),
      libChars.length ? h('div', { class: 'chip-row' }, modeNew, modeExisting) : null,
      existingBox, newCharBox);
    syncMode();

    /* story setup */
    const premiseTa = h('textarea', { rows: '4', placeholder: 'Where does the story start? The situation, the hook, the job. Leave blank to let the GM open cold.' });
    const boundsTa = h('textarea', { rows: '3', placeholder: 'Tone and content limits — e.g. "pulpy and fun, fade to black on gore, no harm to children".' });
    const rulesTa = h('textarea', { rows: '3', placeholder: 'Optional house rules or system notes — e.g. "use FATE-style aspects", "track Stress 0-4". Leave blank for pure freeform.' });

    /* pre-seeded cast (NPCs / key characters) — saved as wiki entries pinned
     * to scene 1 so the GM knows them from the opening. */
    const castWrap = h('div', { class: 'cast-list' });
    const castRows = [];
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
      const ref = { name: nameI, type: typeS, desc: descI, el: rowEl };
      del.addEventListener('click', function () {
        const i = castRows.indexOf(ref);
        if (i >= 0) castRows.splice(i, 1);
        rowEl.remove();
      });
      castRows.push(ref);
      castWrap.append(rowEl);
    }
    const addCastBtn = h('button', { class: 'btn small', type: 'button' }, '+ Add character / NPC');
    addCastBtn.addEventListener('click', addCastRow);

    const create = h('button', { class: 'btn accent' }, 'Create campaign');
    create.addEventListener('click', async function () {
      const name = nameInp.value.trim();
      const uid = Store.uid();

      /* resolve the character first — either an existing library character we
       * continue, or a brand-new one we also add to the library. */
      let libChar;
      if (charMode === 'existing') {
        libChar = await Store.getLibChar(selectedCharId);
        if (!name || !libChar) { Toast('Pick a character and give the story a name.'); return; }
      } else {
        const charName = charInp.value.trim();
        if (!name || !charName) { Toast('A campaign name and a character name are both required.'); return; }
        const libId = await Store.saveLibChar({
          name: charName, description: charDescTa.value.trim(),
          condition: '', storySoFar: ''
        });
        libChar = await Store.getLibChar(libId);
      }

      const cid = await Store.saveCampaign({
        name: name, ownerUid: uid, members: [uid],
        format: format.get(),
        genres: genre.get(), setting: settingTa.value.trim(),
        premise: premiseTa.value.trim(), boundaries: boundsTa.value.trim(),
        rulesNotes: rulesTa.value.trim(),
        characterId: libChar.id, recap: libChar.storySoFar || '',
        settings: {}, currentSceneId: null, createdAt: Date.now()
      });
      /* per-story copy of the PC, seeded from the library character and linked
       * back to it so progress can be saved later */
      await Store.saveCharacter(cid, {
        name: libChar.name, isNPC: false, libCharId: libChar.id,
        description: libChar.description || '', createdAt: Date.now()
      });
      /* pre-seeded cast → wiki entries, pinned to scene 1 so the GM has them
       * from the very first reply */
      const pinnedEntryIds = [];
      /* carry the character's last-known condition in as a pinned pc entry so a
       * continued story opens with their injuries, gear, and standing intact */
      if (charMode === 'existing' && libChar.condition && libChar.condition.trim()) {
        const pid = await Store.saveWiki(cid, {
          type: 'pc', name: libChar.name, aliases: [], tags: [],
          body: libChar.condition.trim(), createdBy: 'player', mergedInto: null
        });
        pinnedEntryIds.push(pid);
      }
      for (const r of castRows) {
        const cn = r.name.value.trim();
        if (!cn) continue;
        const id = await Store.saveWiki(cid, {
          type: r.type.value || 'npc', name: cn, aliases: [], tags: [],
          body: r.desc.value.trim(), createdBy: 'player', mergedInto: null
        });
        pinnedEntryIds.push(id);
      }
      const sceneId = await Store.saveScene(cid, {
        title: 'Scene 1', summary: '', status: 'active', pinnedEntryIds: pinnedEntryIds, startedAt: Date.now()
      });
      const camp = await Store.getCampaign(cid);
      camp.currentSceneId = sceneId;
      await Store.saveCampaign(camp);
      Modal.close();
      location.hash = '#/play/' + cid;
    });

    Modal.open(h('div', { class: 'create-campaign' },
      h('h2', null, 'New campaign'),
      h('label', { class: 'form-row' }, h('span', null, 'Campaign name'), nameInp),
      h('div', { class: 'create-section' },
        h('h3', null, 'Play format'),
        h('p', { class: 'card-sub' }, 'How big is the story? This shapes the villain’s countdown — how urgent and far-reaching their plan is.'),
        format.el),
      h('div', { class: 'create-section' },
        h('h3', null, 'World & genre'),
        h('p', { class: 'card-sub' }, 'What kind of story is this, and where does it take place? The GM grounds every scene in this.'),
        h('label', { class: 'form-row' }, h('span', null, 'Genre(s)'), genre.el),
        h('label', { class: 'form-row' }, h('span', null, 'Setting'), settingTa)),
      charSection,
      h('div', { class: 'create-section' },
        h('h3', null, 'Story setup'),
        h('p', { class: 'card-sub' }, 'Optional, but this is how you tell the GM what story you want and what to keep in or out.'),
        h('label', { class: 'form-row' }, h('span', null, 'Premise & starting situation'), premiseTa),
        h('label', { class: 'form-row' }, h('span', null, 'Tone & boundaries'), boundsTa),
        h('label', { class: 'form-row' }, h('span', null, 'Rules & mechanics notes'), rulesTa)),
      h('div', { class: 'create-section' },
        h('h3', null, 'Cast'),
        h('p', { class: 'card-sub' }, 'Pre-establish NPCs, factions, or places. They\'re pinned to the first scene so the GM knows them from the start.'),
        castWrap, addCastBtn),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), create)
    ));
    nameInp.focus();
  }

  /* arrived via #/new/<charId> — jump straight into create with that character */
  if (openCreateCharId) openCreate(openCreateCharId);
};
