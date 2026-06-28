/* AI GM — CloudStore (Firestore backend).
 *
 * Same async, document-shaped API as LocalStore in store.js, so the Store
 * façade can route a game here transparently.
 *
 * Two scopings, same code (the campaigns collection path is parameterized):
 *   - User-scoped (solo cloud games + the cloud library), made with `uid`:
 *       users/{uid}                              profile { name }
 *       users/{uid}/packs|characters/{id}        library
 *       users/{uid}/memberships/{gameId}         multiplayer games this user joined
 *       users/{uid}/campaigns/{cid}              META (+ checkpoint meta) + /{sub}/{id}
 *   - Shared (multiplayer), made with campaignsPath:['games']:
 *       games/{gameId}                           META (members[], hostUid, code…) + /{sub}/{id}
 *
 * Each transcript/wiki/scene is its own small document, so no document nears
 * the 1 MiB limit and a transcript can grow without bound. The shared scoping
 * also exposes watch() for live onSnapshot updates across players.
 */
window.makeCloudStore = function (ctx) {
  const db = ctx.db, fb = ctx.fb, uid = ctx.uid;
  const cpath = ctx.campaignsPath || ['users', uid, 'campaigns']; // path to the campaigns collection
  const tbase = uid ? ['users', uid] : null;                      // base for library/packs/profile
  const SUB = ['characters', 'sheetLog', 'scenes', 'transcript', 'wiki'];
  const BATCH_MAX = 450; // Firestore caps a writeBatch at 500 ops; stay safely under.
  const listeners = {};

  function emit(type, payload) {
    (listeners[type] || []).forEach(function (cb) { try { cb(payload); } catch (e) { console.error(e); } });
  }
  function newId() {
    const a = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(a).map(function (b) { return 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]; }).join('');
  }
  function strip(o) { return JSON.parse(JSON.stringify(o)); } // drop undefined / functions

  /* path helpers — driven by cpath (campaigns) and tbase (user library/profile) */
  function userDoc() { return fb.doc.apply(null, [db].concat(tbase)); }
  function campDoc(cid) { return fb.doc.apply(null, [db].concat(cpath, [cid])); }
  function subColl(cid, sub) { return fb.collection.apply(null, [db].concat(cpath, [cid, sub])); }
  function subDoc(cid, sub, id) { return fb.doc.apply(null, [db].concat(cpath, [cid, sub, id])); }
  function topColl(name) { return fb.collection.apply(null, [db].concat(tbase, [name])); }
  function topDoc(name, id) { return fb.doc.apply(null, [db].concat(tbase, [name, id])); }

  async function listColl(coll) {
    const snap = await fb.getDocs(coll);
    const out = [];
    snap.forEach(function (d) { out.push(d.data()); });
    return out;
  }
  /* delete every doc in a (sub)collection, chunked into batches */
  async function clearColl(coll) {
    const snap = await fb.getDocs(coll);
    const refs = [];
    snap.forEach(function (d) { refs.push(d.ref); });
    for (let i = 0; i < refs.length; i += BATCH_MAX) {
      const batch = fb.writeBatch(db);
      refs.slice(i, i + BATCH_MAX).forEach(function (r) { batch.delete(r); });
      await batch.commit();
    }
  }
  /* write an array of {id,...} docs into a collection, chunked */
  async function writeAll(collFn, items) {
    for (let i = 0; i < items.length; i += BATCH_MAX) {
      const batch = fb.writeBatch(db);
      items.slice(i, i + BATCH_MAX).forEach(function (it) { batch.set(collFn(it.id), strip(it)); });
      await batch.commit();
    }
  }

  return {
    init: function () { /* nothing to load; auth already resolved */ },
    newId: newId,
    on: function (type, cb) {
      (listeners[type] = listeners[type] || []).push(cb);
      return function () { const a = listeners[type]; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); };
    },

    /* profile */
    profile: function () { return null; }, // façade keeps the synchronous local profile
    setProfile: async function (p) { await fb.setDoc(userDoc(), { name: p.name }, { merge: true }); },
    uid: function () { return uid; },

    /* live updates: fire cb() whenever any part of a game changes. Used by the
     * play view for multiplayer (and cross-device) so other players' messages,
     * wiki edits, and scene changes appear without a manual refresh. */
    watch: function (cid, cb) {
      const onErr = function (e) { console.warn('[AI GM] watch error', e); };
      const unsubs = SUB.map(function (sub) { return fb.onSnapshot(subColl(cid, sub), function () { cb(); }, onErr); });
      unsubs.push(fb.onSnapshot(campDoc(cid), function () { cb(); }, onErr));
      return function () { unsubs.forEach(function (u) { try { u(); } catch (e) {} }); };
    },

    /* multiplayer memberships (user-scoped only): which shared games this user
     * has joined, so they resurface on every device they sign in on. */
    listJoinedGames: async function () { return tbase ? listColl(topColl('memberships')) : []; },
    addJoinedGame: async function (gameId) { if (tbase) await fb.setDoc(topDoc('memberships', gameId), { gameId: gameId, ts: Date.now() }); },
    removeJoinedGame: async function (gameId) { if (tbase) await fb.deleteDoc(topDoc('memberships', gameId)); },

    /* packs */
    listPacks: async function () { return listColl(topColl('packs')); },
    getPack: async function (id) { const s = await fb.getDoc(topDoc('packs', id)); return s.exists() ? s.data() : null; },
    savePack: async function (pack) {
      pack.id = pack.id || newId(); pack.ownerUid = pack.ownerUid || uid;
      await fb.setDoc(topDoc('packs', pack.id), strip(pack)); return pack.id;
    },
    deletePack: async function (id) { await fb.deleteDoc(topDoc('packs', id)); },

    /* campaigns (META doc only; subcollections handled separately) */
    listCampaigns: async function () {
      const list = await listColl(topColl('campaigns'));
      return list.sort(function (a, b) { return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0); });
    },
    getCampaign: async function (id) { const s = await fb.getDoc(campDoc(id)); return s.exists() ? s.data() : null; },
    saveCampaign: async function (m) {
      m.id = m.id || newId();
      const clean = strip(m);
      SUB.forEach(function (k) { delete clean[k]; }); // never fold subcollections into the meta doc
      await fb.setDoc(campDoc(m.id), clean, { merge: true });
      return m.id;
    },
    deleteCampaign: async function (id) {
      for (const sub of SUB) { await clearColl(subColl(id, sub)); await clearColl(subColl(id, 'cp_' + sub)); }
      await fb.deleteDoc(campDoc(id));
    },
    touch: async function (cid) { await fb.setDoc(campDoc(cid), { lastPlayedAt: Date.now() }, { merge: true }); },

    /* library characters */
    listLibChars: async function () { return listColl(topColl('characters')); },
    getLibChar: async function (id) { const s = await fb.getDoc(topDoc('characters', id)); return s.exists() ? s.data() : null; },
    saveLibChar: async function (ch) {
      ch.id = ch.id || newId(); ch.ownerUid = ch.ownerUid || uid; ch.createdAt = ch.createdAt || Date.now();
      await fb.setDoc(topDoc('characters', ch.id), strip(ch)); return ch.id;
    },
    deleteLibChar: async function (id) { await fb.deleteDoc(topDoc('characters', id)); },
    storiesForChar: async function (charId) {
      const list = await this.listCampaigns();
      return list.filter(function (c) { return c.characterId === charId; });
    },
    saveCharacterProgress: async function (cid) {
      const c = await this.getCampaign(cid);
      if (!c || !c.characterId) return null;
      const lib = await this.getLibChar(c.characterId);
      if (!lib) return null;
      const chars = await this.listCharacters(cid);
      const wiki = await this.listWiki(cid);
      const scenes = await this.listScenes(cid);
      const pc = chars.find(function (x) { return !x.isNPC; });
      const pcWiki = wiki.find(function (e) { return !e.mergedInto && e.type === 'pc'; });
      const recap = scenes.filter(function (s) { return s.status === 'closed' && s.summary; })
        .map(function (s) { return '— ' + (s.title || 'Scene') + ': ' + s.summary; }).join('\n');
      if (pc && pc.description) lib.description = pc.description;
      if (pcWiki && pcWiki.body) lib.condition = pcWiki.body;
      if (recap) lib.storySoFar = recap;
      lib.lastPlayedAt = Date.now(); lib.lastPlayedCampaignId = cid;
      await this.saveLibChar(lib);
      return lib;
    },

    /* characters */
    listCharacters: async function (cid) { return listColl(subColl(cid, 'characters')); },
    getCharacter: async function (cid, chid) { const s = await fb.getDoc(subDoc(cid, 'characters', chid)); return s.exists() ? s.data() : null; },
    saveCharacter: async function (cid, ch) {
      ch.id = ch.id || newId();
      await fb.setDoc(subDoc(cid, 'characters', ch.id), strip(ch));
      emit('sheet', { campaignId: cid, charId: ch.id }); return ch.id;
    },

    /* sheet log */
    addSheetEvent: async function (cid, ev) {
      ev.id = ev.id || newId(); ev.ts = ev.ts || Date.now();
      await fb.setDoc(subDoc(cid, 'sheetLog', ev.id), strip(ev));
      emit('sheet', { campaignId: cid, charId: ev.charId }); return ev.id;
    },
    listSheetEvents: async function (cid) {
      return (await listColl(subColl(cid, 'sheetLog'))).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    },
    updateSheetEvent: async function (cid, ev) { await fb.setDoc(subDoc(cid, 'sheetLog', ev.id), strip(ev)); },

    /* scenes */
    listScenes: async function (cid) {
      return (await listColl(subColl(cid, 'scenes'))).sort(function (a, b) { return (a.startedAt || 0) - (b.startedAt || 0); });
    },
    getScene: async function (cid, sid) { const s = await fb.getDoc(subDoc(cid, 'scenes', sid)); return s.exists() ? s.data() : null; },
    saveScene: async function (cid, sc) {
      sc.id = sc.id || newId();
      await fb.setDoc(subDoc(cid, 'scenes', sc.id), strip(sc));
      emit('scenes', { campaignId: cid }); return sc.id;
    },

    /* transcript */
    listMessages: async function (cid) {
      return (await listColl(subColl(cid, 'transcript'))).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    },
    addMessage: async function (cid, msg) {
      msg.id = msg.id || newId(); msg.ts = msg.ts || Date.now();
      await fb.setDoc(subDoc(cid, 'transcript', msg.id), strip(msg));
      emit('transcript', { campaignId: cid, msgId: msg.id }); return msg.id;
    },
    updateMessage: async function (cid, msg) {
      await fb.setDoc(subDoc(cid, 'transcript', msg.id), strip(msg));
      emit('transcript', { campaignId: cid, msgId: msg.id });
    },
    deleteMessage: async function (cid, msgId) {
      await fb.deleteDoc(subDoc(cid, 'transcript', msgId));
      emit('transcript', { campaignId: cid });
    },
    /* remove msgId and everything after it (ts-ordered) — redo a GM reply */
    truncateFrom: async function (cid, msgId) {
      const msgs = await this.listMessages(cid);
      const i = msgs.findIndex(function (m) { return m.id === msgId; });
      if (i < 0) return;
      const doomed = msgs.slice(i);
      for (let j = 0; j < doomed.length; j += BATCH_MAX) {
        const batch = fb.writeBatch(db);
        doomed.slice(j, j + BATCH_MAX).forEach(function (m) { batch.delete(subDoc(cid, 'transcript', m.id)); });
        await batch.commit();
      }
      emit('transcript', { campaignId: cid });
    },

    /* wiki */
    listWiki: async function (cid) { return listColl(subColl(cid, 'wiki')); },
    getWiki: async function (cid, eid) { const s = await fb.getDoc(subDoc(cid, 'wiki', eid)); return s.exists() ? s.data() : null; },
    saveWiki: async function (cid, entry) {
      entry.id = entry.id || newId(); entry.updatedAt = Date.now();
      await fb.setDoc(subDoc(cid, 'wiki', entry.id), strip(entry));
      emit('wiki', { campaignId: cid }); return entry.id;
    },

    /* checkpoints — mirror each live sub into cp_<sub>, meta on the campaign doc */
    saveCheckpoint: async function (cid, label) {
      const ts = Date.now();
      const scenes = await this.listScenes(cid);
      const c = await this.getCampaign(cid);
      const cur = c && c.currentSceneId;
      const sceneTitle = (scenes.find(function (s) { return s.id === cur; }) || {}).title || '';
      const msgs = await this.listMessages(cid);
      for (const sub of SUB) {
        await clearColl(subColl(cid, 'cp_' + sub));
        const items = await listColl(subColl(cid, sub));
        await writeAll(function (id) { return subDoc(cid, 'cp_' + sub, id); }, items);
      }
      await fb.setDoc(campDoc(cid), {
        checkpoint: { ts: ts, label: label || '', sceneTitle: sceneTitle, messageCount: msgs.length, currentSceneId: cur || null }
      }, { merge: true });
      return { ts: ts };
    },
    getCheckpoint: async function (cid) {
      const c = await this.getCampaign(cid);
      const cp = c && c.checkpoint;
      if (!cp) return null;
      return { ts: cp.ts, label: cp.label, sceneTitle: cp.sceneTitle, messageCount: cp.messageCount };
    },
    restoreCheckpoint: async function (cid) {
      const c = await this.getCampaign(cid);
      const cp = c && c.checkpoint;
      if (!cp) return false;
      for (const sub of SUB) {
        await clearColl(subColl(cid, sub));
        const items = await listColl(subColl(cid, 'cp_' + sub));
        await writeAll(function (id) { return subDoc(cid, sub, id); }, items);
      }
      await fb.setDoc(campDoc(cid), { currentSceneId: cp.currentSceneId || null }, { merge: true });
      emit('transcript', { campaignId: cid }); emit('scenes', { campaignId: cid });
      emit('wiki', { campaignId: cid }); emit('sheet', { campaignId: cid });
      return true;
    },
    clearCheckpoint: async function (cid) {
      for (const sub of SUB) await clearColl(subColl(cid, 'cp_' + sub));
      await fb.setDoc(campDoc(cid), { checkpoint: null }, { merge: true });
    },

    /* whole-account export not offered for cloud; per-game Move handles transfer */
    exportAll: function () { throw new Error('Cloud export is per-game (use Move), not whole-account.'); },
    importAll: function () { throw new Error('Cloud import is per-game (use Move), not whole-account.'); }
  };
};
