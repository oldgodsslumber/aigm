/* AI GM — storage adapter.
 *
 * This is the localStorage implementation. The API is intentionally
 * Firestore-shaped: every method is async, documents carry ids, and
 * subcollections hang off a campaign id. To move to Firebase later,
 * reimplement this module against Firestore with the same signatures
 * (and wire Store.on(...) to onSnapshot for 'transcript' and 'sheet').
 *
 * Data model mirrors the spec:
 *   packs/{packId}
 *   campaigns/{id} + subcollections: characters, sheetLog, scenes, transcript, wiki
 */
const Store = (function () {
  const KEY = 'aigm:db';
  let db = null;
  const listeners = {};

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || typeof db !== 'object') db = { profile: null, packs: {}, campaigns: {} };
    db.packs = db.packs || {};
    db.campaigns = db.campaigns || {};
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(db)); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function newId() {
    const a = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(a).map(function (b) { return 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]; }).join('');
  }
  function camp(cid) {
    const c = db.campaigns[cid];
    if (!c) throw new Error('Campaign not found: ' + cid);
    return c;
  }
  function emit(type, payload) {
    (listeners[type] || []).forEach(function (cb) { try { cb(payload); } catch (e) { console.error(e); } });
  }
  const SUB = ['characters', 'sheetLog', 'scenes', 'transcript', 'wiki'];
  function meta(c) {
    const m = {};
    for (const k in c) if (SUB.indexOf(k) < 0) m[k] = c[k];
    return m;
  }

  return {
    init: function () { load(); },
    newId: newId,
    on: function (type, cb) {
      (listeners[type] = listeners[type] || []).push(cb);
      return function () { const a = listeners[type]; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); };
    },

    /* profile (stands in for Firebase Auth until wired) */
    profile: function () { return clone(db.profile); },
    setProfile: async function (p) { db.profile = { uid: (db.profile && db.profile.uid) || newId(), name: p.name }; persist(); },
    uid: function () { return db.profile ? db.profile.uid : null; },

    /* packs */
    listPacks: async function () { return clone(Object.values(db.packs)); },
    getPack: async function (id) { return clone(db.packs[id] || null); },
    savePack: async function (pack) {
      pack.id = pack.id || newId();
      pack.ownerUid = pack.ownerUid || this.uid();
      db.packs[pack.id] = clone(pack); persist();
      return pack.id;
    },
    deletePack: async function (id) { delete db.packs[id]; persist(); },

    /* campaigns */
    listCampaigns: async function () {
      return Object.values(db.campaigns).map(function (c) { return clone(meta(c)); })
        .sort(function (a, b) { return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0); });
    },
    getCampaign: async function (id) { return clone(meta(camp(id))); },
    saveCampaign: async function (m) {
      m.id = m.id || newId();
      const existing = db.campaigns[m.id] || { characters: {}, sheetLog: [], scenes: {}, transcript: [], wiki: {} };
      const merged = Object.assign({}, existing, clone(m));
      SUB.forEach(function (k) { merged[k] = existing[k]; });
      db.campaigns[m.id] = merged; persist();
      return m.id;
    },
    deleteCampaign: async function (id) { delete db.campaigns[id]; persist(); },
    touch: async function (cid) { camp(cid).lastPlayedAt = Date.now(); persist(); },

    /* characters */
    listCharacters: async function (cid) { return clone(Object.values(camp(cid).characters)); },
    getCharacter: async function (cid, chid) { return clone(camp(cid).characters[chid] || null); },
    saveCharacter: async function (cid, ch) {
      ch.id = ch.id || newId();
      camp(cid).characters[ch.id] = clone(ch); persist();
      emit('sheet', { campaignId: cid, charId: ch.id });
      return ch.id;
    },

    /* sheet log (append-only; undo flips a flag and appends a reverse event) */
    addSheetEvent: async function (cid, ev) {
      ev.id = ev.id || newId(); ev.ts = ev.ts || Date.now();
      camp(cid).sheetLog.push(clone(ev)); persist();
      emit('sheet', { campaignId: cid, charId: ev.charId });
      return ev.id;
    },
    listSheetEvents: async function (cid) { return clone(camp(cid).sheetLog); },
    updateSheetEvent: async function (cid, ev) {
      const log = camp(cid).sheetLog;
      const i = log.findIndex(function (e) { return e.id === ev.id; });
      if (i >= 0) { log[i] = clone(ev); persist(); }
    },

    /* scenes */
    listScenes: async function (cid) {
      return clone(Object.values(camp(cid).scenes)).sort(function (a, b) { return (a.startedAt || 0) - (b.startedAt || 0); });
    },
    getScene: async function (cid, sid) { return clone(camp(cid).scenes[sid] || null); },
    saveScene: async function (cid, sc) {
      sc.id = sc.id || newId();
      camp(cid).scenes[sc.id] = clone(sc); persist();
      emit('scenes', { campaignId: cid });
      return sc.id;
    },

    /* transcript */
    listMessages: async function (cid) { return clone(camp(cid).transcript); },
    addMessage: async function (cid, msg) {
      msg.id = msg.id || newId(); msg.ts = msg.ts || Date.now();
      camp(cid).transcript.push(clone(msg)); persist();
      emit('transcript', { campaignId: cid, msgId: msg.id });
      return msg.id;
    },
    updateMessage: async function (cid, msg) {
      const t = camp(cid).transcript;
      const i = t.findIndex(function (m) { return m.id === msg.id; });
      if (i >= 0) { t[i] = clone(msg); persist(); emit('transcript', { campaignId: cid, msgId: msg.id }); }
    },

    /* wiki */
    listWiki: async function (cid) { return clone(Object.values(camp(cid).wiki)); },
    getWiki: async function (cid, eid) { return clone(camp(cid).wiki[eid] || null); },
    saveWiki: async function (cid, entry) {
      entry.id = entry.id || newId(); entry.updatedAt = Date.now();
      camp(cid).wiki[entry.id] = clone(entry); persist();
      emit('wiki', { campaignId: cid });
      return entry.id;
    },

    /* backup */
    exportAll: function () { return JSON.stringify(db, null, 2); },
    importAll: function (json) {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || !parsed.campaigns) throw new Error('Not an AI GM backup file.');
      db = parsed; persist();
    }
  };
})();

/* Settings live OUTSIDE the synced DB on purpose: the Gemini key must
 * never travel to Firestore. localStorage only. */
const Settings = (function () {
  const KEY = 'aigm:settings';
  const DEFAULTS = {
    backend: 'gemini',            // 'gemini' | 'local'
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash',
    localUrl: 'http://localhost:5000/v1',
    localModel: '',
    tokenBudget: 0,               // 0 = auto (per backend)
    temperature: 0.9,
    manualDice: true,             // true = player rolls own dice & reports results; false = in-app dice widget
    layout: 'sheet-right'         // 'sheet-right' | 'sheet-left' | 'focus'
  };
  function read() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    return Object.assign({}, DEFAULTS, s);
  }
  return {
    get: read,
    set: function (patch) {
      const s = Object.assign(read(), patch);
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    },
    /* merge per-campaign overrides (campaign.settings) over globals */
    forCampaign: function (campaign) {
      const s = read();
      const o = (campaign && campaign.settings) || {};
      const merged = Object.assign({}, s, o);
      if (!merged.tokenBudget) merged.tokenBudget = merged.backend === 'local' ? 12000 : 32000;
      return merged;
    },
    budgetFor: function (s) { return s.tokenBudget || (s.backend === 'local' ? 12000 : 32000); }
  };
})();
