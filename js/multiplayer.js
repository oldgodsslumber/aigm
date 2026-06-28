/* AI GM — multiplayer orchestration (window.MP).
 *
 * Lobby lifecycle for shared games: host creates a game with a unique 4-digit
 * code, players join with that code (drop-in, capped at 6). The shared game
 * data itself flows through the Store façade's mp routing (games/{gameId});
 * this module only handles code allocation, membership, and game setup.
 *
 * Requires Firebase to be signed in (window.FirebaseCtx set by firebase-config).
 */
window.MP = (function () {
  const CAP = 6;
  const TURN_TTL = 120000; // a generation lock older than this is treated as abandoned (client crashed/left)

  function ctx() {
    const c = window.FirebaseCtx;
    if (!c) throw new Error('Sign in with Google first to play multiplayer.');
    return c;
  }
  function lobbyRef(c, code) { return c.fb.doc(c.db, 'lobbies', code); }
  function gameRef(c, gameId) { return c.fb.doc(c.db, 'games', gameId); }

  /* Claim an unused 4-digit code, pointing it at gameId, atomically. */
  async function reserveCode(c, gameId) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const ref = lobbyRef(c, code);
      const ok = await c.fb.runTransaction(c.db, async function (tx) {
        const snap = await tx.get(ref);
        if (snap.exists()) return false;
        tx.set(ref, { gameId: gameId, ts: Date.now() });
        return true;
      });
      if (ok) return code;
    }
    throw new Error('Could not allocate a lobby code — please try again.');
  }

  /* Create the per-game player character from a resolved library character. */
  async function addPlayerChar(gameId, uid, libChar) {
    await Store.saveCharacter(gameId, {
      name: libChar.name, isNPC: false, ownerUid: uid, libCharId: libChar.id,
      description: libChar.description || '', createdAt: Date.now()
    });
    /* carry the character's known condition in as a pinned pc wiki entry */
    if (libChar.condition && libChar.condition.trim()) {
      await Store.saveWiki(gameId, {
        type: 'pc', name: libChar.name, aliases: [], tags: [],
        body: libChar.condition.trim(), createdBy: 'player', mergedInto: null
      });
    }
  }

  return {
    cap: CAP,

    /* Host a new multiplayer game. opts: { name, format, genres, setting,
     * premise, boundaries, rulesNotes, libChar }. Returns { gameId, code }. */
    host: async function (opts) {
      const c = ctx();
      const uid = c.uid;
      const gameId = Store.newId();
      const code = await reserveCode(c, gameId);

      await Store.saveCampaign({
        id: gameId, _backend: 'mp',
        name: opts.name, hostUid: uid, members: [uid], code: code, status: 'open',
        format: opts.format || 'campaign', genres: opts.genres || [],
        setting: opts.setting || '', premise: opts.premise || '',
        boundaries: opts.boundaries || '', rulesNotes: opts.rulesNotes || '',
        settings: {}, currentSceneId: null, createdAt: Date.now()
      });
      await Store.addMembership(gameId);
      await addPlayerChar(gameId, uid, opts.libChar);

      const sceneId = await Store.saveScene(gameId, {
        title: 'Scene 1', summary: '', status: 'active', pinnedEntryIds: [], startedAt: Date.now()
      });
      const meta = await Store.getCampaign(gameId);
      meta.currentSceneId = sceneId;
      await Store.saveCampaign(meta);
      return { gameId: gameId, code: code };
    },

    /* Join an existing game by 4-digit code with a resolved library character.
     * Returns the gameId. */
    join: async function (code, libChar) {
      const c = ctx();
      const uid = c.uid;
      code = String(code || '').trim();
      if (!/^\d{4}$/.test(code)) throw new Error('Enter the 4-digit game code.');

      const lob = await c.fb.getDoc(lobbyRef(c, code));
      if (!lob.exists()) throw new Error('No game found with that code.');
      const gameId = lob.data().gameId;

      const alreadyMember = await c.fb.runTransaction(c.db, async function (tx) {
        const snap = await tx.get(gameRef(c, gameId));
        if (!snap.exists()) throw new Error('That game no longer exists.');
        const g = snap.data();
        if (Array.isArray(g.members) && g.members.indexOf(uid) >= 0) return true;
        if (g.status !== 'open') throw new Error('This lobby is closed to new players.');
        if ((g.members || []).length >= CAP) throw new Error('This game is full (' + CAP + ' players).');
        tx.update(gameRef(c, gameId), { members: c.fb.arrayUnion(uid) });
        return false;
      });

      await Store.addMembership(gameId);
      if (!alreadyMember) {
        await addPlayerChar(gameId, uid, libChar);
        /* drop a cue into the shared transcript so the GM works the newcomer
         * into the current scene and the table sees them arrive */
        try {
          const meta = await Store.getCampaign(gameId);
          await Store.addMessage(gameId, {
            role: 'info', sceneId: meta && meta.currentSceneId, authorUid: uid,
            content: 'SYSTEM: ' + libChar.name + ' has joined the party. Introduce them into the current scene when it fits.'
          });
        } catch (e) { console.warn('[AI GM] join announce failed', e); }
      }
      return gameId;
    },

    /* Host-only: lock or reopen the lobby to new joiners. */
    setStatus: async function (gameId, status) {
      const meta = await Store.getCampaign(gameId);
      meta.status = status;
      await Store.saveCampaign(meta);
    },

    /* Host-only: delete the whole game for everyone (and free its code). */
    deleteGame: async function (gameId) {
      const c = ctx();
      const meta = await Store.getCampaign(gameId);
      if (meta && meta.code) { try { await c.fb.deleteDoc(lobbyRef(c, meta.code)); } catch (e) {} }
      await Store.deleteCampaign(gameId);
      await Store.leaveGame(gameId);
    },

    /* Non-host: leave the game (remove yourself from members, forget it). */
    leave: async function (gameId) {
      const c = ctx();
      try {
        await c.fb.runTransaction(c.db, async function (tx) {
          const snap = await tx.get(gameRef(c, gameId));
          if (snap.exists()) tx.update(gameRef(c, gameId), { members: c.fb.arrayRemove(c.uid) });
        });
      } catch (e) { console.warn('[AI GM] leave update failed', e); }
      await Store.leaveGame(gameId);
    },

    isHost: function (meta) {
      return !!(meta && window.FirebaseCtx && meta.hostUid === window.FirebaseCtx.uid);
    },

    /* GM turn lock: only one player generates at a time so two simultaneous
     * actions can't produce conflicting narration. Returns { ok, holder }. */
    claimTurn: async function (gameId, name) {
      const c = ctx();
      return await c.fb.runTransaction(c.db, async function (tx) {
        const ref = gameRef(c, gameId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Game not found.');
        const gen = snap.data().generating;
        const now = Date.now();
        if (gen && gen.uid && gen.uid !== c.uid && gen.ts && (now - gen.ts) < TURN_TTL) {
          return { ok: false, holder: gen.name || 'another player' };
        }
        tx.update(ref, { generating: { uid: c.uid, name: name || 'A player', ts: now } });
        return { ok: true };
      });
    },
    /* Keep our lock fresh during a long turn so others don't reclaim it as stale.
     * No-op if we no longer hold it. */
    heartbeat: async function (gameId) {
      try {
        const c = ctx();
        await c.fb.runTransaction(c.db, async function (tx) {
          const ref = gameRef(c, gameId);
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const gen = snap.data().generating;
          if (gen && gen.uid === c.uid) tx.update(ref, { generating: { uid: c.uid, name: gen.name, ts: Date.now() } });
        });
      } catch (e) { /* best-effort */ }
    },
    /* Release the lock (only if we hold it). Best-effort. */
    releaseTurn: async function (gameId) {
      try {
        const c = ctx();
        await c.fb.runTransaction(c.db, async function (tx) {
          const ref = gameRef(c, gameId);
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const gen = snap.data().generating;
          if (!gen || gen.uid === c.uid) tx.update(ref, { generating: null });
        });
      } catch (e) { console.warn('[AI GM] releaseTurn failed', e); }
    },
    /* Who (if anyone) currently holds the lock, ignoring stale locks. Returns a
     * display name or null. */
    turnHolder: function (meta, myUid) {
      const gen = meta && meta.generating;
      if (gen && gen.uid && gen.uid !== myUid && gen.ts && (Date.now() - gen.ts) < TURN_TTL) {
        return gen.name || 'another player';
      }
      return null;
    },
    turnTtl: TURN_TTL
  };
})();
