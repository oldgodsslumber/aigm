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

  /* ---- read-aloud (text-to-speech) — device-local, saved on change ---- */
  /* provider: device (Web Speech) or ElevenLabs (cloud). */
  const providerSel = h('select', null,
    h('option', { value: 'device' }, 'Device voices (free, on-device)'),
    h('option', { value: 'elevenlabs' }, 'ElevenLabs (cloud, your own API key)'),
    h('option', { value: 'alltalk' }, 'AllTalk (local TTS server)'));
  providerSel.value = Speech.getProvider();
  providerSel.addEventListener('change', function () { Speech.setProvider(providerSel.value); syncProvider(); });

  /* speed — shared by both providers (device rate / ElevenLabs playbackRate) */
  const ttsRate = h('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(Speech.getRate()) });
  const ttsRateVal = h('span', { class: 'range-val' }, Speech.getRate() + '×');
  ttsRate.addEventListener('input', function () { ttsRateVal.textContent = ttsRate.value + '×'; });
  ttsRate.addEventListener('change', function () { Speech.setRate(Number(ttsRate.value)); });

  /* device voices */
  const voiceSel = h('select', null);
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

  const deviceNote = Speech.supported()
    ? 'The list shows whatever voices this device exposes to the browser. On iPhone, Siri and most “premium” voices are unavailable to web apps (an Apple limitation): Settings → Accessibility → Spoken Content → Voices → English → download a voice, then reopen the tab. Android and desktop Chrome usually list many more.'
    : 'This browser does not expose on-device text-to-speech. Switch the provider to ElevenLabs above, or try Chrome/Safari.';
  const deviceBlock = h('div', { class: 'settings-sub' },
    row('Voice', voiceSel),
    h('p', { class: 'sf-hint' }, deviceNote));

  /* ElevenLabs */
  const elevenKey = h('input', { type: 'password', value: Speech.getElevenKey(), placeholder: 'sk_…', autocomplete: 'off' });
  const elevenShow = h('button', { class: 'btn small', type: 'button' }, 'Show');
  elevenShow.addEventListener('click', function () {
    const is = elevenKey.type === 'password';
    elevenKey.type = is ? 'text' : 'password';
    elevenShow.textContent = is ? 'Hide' : 'Show';
  });
  elevenKey.addEventListener('change', function () { Speech.setElevenKey(elevenKey.value.trim()); });

  const elevenVoiceSel = h('select', null);
  elevenVoiceSel.addEventListener('change', function () { Speech.setElevenVoice(elevenVoiceSel.value); });
  const elevenLoad = h('button', { class: 'btn small', type: 'button' }, 'Load voices');

  function populateEleven(list) {
    const cur = Speech.getElevenVoice();
    elevenVoiceSel.innerHTML = '';
    if (!list || !list.length) {
      elevenVoiceSel.append(h('option', { value: cur || '' }, cur ? 'Saved voice' : '(load voices with your key)'));
      elevenVoiceSel.value = cur || '';
      return;
    }
    if (cur && !list.some(function (v) { return v.id === cur; })) {
      elevenVoiceSel.append(h('option', { value: cur }, 'Saved voice'));
    }
    list.forEach(function (v) { elevenVoiceSel.append(h('option', { value: v.id }, v.name)); });
    if (!cur) Speech.setElevenVoice(list[0].id);
    elevenVoiceSel.value = Speech.getElevenVoice() || list[0].id;
  }
  function loadEleven() {
    const key = elevenKey.value.trim();
    Speech.setElevenKey(key);
    if (!key) { Toast('Enter your ElevenLabs API key first.'); return; }
    elevenLoad.disabled = true; elevenLoad.textContent = 'Loading…';
    Speech.elevenVoices(key, function (list) {
      elevenLoad.disabled = false; elevenLoad.textContent = 'Load voices';
      if (!list) { Toast('Could not load voices — check the API key.'); return; }
      populateEleven(list);
      Toast(list.length + ' voices loaded.');
    });
  }
  elevenLoad.addEventListener('click', loadEleven);
  populateEleven(null);
  if (Speech.getElevenKey()) loadEleven();   // refresh on open when a key is saved

  const elevenBlock = h('div', { class: 'settings-sub' },
    row('API key', h('div', { class: 'inline-pair' }, elevenKey, elevenShow)),
    row('Voice', h('div', { class: 'inline-pair' }, elevenVoiceSel, elevenLoad)),
    h('p', { class: 'sf-hint' }, 'Get a key at elevenlabs.com → Profile → API Keys. It is stored only in this browser and sent directly to ElevenLabs. Cloud TTS uses your ElevenLabs character quota each time the GM reads aloud — mind it in Drive mode’s auto-read.'));

  /* AllTalk — a local TTS server */
  const alltalkUrl = h('input', { type: 'text', value: Speech.getAlltalkUrl(), placeholder: 'http://127.0.0.1:7851' });
  alltalkUrl.addEventListener('change', function () { Speech.setAlltalkUrl(alltalkUrl.value.trim()); });
  const alltalkVoiceSel = h('select', null);
  alltalkVoiceSel.addEventListener('change', function () { Speech.setAlltalkVoice(alltalkVoiceSel.value); });
  const alltalkLoad = h('button', { class: 'btn small', type: 'button' }, 'Load voices');

  function populateAlltalk(list) {
    const cur = Speech.getAlltalkVoice();
    alltalkVoiceSel.innerHTML = '';
    if (!list || !list.length) {
      alltalkVoiceSel.append(h('option', { value: cur || '' }, cur ? cur : '(load voices from the server)'));
      alltalkVoiceSel.value = cur || '';
      return;
    }
    if (cur && !list.some(function (v) { return v.id === cur; })) {
      alltalkVoiceSel.append(h('option', { value: cur }, cur + ' (saved)'));
    }
    list.forEach(function (v) { alltalkVoiceSel.append(h('option', { value: v.id }, v.name)); });
    if (!cur) Speech.setAlltalkVoice(list[0].id);
    alltalkVoiceSel.value = Speech.getAlltalkVoice() || list[0].id;
  }
  function loadAlltalk() {
    const url = alltalkUrl.value.trim();
    Speech.setAlltalkUrl(url);
    if (!url) { Toast('Enter the AllTalk server URL first.'); return; }
    alltalkLoad.disabled = true; alltalkLoad.textContent = 'Loading…';
    Speech.alltalkVoices(url, function (list) {
      alltalkLoad.disabled = false; alltalkLoad.textContent = 'Load voices';
      if (!list) { Toast('Could not reach AllTalk — is the server running at that URL?'); return; }
      populateAlltalk(list);
      Toast(list.length + ' voices loaded.');
    });
  }
  alltalkLoad.addEventListener('click', loadAlltalk);
  populateAlltalk(null);

  const alltalkBlock = h('div', { class: 'settings-sub' },
    row('Server URL', alltalkUrl),
    row('Voice', h('div', { class: 'inline-pair' }, alltalkVoiceSel, alltalkLoad)),
    h('p', { class: 'sf-hint' }, 'Point this at a running AllTalk TTS server (its default is http://127.0.0.1:7851). Click Load voices to list the server’s voices. AllTalk runs on your own machine, so this only works on a device that can reach that URL — and a browser may block a local http:// server from an https:// page (open the app over http/localhost, or allow insecure content for this site).'));

  function syncProvider() {
    const p = providerSel.value;
    deviceBlock.style.display = p === 'device' ? '' : 'none';
    elevenBlock.style.display = p === 'elevenlabs' ? '' : 'none';
    alltalkBlock.style.display = p === 'alltalk' ? '' : 'none';
  }

  const testBtn = h('button', { class: 'btn small', type: 'button' }, '🔊 Test voice');
  testBtn.addEventListener('click', function () {
    Speech.setVoiceURI(voiceSel.value);
    Speech.setElevenVoice(elevenVoiceSel.value);
    Speech.setAlltalkVoice(alltalkVoiceSel.value);
    Speech.setRate(Number(ttsRate.value));
    const ok = Speech.speak('This is how the Game Master will sound when reading your story aloud.', {});
    if (!ok) Toast(providerSel.value === 'elevenlabs'
      ? 'Add your ElevenLabs API key and pick a voice first.'
      : providerSel.value === 'alltalk'
        ? 'Enter your AllTalk server URL first.'
        : 'Text-to-speech isn\'t available in this browser.');
  });

  const ttsCard = h('section', { class: 'settings-card' },
    h('h2', null, 'Read-aloud voice'),
    h('p', { class: 'card-sub' }, 'Voice for the 🔊 Read button in Play. Changes save automatically.'),
    row('Provider', providerSel),
    deviceBlock, elevenBlock, alltalkBlock,
    row('Speed', h('div', { class: 'inline-pair' }, ttsRate, ttsRateVal)),
    h('div', { class: 'inline-pair' }, testBtn));
  syncProvider();

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
