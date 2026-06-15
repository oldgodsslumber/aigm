/* AI GM — Campaign List view (landing after sign-in). */
window.Views = window.Views || {};

Views.campaigns = async function (root) {
  root.dataset.screenLabel = 'Campaign List';
  const campaigns = await Store.listCampaigns();
  const packs = await Store.listPacks();
  const packName = function (id) {
    const p = packs.find(function (x) { return x.id === id; });
    return p ? p.meta.name : 'Unknown system';
  };

  root.innerHTML = '';
  const wrap = h('div', { class: 'page narrow' });
  wrap.append(h('div', { class: 'page-head' },
    h('h1', null, 'Campaigns'),
    h('button', { class: 'btn accent', onclick: openCreate }, 'New campaign')
  ));

  if (!campaigns.length) {
    wrap.append(h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'No campaigns yet.'),
      h('p', null, 'A campaign is one ongoing story: a system, a character, and everything the table remembers.'),
      h('button', { class: 'btn accent', onclick: openCreate }, 'Start your first campaign')
    ));
  } else {
    const grid = h('div', { class: 'card-grid' });
    for (const c of campaigns) {
      const chars = await Store.listCharacters(c.id);
      const pc = chars.find(function (x) { return !x.isNPC; });
      const card = h('a', { class: 'campaign-card', href: '#/play/' + c.id },
        h('h2', null, c.name),
        h('p', { class: 'card-sub' }, packName(c.packId) + (pc ? ' · ' + pc.name : '')),
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
    if (!packs.length) {
      Modal.open(h('div', null,
        h('h2', null, 'No system packs installed'),
        h('p', null, 'Install a system pack first — it defines the rules, sheet, and dice for a campaign.'),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onclick: Modal.close }, 'Close'),
          h('a', { class: 'btn accent', href: '#/packs', onclick: Modal.close }, 'Open Pack Manager'))
      ));
      return;
    }
    const nameInp = h('input', { type: 'text', placeholder: 'e.g. The Hollow Ford Debt' });
    const packSel = h('select', null, packs.map(function (p) {
      return h('option', { value: p.id }, p.meta.name);
    }));
    const tplSel = h('select');
    const charInp = h('input', { type: 'text', placeholder: 'Character name' });
    function fillTemplates() {
      const p = packs.find(function (x) { return x.id === packSel.value; });
      tplSel.innerHTML = '';
      ((p && p.templates) || []).forEach(function (t, i) {
        tplSel.append(h('option', { value: String(i) }, t.name));
      });
      tplSel.append(h('option', { value: 'blank' }, 'Blank sheet'));
      const first = (p && p.templates && p.templates[0]);
      charInp.value = first ? first.name : '';
    }
    packSel.addEventListener('change', fillTemplates);
    tplSel.addEventListener('change', function () {
      const p = packs.find(function (x) { return x.id === packSel.value; });
      const t = tplSel.value !== 'blank' && p.templates ? p.templates[Number(tplSel.value)] : null;
      if (t) charInp.value = t.name;
    });
    fillTemplates();

    const create = h('button', { class: 'btn accent' }, 'Create campaign');
    create.addEventListener('click', async function () {
      const name = nameInp.value.trim();
      const charName = charInp.value.trim();
      if (!name || !charName) { Toast('A campaign name and a character name are both required.'); return; }
      const pack = packs.find(function (x) { return x.id === packSel.value; });
      const tpl = tplSel.value !== 'blank' && pack.templates ? pack.templates[Number(tplSel.value)] : null;
      const uid = Store.uid();
      const cid = await Store.saveCampaign({
        name: name, ownerUid: uid, members: [uid], packId: pack.id,
        settings: {}, currentSceneId: null, createdAt: Date.now()
      });
      let sheet = SheetUI.newSheet(pack.sheetSchema);
      if (tpl) {
        Object.keys(tpl.sheet).forEach(function (k) {
          sheet[k] = JSON.parse(JSON.stringify(tpl.sheet[k]));
        });
      }
      await Store.saveCharacter(cid, {
        name: charName, isNPC: false, packId: pack.id, sheetState: sheet, createdAt: Date.now()
      });
      const sceneId = await Store.saveScene(cid, {
        title: 'Scene 1', summary: '', status: 'active', pinnedEntryIds: [], startedAt: Date.now()
      });
      const camp = await Store.getCampaign(cid);
      camp.currentSceneId = sceneId;
      await Store.saveCampaign(camp);
      Modal.close();
      location.hash = '#/play/' + cid;
    });

    Modal.open(h('div', null,
      h('h2', null, 'New campaign'),
      h('label', { class: 'form-row' }, h('span', null, 'Campaign name'), nameInp),
      h('label', { class: 'form-row' }, h('span', null, 'System pack'), packSel),
      h('label', { class: 'form-row' }, h('span', null, 'Character'), tplSel),
      h('label', { class: 'form-row' }, h('span', null, 'Character name'), charInp),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), create)
    ));
    nameInp.focus();
  }
};
