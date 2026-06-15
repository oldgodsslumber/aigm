/* AI GM — Journal view: scenes + summaries, click through to raw transcript. */
window.Views = window.Views || {};

Views.journal = async function (root, cid) {
  root.dataset.screenLabel = 'Journal View';
  const campaign = await Store.getCampaign(cid);
  const scenes = await Store.listScenes(cid);
  const messages = await Store.listMessages(cid);

  root.innerHTML = '';
  const wrap = h('div', { class: 'page narrow' });
  wrap.append(h('div', { class: 'page-head' },
    h('h1', null, 'Journal', h('span', { class: 'head-sub' }, campaign.name))));

  if (!scenes.length) {
    wrap.append(h('div', { class: 'empty-state' }, h('p', null, 'No scenes yet — the journal fills in as you play.')));
  }

  scenes.forEach(function (sc, i) {
    const msgs = messages.filter(function (m) { return m.sceneId === sc.id; });
    const card = h('article', { class: 'journal-card' + (sc.status === 'active' ? ' active' : '') });
    card.append(h('header', { class: 'journal-head' },
      h('span', { class: 'journal-num' }, String(i + 1).padStart(2, '0')),
      h('h2', null, sc.title || 'Scene ' + (i + 1)),
      h('span', { class: 'journal-meta' },
        sc.status === 'active' ? 'in progress' :
          (sc.closedAt ? new Date(sc.closedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''))));

    if (sc.summary) card.append(h('div', { class: 'journal-summary', html: md(sc.summary) }));
    else if (sc.status === 'active') card.append(h('p', { class: 'card-sub' }, 'The current scene — its summary is written when you end it.'));
    else card.append(h('p', { class: 'card-sub' }, 'No summary recorded.'));

    if (msgs.length) {
      const det = h('details', { class: 'journal-transcript' });
      det.append(h('summary', null, 'Raw transcript — ' + msgs.length + ' message' + (msgs.length > 1 ? 's' : '')));
      const inner = h('div', { class: 'transcript-read' });
      det.addEventListener('toggle', function () {
        if (!det.open || inner.childNodes.length) return;
        msgs.forEach(function (m) { inner.append(renderReadOnly(m)); });
      });
      det.append(inner);
      card.append(det);
    }
    wrap.append(card);
  });
  root.append(wrap);

  function renderReadOnly(m) {
    if (m.role === 'player') {
      return h('div', { class: 'tr-row tr-player' }, h('span', { class: 'tr-who' }, 'You'), h('div', { html: md(m.content) }));
    }
    if (m.role === 'gm') {
      const el = h('div', { class: 'tr-row tr-gm' }, h('span', { class: 'tr-who' }, 'GM'));
      const parsed = Tags.parse(m.content);
      const body = h('div');
      parsed.segments.forEach(function (seg) {
        if (seg.type === 'text') { if (seg.text.trim()) body.append(h('div', { html: md(seg.text.trim()) })); }
        else {
          const b = seg.block;
          let label = b.tag;
          if (b.tag === 'gm-roll') label = 'roll requested: ' + (b.data.roll || '') + (b.data.reason ? ' — ' + b.data.reason : '');
          if (b.tag === 'gm-sheet') label = 'sheet: ' + SheetUI.describeChanges(b.data.changes);
          if (b.tag === 'gm-wiki') label = 'wiki: ' + (b.data.name || '');
          if (b.tag === 'gm-lookup') label = 'lookup: ' + (b.data.query || '');
          if (b.tag === 'gm-scene') label = 'scene summary proposed';
          body.append(h('div', { class: 'tr-block' }, '[' + label + ']'));
        }
      });
      el.append(body);
      return el;
    }
    if (m.role === 'roll-result') {
      let line = 'dice rolled';
      try {
        const d = JSON.parse(m.content.replace(/```roll-result\n?/, '').replace(/```$/, ''));
        line = (d.character ? d.character + ': ' : '') + (d.summary || '');
      } catch (e) { /* ignore */ }
      return h('div', { class: 'tr-row tr-info' }, h('span', { class: 'tr-who' }, '⚄'), h('div', null, line));
    }
    return h('div', { class: 'tr-row tr-info' }, h('span', { class: 'tr-who' }, '·'),
      h('div', null, m.content.indexOf('SYSTEM:') === 0 ? m.content.replace('SYSTEM: ', '') : 'app message'));
  }
};
