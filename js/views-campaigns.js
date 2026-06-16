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

Views.campaigns = async function (root) {
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
  root.append(wrap);

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

  function openCreate() {
    const nameInp = h('input', { type: 'text', placeholder: 'e.g. The Hollow Ford Debt' });
    const charInp = h('input', { type: 'text', placeholder: 'Character name' });

    /* world & genre — sets the kind of story and where it happens */
    const genre = genrePicker([]);
    const settingTa = h('textarea', { rows: '2', placeholder: 'Where and when? The world, era, place — e.g. "rain-soaked neon megacity, 2099" or "a frostbitten Norse coast".' });

    const charDescTa = h('textarea', { rows: '3', placeholder: 'Who are you? Name aside — background, look, personality, what you\'re good at, what you want. Plain text; the GM reads this.' });

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
      const charName = charInp.value.trim();
      if (!name || !charName) { Toast('A campaign name and a character name are both required.'); return; }
      const uid = Store.uid();
      const cid = await Store.saveCampaign({
        name: name, ownerUid: uid, members: [uid],
        genres: genre.get(), setting: settingTa.value.trim(),
        premise: premiseTa.value.trim(), boundaries: boundsTa.value.trim(),
        rulesNotes: rulesTa.value.trim(),
        settings: {}, currentSceneId: null, createdAt: Date.now()
      });
      await Store.saveCharacter(cid, {
        name: charName, isNPC: false,
        description: charDescTa.value.trim(), createdAt: Date.now()
      });
      /* pre-seeded cast → wiki entries, pinned to scene 1 so the GM has them
       * from the very first reply */
      const pinnedEntryIds = [];
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
        h('h3', null, 'World & genre'),
        h('p', { class: 'card-sub' }, 'What kind of story is this, and where does it take place? The GM grounds every scene in this.'),
        h('label', { class: 'form-row' }, h('span', null, 'Genre(s)'), genre.el),
        h('label', { class: 'form-row' }, h('span', null, 'Setting'), settingTa)),
      h('label', { class: 'form-row' }, h('span', null, 'Character name'), charInp),
      h('label', { class: 'form-row' }, h('span', null, 'Who is your character?'), charDescTa),
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
};
