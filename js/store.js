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
    if (!db || typeof db !== 'object') db = { profile: null, packs: {}, campaigns: {}, characters: {} };
    db.packs = db.packs || {};
    db.campaigns = db.campaigns || {};
    db.characters = db.characters || {};
    db.checkpoints = db.checkpoints || {};
    migrate();
  }

  /* One-time schema lift: characters used to live ONLY inside a campaign's
   * `characters` subcollection. Promote each campaign's player character into
   * the top-level library so it can be carried into new stories, leaving the
   * per-story copy in place and linking the two by id. NPCs are unaffected. */
  function migrate() {
    if (db.schemaVersion >= 1) return;
    Object.keys(db.campaigns).forEach(function (cid) {
      const c = db.campaigns[cid];
      if (!c.characters) return;
      const pc = Object.values(c.characters).find(function (x) { return !x.isNPC; });
      if (!pc || pc.libCharId || c.characterId) return;
      const libId = newId();
      db.characters[libId] = {
        id: libId, ownerUid: c.ownerUid || (db.profile && db.profile.uid) || null,
        name: pc.name, description: pc.description || '',
        condition: '', storySoFar: '',
        createdAt: pc.createdAt || c.createdAt || 0,
        lastPlayedAt: c.lastPlayedAt || 0, lastPlayedCampaignId: cid
      };
      pc.libCharId = libId;
      c.characterId = libId;
    });
    db.schemaVersion = 1;
    persist();
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
    /* Sync: id of the most-recently-opened campaign (touch() stamps lastPlayedAt
     * on every open). Used so the "Campaigns" nav can deep-link back into it. */
    lastCampaignId: function () {
      let best = null, bestT = -1;
      Object.keys(db.campaigns).forEach(function (id) {
        const c = db.campaigns[id];
        const t = c.lastPlayedAt || c.createdAt || 0;
        if (t > bestT) { bestT = t; best = id; }
      });
      return best;
    },
    saveCampaign: async function (m) {
      m.id = m.id || newId();
      const existing = db.campaigns[m.id] || { characters: {}, sheetLog: [], scenes: {}, transcript: [], wiki: {} };
      const merged = Object.assign({}, existing, clone(m));
      SUB.forEach(function (k) { merged[k] = existing[k]; });
      db.campaigns[m.id] = merged; persist();
      return m.id;
    },
    deleteCampaign: async function (id) { delete db.campaigns[id]; delete db.checkpoints[id]; persist(); },
    touch: async function (cid) { camp(cid).lastPlayedAt = Date.now(); persist(); },

    /* character library (top-level, portable across stories). Distinct from the
     * per-campaign `characters` subcollection, which holds each story's own
     * evolving copy of the PC plus its NPCs. */
    listLibChars: async function () {
      const uid = this.uid();
      return Object.values(db.characters)
        .filter(function (c) { return !uid || !c.ownerUid || c.ownerUid === uid; })
        .map(clone)
        .sort(function (a, b) { return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0); });
    },
    getLibChar: async function (id) { return clone(db.characters[id] || null); },
    saveLibChar: async function (ch) {
      ch.id = ch.id || newId();
      ch.ownerUid = ch.ownerUid || this.uid();
      ch.createdAt = ch.createdAt || Date.now();
      db.characters[ch.id] = clone(ch); persist();
      return ch.id;
    },
    deleteLibChar: async function (id) { delete db.characters[id]; persist(); },
    /* campaigns this library character appears in (newest played first) */
    storiesForChar: async function (charId) {
      return Object.values(db.campaigns).map(meta)
        .filter(function (c) { return c.characterId === charId; })
        .map(clone)
        .sort(function (a, b) { return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0); });
    },
    /* Snapshot the current story's PC state back onto the library character so
     * the next story can continue from it: latest bio, current condition (the
     * live pc wiki entry), and a "story so far" recap from closed scenes. */
    saveCharacterProgress: async function (cid) {
      const c = camp(cid);
      if (!c.characterId) return null;
      const lib = db.characters[c.characterId];
      if (!lib) return null;
      const pc = Object.values(c.characters).find(function (x) { return !x.isNPC; });
      const pcWiki = Object.values(c.wiki).find(function (e) { return !e.mergedInto && e.type === 'pc'; });
      const recap = Object.values(c.scenes)
        .sort(function (a, b) { return (a.startedAt || 0) - (b.startedAt || 0); })
        .filter(function (s) { return s.status === 'closed' && s.summary; })
        .map(function (s) { return '— ' + (s.title || 'Scene') + ': ' + s.summary; })
        .join('\n');
      if (pc && pc.description) lib.description = pc.description;
      if (pcWiki && pcWiki.body) lib.condition = pcWiki.body;
      if (recap) lib.storySoFar = recap;
      lib.lastPlayedAt = Date.now();
      lib.lastPlayedCampaignId = cid;
      persist();
      return clone(lib);
    },

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
    /* remove the message with msgId and everything after it (used to redo a
     * GM reply: rewind to the trigger, then re-run the turn) */
    truncateFrom: async function (cid, msgId) {
      const t = camp(cid).transcript;
      const i = t.findIndex(function (m) { return m.id === msgId; });
      if (i >= 0) { t.splice(i); persist(); emit('transcript', { campaignId: cid }); }
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

    /* save point (single slot per campaign) — a deep copy of the whole story
     * state so the player can roll back a risky move. Only one is kept; saving
     * again overwrites it. The portable character library and Settings are NOT
     * snapshotted on purpose — rolling back the story shouldn't touch them. */
    saveCheckpoint: async function (cid, label) {
      const c = camp(cid);
      db.checkpoints[cid] = {
        ts: Date.now(),
        label: label || '',
        sceneTitle: (c.scenes[c.currentSceneId] || {}).title || '',
        messageCount: (c.transcript || []).length,
        snapshot: {
          currentSceneId: c.currentSceneId,
          characters: clone(c.characters),
          sheetLog: clone(c.sheetLog),
          scenes: clone(c.scenes),
          transcript: clone(c.transcript),
          wiki: clone(c.wiki)
        }
      };
      persist();
      return { ts: db.checkpoints[cid].ts };
    },
    /* metadata only (never the heavy snapshot) so the UI can show/hide controls */
    getCheckpoint: async function (cid) {
      const cp = db.checkpoints[cid];
      if (!cp) return null;
      return { ts: cp.ts, label: cp.label, sceneTitle: cp.sceneTitle, messageCount: cp.messageCount };
    },
    restoreCheckpoint: async function (cid) {
      const cp = db.checkpoints[cid];
      if (!cp) return false;
      const c = camp(cid);
      const s = cp.snapshot;
      c.characters = clone(s.characters);
      c.sheetLog = clone(s.sheetLog);
      c.scenes = clone(s.scenes);
      c.transcript = clone(s.transcript);
      c.wiki = clone(s.wiki);
      c.currentSceneId = s.currentSceneId;
      persist();
      emit('transcript', { campaignId: cid });
      emit('scenes', { campaignId: cid });
      emit('wiki', { campaignId: cid });
      emit('sheet', { campaignId: cid });
      return true;
    },
    clearCheckpoint: async function (cid) { delete db.checkpoints[cid]; persist(); },

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
    temperature: 0.9
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
