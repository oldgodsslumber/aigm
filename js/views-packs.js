/* AI GM — Pack Manager: install (JSON upload/paste) + validate + inspect. */
window.Views = window.Views || {};

Views.packs = async function (root) {
  root.dataset.screenLabel = 'Pack Manager';
  const packs = await Store.listPacks();
  const campaigns = await Store.listCampaigns();
  root.innerHTML = '';

  const wrap = h('div', { class: 'page narrow' });
  wrap.append(h('div', { class: 'page-head' },
    h('h1', null, 'System Packs'),
    h('button', { class: 'btn accent', onclick: openInstall }, 'Install pack')
  ));
  wrap.append(h('p', { class: 'page-intro' },
    'A system pack is one JSON document: sheet schema, declarative roll definitions, the GM rules prompt, and character templates. Packs are authored outside the app and installed here.'));

  const list = h('div', { class: 'pack-list' });
  packs.forEach(function (p) {
    const used = campaigns.filter(function (c) { return c.packId === p.id; }).length;
    const rolls = (p.rollDefinitions || []).map(function (r) { return r.label || r.id; }).join(', ');
    const viewBtn = h('button', { class: 'btn small' }, 'View JSON');
    viewBtn.addEventListener('click', function () {
      Modal.open(h('div', { class: 'modal-wide' },
        h('h2', null, p.meta.name),
        h('pre', { class: 'json-view' }, JSON.stringify(p, null, 2)),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: Modal.close }, 'Close'))
      ));
    });
    const delBtn = h('button', { class: 'btn small danger-ghost' }, 'Remove');
    delBtn.addEventListener('click', async function () {
      if (used) { Toast('In use by ' + used + ' campaign' + (used > 1 ? 's' : '') + ' — can\'t remove.'); return; }
      await Store.deletePack(p.id);
      Views.packs(root);
    });
    list.append(h('div', { class: 'pack-card' },
      h('div', { class: 'pack-card-main' },
        h('h2', null, p.meta.name, p.builtin ? h('span', { class: 'tag-chip' }, 'built-in') : null),
        h('p', { class: 'card-sub' },
          (p.meta.system || '') + (p.meta.version ? ' · v' + p.meta.version : '') +
          (p.meta.author ? ' · ' + p.meta.author : '')),
        h('p', { class: 'card-meta' }, 'Rolls: ' + (rolls || 'none') +
          ' · Templates: ' + ((p.templates || []).length) +
          (used ? ' · Used by ' + used + ' campaign' + (used > 1 ? 's' : '') : ''))),
      h('div', { class: 'pack-card-actions' }, viewBtn, delBtn)
    ));
  });
  if (!packs.length) list.append(h('div', { class: 'empty-state' }, h('p', null, 'No packs installed.')));
  wrap.append(list);
  root.append(wrap);

  function openInstall() {
    const ta = h('textarea', { class: 'json-input', placeholder: 'Paste pack JSON here…', spellcheck: 'false' });
    const fileInp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    const fileBtn = h('button', { class: 'btn small', type: 'button' }, 'Load from file…');
    fileBtn.addEventListener('click', function () { fileInp.click(); });
    fileInp.addEventListener('change', async function () {
      if (fileInp.files[0]) ta.value = await fileInp.files[0].text();
      check();
    });

    const report = h('div', { class: 'validate-report' });
    const install = h('button', { class: 'btn accent', disabled: '' }, 'Install');
    let candidate = null;

    function check() {
      report.innerHTML = '';
      candidate = null;
      install.setAttribute('disabled', '');
      const text = ta.value.trim();
      if (!text) return;
      let obj;
      try { obj = JSON.parse(text); }
      catch (e) {
        report.append(h('p', { class: 'v-err' }, '✗ Not valid JSON: ' + e.message));
        return;
      }
      const res = PackValidate.validate(obj);
      res.errors.forEach(function (er) { report.append(h('p', { class: 'v-err' }, '✗ ' + er)); });
      res.warnings.forEach(function (w) { report.append(h('p', { class: 'v-warn' }, '⚠ ' + w)); });
      if (res.ok) {
        report.append(h('p', { class: 'v-ok' }, '✓ Valid pack: ' + obj.meta.name +
          ' — ' + obj.rollDefinitions.length + ' roll definition(s), ' +
          ((obj.templates || []).length) + ' template(s).'));
        candidate = obj;
        install.removeAttribute('disabled');
      }
    }
    ta.addEventListener('input', debounce(check, 400));

    install.addEventListener('click', async function () {
      if (!candidate) return;
      delete candidate.id; /* fresh id; built-ins keep theirs via seeding only */
      candidate.public = true;
      await Store.savePack(candidate);
      Modal.close();
      Toast('Installed “' + candidate.meta.name + '”.');
      Views.packs(root);
    });

    Modal.open(h('div', { class: 'modal-wide' },
      h('h2', null, 'Install a system pack'),
      h('div', { class: 'inline-pair' }, fileBtn, fileInp),
      ta, report,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: Modal.close }, 'Cancel'), install)
    ));
  }
};
