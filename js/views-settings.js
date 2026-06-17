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
  const gModelList = (LLM.models ? LLM.models() : []);
  const gModel = h('select', null, gModelList.map(function (m) {
    return h('option', { value: m.id }, m.label);
  }));
  /* keep any previously-stored value selectable (e.g. a custom id) instead of
   * silently losing it */
  if (s.geminiModel && !gModelList.some(function (m) { return m.id === s.geminiModel; })) {
    gModel.insertBefore(h('option', { value: s.geminiModel }, s.geminiModel + ' (current)'), gModel.firstChild);
  }
  gModel.value = s.geminiModel || 'gemini-2.5-flash';
  const lUrl = h('input', { type: 'text', value: s.localUrl, placeholder: 'http://localhost:5000/v1' });
  const lModel = h('input', { type: 'text', value: s.localModel, placeholder: '(optional — server default)' });

  const budget = h('input', { type: 'number', value: s.tokenBudget || '', placeholder: 'auto' });
  const temp = h('input', { type: 'range', min: '0', max: '1.5', step: '0.05', value: s.temperature });
  const tempVal = h('span', { class: 'range-val' }, String(s.temperature));
  temp.addEventListener('input', function () { tempVal.textContent = temp.value; });

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
      temperature: Number(temp.value)
    });
    Toast('Settings saved.');
  });

  /* ---- read-aloud (text-to-speech) voice — device-local, saved on change ---- */
  const voiceSel = h('select', null);
  const ttsRate = h('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(Speech.getRate()) });
  const ttsRateVal = h('span', { class: 'range-val' }, Speech.getRate() + '×');
  ttsRate.addEventListener('input', function () { ttsRateVal.textContent = ttsRate.value + '×'; });
  ttsRate.addEventListener('change', function () { Speech.setRate(Number(ttsRate.value)); });
  voiceSel.addEventListener('change', function () { Speech.setVoiceURI(voiceSel.value); });

  function populateVoices() {
    const vs = Speech.voices();
    const cur = Speech.getVoiceURI();
    voiceSel.innerHTML = '';
    voiceSel.append(h('option', { value: '' }, 'Device default'));
    const en = vs.filter(function (v) { return /^en/i.test(v.lang); });
    const other = vs.filter(function (v) { return !/^en/i.test(v.lang); });
    [['English', en], ['Other languages', other]].forEach(function (pair) {
      if (!pair[1].length) return;
      const og = h('optgroup', { label: pair[0] });
      pair[1].forEach(function (v) {
        og.append(h('option', { value: v.voiceURI }, v.name + ' (' + v.lang + ')' + (v.default ? ' — default' : '')));
      });
      voiceSel.append(og);
    });
    voiceSel.value = cur || '';
  }
  populateVoices();
  Speech.onVoices(populateVoices);

  const testBtn = h('button', { class: 'btn small', type: 'button' }, '🔊 Test voice');
  testBtn.addEventListener('click', function () {
    Speech.setVoiceURI(voiceSel.value);
    Speech.setRate(Number(ttsRate.value));
    const ok = Speech.speak('This is how the Game Master will sound when reading your story aloud.', {});
    if (!ok) Toast('Text-to-speech isn\'t available in this browser.');
  });

  const ttsCard = Speech.supported()
    ? h('section', { class: 'settings-card' },
        h('h2', null, 'Read-aloud voice'),
        h('p', { class: 'card-sub' }, 'Voice for the 🔊 Read button in Play. The list shows whatever voices this device exposes to the browser; changes save automatically.'),
        row('Voice', voiceSel),
        row('Speed', h('div', { class: 'inline-pair' }, ttsRate, ttsRateVal)),
        h('div', { class: 'inline-pair' }, testBtn),
        h('p', { class: 'sf-hint' }, 'On iPhone, Siri and most “premium” voices are not available to web apps — an Apple limitation, not a bug. To add what you can: Settings → Accessibility → Spoken Content → Voices → English → download a voice; any the browser exposes will show up here (you may need to reopen the tab). Android and desktop Chrome usually list many more, including higher-quality “Google”/“Natural” voices.'))
    : h('section', { class: 'settings-card' },
        h('h2', null, 'Read-aloud voice'),
        h('p', { class: 'card-sub' }, 'This browser does not expose text-to-speech, so read-aloud is unavailable here. Try Chrome or Safari.'));

  /* ---- drive mode — device-local, saved on toggle ---- */
  const driveToggle = h('input', { type: 'checkbox' });
  driveToggle.checked = DriveMode.enabled();
  driveToggle.addEventListener('change', function () {
    DriveMode.set(driveToggle.checked);
    Toast(driveToggle.checked ? 'Drive mode on — open a story to use it.' : 'Drive mode off.');
  });
  const driveSttNote = Listen.supported()
    ? 'On-screen voice-to-text is available in this browser — tap 🎤 Talk and speak.'
    : 'This browser has no built-in voice-to-text (e.g. iPhone Safari), so 🎤 Talk opens the keyboard instead — tap the keyboard’s microphone to dictate. Read-aloud still works.';
  const driveCard = h('section', { class: 'settings-card' },
    h('h2', null, 'Drive mode'),
    h('p', { class: 'card-sub' }, 'A hands-free, glanceable Play layout for the car: the transcript shrinks, and two big buttons sit at the bottom — 🎤 Talk dictates your move into the box, 🔊 Read replays the last reply aloud. New GM replies read themselves automatically.'),
    h('label', { class: 'form-row toggle-row' },
      h('span', null, 'Enable drive mode'), driveToggle),
    h('p', { class: 'sf-hint' }, driveSttNote),
    h('p', { class: 'sf-hint' }, 'Please keep your eyes on the road — set up voice and speed under Read-aloud voice above, and only glance at the screen when stopped.'));

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
      row('Temperature', h('div', { class: 'inline-pair' }, temp, tempVal))),
    campaigns.length ? h('section', { class: 'settings-card' },
      h('h2', null, 'Per-campaign backend'),
      h('p', { class: 'card-sub' }, 'Override the global backend for individual campaigns.'),
      overrides) : null,
    ttsCard,
    driveCard,
    h('section', { class: 'settings-card' },
      h('h2', null, 'Data'),
      h('p', { class: 'card-sub' }, 'Everything lives in this browser until Firebase is wired up. Export a backup before clearing site data.'),
      h('div', { class: 'inline-pair' }, exportBtn, importBtn, importInp)),
    h('div', { class: 'settings-save' }, save)
  ));
};
