/* AI GM — Character library: your portable cast. A character lives above any
 * one story; from here you start new adventures with them or jump into the
 * stories they're already in. Their saved state (bio, condition, story so far)
 * is what a new "continuing" story seeds from. */
window.Views = window.Views || {};

Views.characters = async function (root) {
  root.dataset.screenLabel = 'Characters';
  const chars = await Store.listLibChars();

  root.innerHTML = '';
  const wrap = h('div', { class: 'page narrow' });
  wrap.append(h('div', { class: 'page-head' },
    h('h1', null, 'Characters'),
    h('button', { class: 'btn accent', onclick: function () { openEditor(null); } }, 'New character')
  ));

  if (!chars.length) {
    wrap.append(h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'No characters yet.'),
      h('p', null, 'A character is yours to keep — carry them from a one-shot into a campaign, or start a fresh story with them any time. New characters also appear here once you create a campaign.'),
      h('button', { class: 'btn accent', onclick: function () { openEditor(null); } }, 'Create a character')
    ));
    root.append(wrap);
    return;
  }

  const grid = h('div', { class: 'card-grid' });
  for (const c of chars) {
    const stories = await Store.storiesForChar(c.id);
    const card = h('div', { class: 'campaign-card char-card' },
      h('h2', null, c.name),
      c.description ? h('p', { class: 'card-sub' }, snippet(c.description, 140)) : h('p', { class: 'card-sub' }, 'No bio yet.'),
      h('p', { class: 'card-meta' },
        (stories.length ? stories.length + (stories.length === 1 ? ' story' : ' stories') : 'No stories yet') +
        (c.lastPlayedAt ? ' · last played ' + fmtTime(c.lastPlayedAt) : '')));

    if (stories.length) {
      const list = h('div', { class: 'char-stories' });
      stories.forEach(function (s) {
        list.append(h('a', { class: 'char-story-link', href: '#/play/' + s.id },
          h('span', null, s.name),
          h('span', { class: 'fmt-tag' }, fmtLabel(s.format))));
      });
      card.append(list);
    }

    const actions = h('div', { class: 'char-card-actions' });
    actions.append(h('a', { class: 'btn small accent', href: '#/new/' + c.id }, 'New story'));
    const editBtn = h('button', { class: 'btn small ghost', type: 'button' }, 'Edit');
    editBtn.addEventListener('click', function () { openEditor(c); });
    actions.append(editBtn);
    const delBtn = h('button', { class: 'btn small ghost', type: 'button' }, 'Delete');
    delBtn.addEventListener('click', function () { confirmDelete(c, stories); });
    actions.append(delBtn);
    card.append(actions);
    grid.append(card);
  }
  wrap.append(grid);
  root.append(wrap);

  function snippet(text, n) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }
  function fmtLabel(id) {
    const f = (window.FORMATS || []).find(function (x) { return x.id === id; });
    return f ? f.label : (id || 'Story');
  }

  function openEditor(c) {
    const nameInp = h('input', { type: 'text', value: (c && c.name) || '', placeholder: 'Character name' });
    const descTa = h('textarea', { rows: '4', placeholder: 'Background, look, personality, what they\'re good at, what they want.' }, (c && c.description) || '');
    const condTa = h('textarea', { rows: '3', placeholder: 'Their current condition — injuries, inventory, resources, standing. New continuing stories open with this.' }, (c && c.condition) || '');
    const recapTa = h('textarea', { rows: '5', placeholder: 'What\'s happened to them so far. Usually filled in for you when you Save character mid-story, but you can edit it.' }, (c && c.storySoFar) || '');
    const save = h('button', { class: 'btn accent' }, c ? 'Save changes' : 'Create character');
    save.addEventListener('click', async function () {
      const name = nameInp.value.trim();
      if (!name) { Toast('A name is required.'); return; }
      const rec = Object.assign({}, c || {}, {
        name: name, description: descTa.value.trim(),
        condition: condTa.value.trim(), storySoFar: recapTa.value.trim()
      });
      await Store.saveLibChar(rec);
      Modal.close();
      Views.characters(root);
    });
    Modal.open(h('div', { class: 'modal-wide' },
      h('h2', null, c ? 'Edit ' + c.name : 'New character'),
      h('label', { class: 'form-row' }, h('span', null, 'Name'), nameInp),
      h('label', { class: 'form-row' }, h('span', null, 'Bio'), descTa),
      h('label', { class: 'form-row' }, h('span', null, 'Current condition'), condTa),
      h('label', { class: 'form-row' }, h('span', null, 'Story so far'), recapTa),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), save)));
    nameInp.focus();
  }

  function confirmDelete(c, stories) {
    Modal.open(h('div', null,
      h('h2', null, 'Delete “' + c.name + '”?'),
      h('p', null, 'This removes the character from your library. ' +
        (stories.length
          ? 'Their ' + stories.length + ' existing ' + (stories.length === 1 ? 'story stays' : 'stories stay') + ' playable, but those stories will no longer be linked to a saved character.'
          : 'They have no stories, so nothing else is affected.')),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'),
        h('button', { class: 'btn danger', onclick: async function () {
          await Store.deleteLibChar(c.id);
          Modal.close();
          Views.characters(root);
        } }, 'Delete'))));
  }
};
