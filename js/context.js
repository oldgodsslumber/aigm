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

  /* Shared between the play protocol and the wiki-intake prompt so the two
   * can't drift. Per-type triggers are deliberately low-threshold. */
  const WIKI_TYPE_GUIDE = [
    '- pc — the player character; keep a single entry with their current condition, injuries, inventory, resources, location, and key relationships.',
    '- npc — EVERY named or distinctly described person, even a one-line bartender or a guard. Give nameless figures a descriptive handle (e.g. "the scarred dockmaster").',
    '- location — every distinct place: a town, a tavern, a room, a road, a region.',
    '- faction — every organization, crew, family, cult, guild, or government.',
    '- item — every named, magical, plot-relevant, or otherwise significant object.',
    '- event — every meaningful development, deal, betrayal, death, promise, deadline, or unresolved thread.'
  ];
  const WIKI_BLOCK_SPEC = [
    '```gm-wiki',
    '{"type": "pc|npc|location|faction|item|event", "name": "<canonical name>", "aliases": ["<other names>"], "tags": ["<topic>"], "body": "<2-5 sentences of durable facts>"}',
    '```'
  ];

  function protocolPrompt(opts) {
    return [
      'You are the Game Master running a solo tabletop RPG session for one player. Narrate in second person, present tense. Play all NPCs. Keep replies vivid but tight — usually 80 to 250 words — and end on something the player can act on. Never narrate the player character\'s decisions, dialogue, or feelings for them.',
      '',
      'OUTCOMES — There are NO dice and NO character sheet in this game. The player narrates the outcomes of their own actions, including whether they succeed or fail. Treat whatever the player states as what actually happened: never roll, never decide success or failure for them, and never contradict an outcome they have stated. If the player attempts something genuinely uncertain without saying how it turns out, ask them whether it succeeds rather than deciding for them. Routine, low-stakes actions simply happen — narrate them and move on.',
      '',
      'You interact with the game app through fenced blocks embedded in your replies. The app parses them and renders real UI. Use them exactly as specified — valid JSON, one object per block.',
      '',
      'WIKI — this is your memory and the ONLY place game state is tracked, so record aggressively. The default is to CREATE an entry, not to skip one. The moment something is introduced or named in play — by you or the player — write it down in the SAME reply, before you move on. When in doubt, record it; a thin entry you flesh out later is far better than a forgotten detail. Emit as many gm-wiki blocks in one reply as there are things to capture (one block each). Record:'
    ].concat(WIKI_TYPE_GUIDE).concat([
      'Then keep them current: when a fact changes, update the existing entry (same name) rather than creating a duplicate. Auto-creates an entry; updates if the name already exists:'
    ]).concat(WIKI_BLOCK_SPEC).concat([
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
    ]).join('\n');
  }

  /* System prompt for the Wiki tab's "Add world info" box. The player pastes
   * freeform worldbuilding notes; the model files them into wiki entries with
   * NO narration and NO plot — output is gm-wiki blocks only. */
  function wikiIntakePrompt(opts) {
    opts = opts || {};
    let lines = [
      'You are a worldbuilding archivist for a tabletop RPG campaign. The player has pasted notes about their world. This is NOT a scene and does NOT advance any plot — do NOT narrate, do NOT tell a story, do NOT address the player, and do NOT add any commentary.',
      '',
      'Your ONLY job is to file the facts in the notes into wiki entries. Output ONLY gm-wiki fenced blocks — one block per distinct entity — and nothing else (no prose before, between, or after the blocks). Be thorough and aggressive: capture every person, place, organization, significant item, and event the notes describe. Keep distinct things in separate entries; never lump several entities into one. Put each fact in the body of the entity it belongs to.',
      'Entry types to use:'
    ].concat(WIKI_TYPE_GUIDE).concat([
      'Use this block format exactly (valid JSON, one object per block):'
    ]).concat(WIKI_BLOCK_SPEC);

    const world = [];
    if (opts.genres && opts.genres.length) world.push('GENRE(S): ' + opts.genres.join(', '));
    if (opts.setting && String(opts.setting).trim()) world.push('SETTING: ' + String(opts.setting).trim());
    if (world.length) lines = lines.concat(['', 'World context (for tone and naming):', world.join('\n')]);

    if (opts.existingNames && opts.existingNames.length) {
      lines = lines.concat(['',
        'These entries already exist — REUSE the exact same name when the notes refer to them so they update instead of duplicating:',
        opts.existingNames.map(function (n) { return '- ' + n; }).join('\n')]);
    }
    return lines.join('\n');
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

    /* world — genre(s) + setting. Always included (high priority); grounds
     * tone and place for every scene. */
    const worldLines = [];
    if (opts.genres && opts.genres.length) worldLines.push('GENRE(S): ' + opts.genres.join(', '));
    if (opts.setting && String(opts.setting).trim()) worldLines.push('SETTING: ' + String(opts.setting).trim());
    if (worldLines.length) {
      const world = 'WORLD (the kind of story and where it takes place — ground every scene in this):\n' + worldLines.join('\n');
      parts.push(world);
      used += est(world);
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

  return { assemble: assemble, protocolPrompt: protocolPrompt, wikiIntakePrompt: wikiIntakePrompt, est: est };
})();
