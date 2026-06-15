/* AI GM — Settings view. The Gemini key lives in localStorage ONLY. */
window.Views = window.Views || {};

Views.settings = async function (root) {
  root.dataset.screenLabel = 'Settings';
  const s = Settings.get();
  const campaigns = await Store.listCampaigns();
  root.innerHTML = '';

  function row(labelText, control, hint) {
    return h('label', { class: 'form-row' },
      h('span', null, labelText), control,
      hint ? h('span', { class: 'sf-hint' }, hint) : null);
  }

  /* backend */
  const backendSel = h('select', null,
    h('option', { value: 'gemini' }, 'Gemini (your own API key)'),
    h('option', { value: 'local' }, 'Local — OpenAI-compatible endpoint'));
  backendSel.value = s.backend;

  const keyInp = h('input', { type: 'password', value: s.geminiKey, placeholder: 'AIza…', autocomplete: 'off' });
  const showKey = h('button', { class: 'btn small', type: 'button' }, 'Show');
  showKey.addEventListener('click', function () {
    const is = keyInp.type === 'password';
    keyInp.type = is ? 'text' : 'password';
    showKey.textContent = is ? 'Hide' : 'Show';
  });
  const gModel = h('input', { type: 'text', value: s.geminiModel });
  const lUrl = h('input', { type: 'text', value: s.localUrl, placeholder: 'http://localhost:5000/v1' });
  const lModel = h('input', { type: 'text', value: s.localModel, placeholder: '(optional — server default)' });

  const budget = h('input', { type: 'number', value: s.tokenBudget || '', placeholder: 'auto' });
  const diceChk = h('input', { type: 'checkbox' });
  diceChk.checked = s.manualDice !== false;
  const temp = h('input', { type: 'range', min: '0', max: '1.5', step: '0.05', value: s.temperature });
  const tempVal = h('span', { class: 'range-val' }, String(s.temperature));
  temp.addEventListener('input', function () { tempVal.textContent = temp.value; });

  const layoutSel = h('select', null,
    h('option', { value: 'sheet-right' }, 'Sheet on the right (classic)'),
    h('option', { value: 'sheet-left' }, 'Sheet on the left'),
    h('option', { value: 'focus' }, 'Focus — full-width reading, sheet as drawer'));
  layoutSel.value = s.layout;

  /* today's per-model request usage — a reminder of free-tier spend */
  const usage = (LLM.geminiUsage && LLM.geminiUsage()) || [];
  const usageRows = usage.map(function (m) {
    return h('div', { class: 'usage-row' },
      h('span', null, m.label),
      h('span', { class: m.used >= m.limit ? 'usage-count exhausted' : 'usage-count' },
        m.used + ' / ' + m.limit));
  });
  const usageBox = usage.length ? h('div', { class: 'usage-box' },
    h('span', { class: 'sf-hint' }, 'Requests used today (resets at midnight). When a model is spent, the GM auto-switches to the next one.'),
    usageRows) : null;

  const geminiFields = h('div', { class: 'settings-sub' },
    row('Gemini API key', h('div', { class: 'inline-pair' }, keyInp, showKey),
      'Stored in this browser only — never synced, never sent anywhere but Google.'),
    row('Model', gModel, 'Starts here, then auto-falls through 2.5 Flash → Flash Lite → Gemma 4 as daily limits are hit.'),
    usageBox);
  const localFields = h('div', { class: 'settings-sub' },
    row('Base URL', lUrl, 'OpenAI-compatible. Backend must allow CORS for this page\'s origin. Chrome only.'),
    row('Model name', lModel));
  function syncBackend() {
    geminiFields.style.display = backendSel.value === 'gemini' ? '' : 'none';
    localFields.style.display = backendSel.value === 'local' ? '' : 'none';
  }
  backendSel.addEventListener('change', syncBackend);
  syncBackend();

  /* per-campaign backend overrides */
  const overrides = h('div');
  campaigns.forEach(function (c) {
    const sel = h('select', null,
      h('option', { value: '' }, 'Use global'),
      h('option', { value: 'gemini' }, 'Gemini'),
      h('option', { value: 'local' }, 'Local'));
    sel.value = (c.settings && c.settings.backend) || '';
    sel.addEventListener('change', async function () {
      const full = await Store.getCampaign(c.id);
      full.settings = full.settings || {};
      if (sel.value) full.settings.backend = sel.value; else delete full.settings.backend;
      await Store.saveCampaign(full);
      Toast('Saved.');
    });
    overrides.append(row(c.name, sel));
  });

  const save = h('button', { class: 'btn accent' }, 'Save settings');
  save.addEventListener('click', function () {
    Settings.set({
      backend: backendSel.value,
      geminiKey: keyInp.value.trim(),
      geminiModel: gModel.value.trim() || 'gemini-2.5-flash',
      localUrl: lUrl.value.trim() || 'http://localhost:5000/v1',
      localModel: lModel.value.trim(),
      tokenBudget: Number(budget.value) || 0,
      temperature: Number(temp.value),
      manualDice: diceChk.checked,
      layout: layoutSel.value
    });
    Toast('Settings saved.');
  });

  /* backup */
  const exportBtn = h('button', { class: 'btn' }, 'Export data');
  exportBtn.addEventListener('click', function () {
    const blob = new Blob([Store.exportAll()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'ai-gm-backup.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const importInp = h('input', { type: 'file', accept: '.json', style: 'display:none' });
  const importBtn = h('button', { class: 'btn' }, 'Import data');
  importBtn.addEventListener('click', function () { importInp.click(); });
  importInp.addEventListener('change', async function () {
    const f = importInp.files[0];
    if (!f) return;
    try {
      Store.importAll(await f.text());
      Toast('Data imported.');
      location.hash = '#/campaigns';
    } catch (e) { Toast('Import failed: ' + e.message); }
  });

  root.append(h('div', { class: 'page narrow' },
    h('div', { class: 'page-head' }, h('h1', null, 'Settings')),
    h('section', { class: 'settings-card' },
      h('h2', null, 'Game Master backend'),
      row('Backend', backendSel),
      geminiFields, localFields,
      row('Token budget', budget, 'Leave empty for auto: ~12k for local models, ~32k for Gemini.'),
      row('Temperature', h('div', { class: 'inline-pair' }, temp, tempVal)),
      row('Dice', h('label', { class: 'inline-pair' }, diceChk, h('span', null, 'I roll my own dice and report results')),
        'On: the GM tells you what to roll and waits for you to type the result (for you and NPCs). Off: use the in-app dice widget.')),
    campaigns.length ? h('section', { class: 'settings-card' },
      h('h2', null, 'Per-campaign backend'),
      h('p', { class: 'card-sub' }, 'Override the global backend for individual campaigns.'),
      overrides) : null,
    h('section', { class: 'settings-card' },
      h('h2', null, 'Appearance'),
      row('Play View layout', layoutSel, 'You can also cycle layouts from the Play View header.')),
    h('section', { class: 'settings-card' },
      h('h2', null, 'Data'),
      h('p', { class: 'card-sub' }, 'Everything lives in this browser until Firebase is wired up. Export a backup before clearing site data.'),
      h('div', { class: 'inline-pair' }, exportBtn, importBtn, importInp)),
    h('div', { class: 'settings-save' }, save)
  ));
};
