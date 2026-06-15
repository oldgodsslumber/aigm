/* AI GM — deterministic context assembly (the "RAG").
 * System-agnostic: no rules pack, no dice, no character sheet. The player
 * narrates their own outcomes (including success/failure); the GM tracks the
 * story through the wiki and scene summaries.
 * Priority order, against a token budget (chars/4 estimate):
 *   1. protocol instructions (+ optional player rules notes)  (always)
 *   2. character bio                                           (always)
 *   3. prior scene summaries                     (oldest truncate first)
 *   4. wiki entries pinned to the current scene
 *   5. wiki entries name/alias-matched in recent turns
 *   6. last N raw transcript turns               (N shrinks to fit)
 * No embeddings; the LLM covers gaps via gm-lookup. */
const Context = (function () {

  function est(s) { return Math.ceil(String(s || '').length / 4); }

  function protocolPrompt(opts) {
    return [
      'You are the Game Master running a solo tabletop RPG session for one player. Narrate in second person, present tense. Play all NPCs. Keep replies vivid but tight — usually 80 to 250 words — and end on something the player can act on. Never narrate the player character\'s decisions, dialogue, or feelings for them.',
      '',
      'OUTCOMES — There are NO dice and NO character sheet in this game. The player narrates the outcomes of their own actions, including whether they succeed or fail. Treat whatever the player states as what actually happened: never roll, never decide success or failure for them, and never contradict an outcome they have stated. If the player attempts something genuinely uncertain without saying how it turns out, ask them whether it succeeds rather than deciding for them. Routine, low-stakes actions simply happen — narrate them and move on.',
      '',
      'You interact with the game app through fenced blocks embedded in your replies. The app parses them and renders real UI. Use them exactly as specified — valid JSON, one object per block.',
      '',
      'WIKI — this is your memory and the only place state is tracked, so keep it current. When a notable NPC, location, faction, item, or event is established in play, record it. Also maintain the player character: when their condition, injuries, inventory, resources, or key relationships change, record or update it (use a "pc" entry for the player character). Auto-creates an entry; updates if the name already exists:',
      '```gm-wiki',
      '{"type": "pc|npc|location|faction|item|event", "name": "<canonical name>", "aliases": ["<other names>"], "tags": ["<topic>"], "body": "<2-5 sentences of durable facts>"}',
      '```',
      '',
      'LOOKUP — use ONLY when you genuinely need a specific established fact that is NOT already in your context. The relevant wiki entries and recent turns are already provided above, so most of the time you already have what you need. Do NOT look things up speculatively, do NOT look up something already shown above, and do NOT look up a brand-new detail you can simply invent now and record with gm-wiki. A lookup can cost the player an extra, limited request — so prefer to proceed with what you have, and never emit a lookup in the same reply as a full narration.',
      '```gm-lookup',
      '{"query": "<name or tag>"}',
      '```',
      'Matching entries come back in the next message.',
      '',
      'SCENE SUMMARY — ONLY when the player ends a scene you will be asked for a summary. Reply then with exactly one block and nothing else:',
      '```gm-scene',
      '{"title": "<3-6 word scene title>", "summary": "<5-10 sentences: what happened, decisions made, consequences pending, NPC status>"}',
      '```',
      '',
      'Honor established wiki facts and scene summaries as canon. Honor any player-provided rules notes and tone/boundaries below as hard constraints.'
    ].join('\n');
  }

  function matchWiki(entries, recentText) {
    const text = recentText.toLowerCase();
    return entries.filter(function (e) {
      if (e.mergedInto) return false;
      const names = [e.name].concat(e.aliases || []);
      return names.some(function (n) {
        return n && n.length > 2 && text.indexOf(n.toLowerCase()) >= 0;
      });
    });
  }

  function entryText(e) {
    return '[' + e.type + '] ' + e.name +
      (e.aliases && e.aliases.length ? ' (aka ' + e.aliases.join(', ') + ')' : '') + ': ' + e.body;
  }

  function toLLMRole(msg) {
    if (msg.role === 'gm') return 'assistant';
    return 'user'; /* player, roll-result, info, lookup-result */
  }

  /* opts: {character, scenes, currentSceneId, wiki, premise, boundaries,
   *        rulesNotes, messages, budget}
   * Returns {system, messages, stats} */
  function assemble(opts) {
    const budget = opts.budget || 16000;
    const parts = [];
    const protocol = protocolPrompt(opts);
    parts.push(protocol);
    let used = est(protocol);

    /* optional player-provided rules / mechanics notes (bring-your-own-rules) */
    if (opts.rulesNotes && String(opts.rulesNotes).trim()) {
      const rules = 'RULES & MECHANICS NOTES (player-provided — treat as hard constraints):\n' + String(opts.rulesNotes).trim();
      parts.push(rules);
      used += est(rules);
    }

    /* character bio — who the player is, in their own words */
    const bioText = opts.character && opts.character.description && String(opts.character.description).trim();
    if (bioText) {
      const bio = 'WHO THIS CHARACTER IS (the player\'s own words):\n' + bioText;
      parts.push(bio);
      used += est(bio);
    }

    /* 2a. story setup — premise + boundaries the player defined for THIS
     * campaign. Always included (high priority); boundaries are hard limits
     * that override the default genre tone. */
    const setupLines = [];
    if (opts.premise && String(opts.premise).trim()) {
      setupLines.push('PREMISE / STARTING SITUATION (the player set this up — build the story from it):\n' + String(opts.premise).trim());
    }
    if (opts.boundaries && String(opts.boundaries).trim()) {
      setupLines.push('TONE & BOUNDARIES (HARD CONSTRAINTS — always obey; these override any genre convention):\n' + String(opts.boundaries).trim());
    }
    if (setupLines.length) {
      const setup = setupLines.join('\n\n');
      parts.push(setup);
      used += est(setup);
    }

    /* reserve space for transcript */
    const reserve = Math.min(Math.floor(budget * 0.35), 6000);
    let room = budget - used - reserve;

    /* 3. scene summaries, newest kept first when truncating */
    const closed = (opts.scenes || []).filter(function (s) { return s.status === 'closed' && s.summary; });
    const kept = [];
    for (let i = closed.length - 1; i >= 0; i--) {
      const line = '— ' + (closed[i].title || 'Scene') + ': ' + closed[i].summary;
      if (est(line) > room) break;
      kept.unshift(line); room -= est(line);
    }
    if (kept.length) {
      const txt = 'STORY SO FAR (scene summaries, oldest first' + (kept.length < closed.length ? '; earliest scenes omitted' : '') + ')\n' + kept.join('\n');
      parts.push(txt);
    }

    /* 4 + 5. wiki: pinned, then name-matched in recent turns */
    const wiki = (opts.wiki || []).filter(function (e) { return !e.mergedInto; });
    const scene = (opts.scenes || []).find(function (s) { return s.id === opts.currentSceneId; });
    const pinnedIds = (scene && scene.pinnedEntryIds) || [];
    const recent = (opts.messages || []).slice(-6).map(function (m) { return m.content; }).join('\n');
    const matched = matchWiki(wiki, recent);
    const seen = {};
    const wikiLines = [];
    pinnedIds.map(function (id) { return wiki.find(function (e) { return e.id === id; }); })
      .concat(matched)
      .forEach(function (e) {
        if (!e || seen[e.id]) return;
        seen[e.id] = true;
        const line = entryText(e);
        if (est(line) <= room) { wikiLines.push(line); room -= est(line); }
      });
    if (wikiLines.length) parts.push('CAMPAIGN WIKI (established canon)\n' + wikiLines.join('\n'));

    const system = parts.join('\n\n');
    used = est(system);

    /* 6. transcript turns, newest backwards into what's left */
    let msgRoom = budget - used;
    const msgs = [];
    const source = opts.messages || [];
    for (let i = source.length - 1; i >= 0; i--) {
      const m = source[i];
      if (m.role === 'divider') continue;
      const c = est(m.content) + 4;
      if (c > msgRoom && msgs.length >= 4) break;
      msgs.unshift({ role: toLLMRole(m), content: m.content });
      msgRoom -= c;
      if (msgs.length >= 60) break;
    }
    /* merge consecutive same-role messages (keeps both backends happy) */
    const merged = [];
    msgs.forEach(function (m) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content;
      else merged.push({ role: m.role, content: m.content });
    });

    return {
      system: system,
      messages: merged,
      stats: { systemTokens: est(system), msgCount: merged.length, budget: budget }
    };
  }

  return { assemble: assemble, protocolPrompt: protocolPrompt, est: est };
})();
