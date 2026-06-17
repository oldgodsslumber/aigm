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

  /* The Wiki-tab batch generators (intake / topic / plan) ask for a strict JSON
   * array — far more reliable to parse than custom fences, and forceable via
   * Gemini JSON mode. Each object: type/name/aliases/tags/body (+ optional
   * hidden/secret for the plan). */
  const JSON_ARRAY_INSTRUCTION =
    'Respond with ONLY a JSON array of entry objects. No prose, no commentary, no markdown, no code fences — nothing before or after the array. ' +
    'Each object has exactly: {"type": "<one type from the list above>", "name": "<canonical name>", "aliases": ["<other names>"], "tags": ["<topic>"], "body": "<2-5 sentences of durable facts>"}. ' +
    'aliases and tags must be arrays (use [] if none). Example: [{"type":"npc","name":"Nick Fury","aliases":["Fury"],"tags":["S.H.I.E.L.D."],"body":"Director of S.H.I.E.L.D. ..."}]';

  /* Campaign format shapes the threat countdown's scale (used when designing a
   * plan) and the pacing the GM uses while advancing it during play. */
  const FORMAT_GUIDE = {
    oneshot: 'FORMAT — ONE-SHOT (a single session, like an action movie). Make the countdown TIGHT, FAST, and SELF-CONTAINED: all six steps escalate within one sitting and Nightfall is reachable by the end of a single session. Keep the cast and scope small and focused — one threat, one goal, no sprawling subplots.',
    multishot: 'FORMAT — MULTI-SHOT (a multi-session arc, like a TV season). Make the countdown span SEVERAL sessions: each of the six steps is a sizable component or phase that could anchor its own session/episode, building toward a season-finale Nightfall. Give the threat multiple moving parts (lieutenants, fronts, resources) so the plan can be revised between sessions as the players interfere.',
    campaign: 'FORMAT — CAMPAIGN (open-ended, like a long fantasy game). Make the countdown a SLOW-BURNING, looming background threat: the six steps advance gradually and are not too imposing, so there is plenty of room for side quests and freeform play between escalations. The threat is a distant storm cloud, not an immediate clock.'
  };
  const FORMAT_PACING = {
    oneshot: 'PACING — this is a ONE-SHOT (a single session): drive the threat\'s countdown briskly toward its conclusion within this session.',
    multishot: 'PACING — this is a MULTI-SESSION arc: advance the countdown a meaningful step or so per session, building toward a finale.',
    campaign: 'PACING — this is an OPEN CAMPAIGN: let the countdown loom in the background and advance slowly, leaving plenty of room for side quests and freeform play.'
  };

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
      'Add "hidden": true to a gm-wiki block when an ENTIRE entry is a secret the player must NOT learn yet (a hidden enemy, a place they haven\'t discovered). You still use hidden entries to drive the world, but never reveal them outright — only through what happens in the fiction.',
      'To attach a secret to an entry that stays publicly known, add a "secret" field on a gm-wiki block with that entry\'s EXACT name (do NOT set "hidden"). The public "body" stays visible to the player; the "secret" text is GM-only — use it to plant a twist about a known person, place, or item without spoiling their public page. Example: {"name": "Mayor Crane", "secret": "She secretly leads the cult and ordered the disappearances."}',
      '',
      'THE THREAT\'S PLAN — Some entries are marked GM-ONLY HIDDEN KNOWLEDGE: the player does not know them. If a hidden plan / countdown entry is present, treat it as a Monster of the Week-style countdown the threat works through as time passes — escalating toward its goal UNLESS the players disrupt it. Advance it at a believable pace, show its effects in the world, and never reveal the plan directly, only its consequences.',
      '',
      'Run the threat as a THINKING CHARACTER, not a script. The countdown is only their default plan if nothing stops them. Every choice they make should flow from who they ARE — their personality, goals, methods, resources, and the lines they will not cross (all in their hidden entries). When the players interfere, the threat REACTS in character: it adapts, retaliates, changes targets, accelerates, regroups, cuts its losses, or improvises — whatever THIS particular villain would actually do, for their own reasons. They can be surprised, feel real pressure, and make mistakes that fit them. Each time the players force the plan to change, revise it and record the new state with a hidden gm-wiki update so the world stays consistent.',
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
      'Your ONLY job is to file the facts in the notes into wiki entries. Be thorough: capture every person, place, organization, significant item, and event the notes describe. Keep distinct things in separate entries; never lump several entities into one. Put each fact in the body of the entity it belongs to.',
      'Entry types to use:'
    ].concat(WIKI_TYPE_GUIDE).concat([
      '',
      JSON_ARRAY_INSTRUCTION,
      'These are facts the player knows; do NOT set "hidden" or "secret".'
    ]);

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

  /* System prompt for the Wiki tab's "Generate from a topic" box. The player
   * names a setting/franchise; the model writes a starter set of wiki entries
   * from its knowledge (and, when grounded, live Google Search results). */
  function wikiTopicPrompt(opts) {
    opts = opts || {};
    let lines = [
      'You are a worldbuilding archivist for a tabletop RPG campaign. The player has named a setting, franchise, era, or topic. Generate a useful starter set of wiki entries about it. This is NOT a scene and does NOT advance any plot — do NOT narrate, address the player, or add any commentary.',
      '',
      (opts.grounded
        ? 'Use the Google Search results available to you to keep names and facts accurate and current. Record facts only — do NOT cite sources, list URLs, or mention that you searched.'
        : 'Draw on your knowledge of the topic. Prefer well-established, canonical facts; if you are unsure of a specific detail, keep the entry general rather than inventing specifics.'),
      '',
      'Cover the most important and iconic entities for the topic — aim for roughly 12 to 25 entries unless the player\'s request implies otherwise. Keep distinct things in separate entries. Entry types:'
    ].concat(WIKI_TYPE_GUIDE).concat([
      '',
      JSON_ARRAY_INSTRUCTION,
      'These are facts the player knows; do NOT set "hidden" or "secret".'
    ]);

    lines = lines.concat(['', 'TOPIC: ' + String(opts.topic || '').trim()]);

    const world = [];
    if (opts.genres && opts.genres.length) world.push('GENRE(S): ' + opts.genres.join(', '));
    if (opts.setting && String(opts.setting).trim()) world.push('SETTING: ' + String(opts.setting).trim());
    if (world.length) lines = lines.concat(['', 'Campaign world context (align tone/era where relevant):', world.join('\n')]);

    if (opts.existingNames && opts.existingNames.length) {
      lines = lines.concat(['', 'Already in the wiki — reuse the EXACT name to update instead of duplicating, and skip ones already well covered:',
        opts.existingNames.map(function (n) { return '- ' + n; }).join('\n')]);
    }
    return lines.join('\n');
  }

  /* System prompt for the Wiki tab's "Find duplicates" button. The model is
   * given a numbered list of existing entries and clusters the ones that are
   * the SAME entity (even under different names), proposing a clean merged
   * body built only from facts already present. Output: JSON clusters. */
  function wikiDedupePrompt() {
    return [
      'You are a worldbuilding archivist cleaning up a tabletop RPG wiki that has accumulated duplicate entries from separate note dumps. You are given a NUMBERED list of existing entries (index, type, name, aliases, body).',
      '',
      'Find sets of entries that describe the SAME real-world entity — the same person, place, faction, item, or event — even when their names differ (nicknames, titles, partial names, spelling variants) or the text came from different notes.',
      'Be CONSERVATIVE: only group entries you are confident are literally the same entity. Do NOT group things that are merely related or similar — a character and their weapon are not the same; two different guards are not the same; a city and a building inside it are not the same.',
      '',
      'For each duplicate set of TWO OR MORE entries, output one cluster object:',
      '{"members": [<indices>], "name": "<best canonical name>", "type": "<one type>", "body": "<merged body>"}',
      '- members: the index NUMBERS (from the list) of every entry in this set. A set must have at least two.',
      '- name: the clearest, most complete canonical name — usually the full proper name.',
      '- type: the correct single type for the merged entity (pc, npc, location, faction, item, or event).',
      '- body: ONE clean, coherent body that combines ONLY the facts already present across the listed entries, de-duplicated. Do NOT invent, embellish, guess, or add anything not in the originals.',
      '',
      'Output ONLY a JSON array of cluster objects — nothing before or after it, no prose, no markdown, no code fences. If there are no duplicates, output exactly [].'
    ].join('\n');
  }

  /* System prompt for the Wiki tab's "AI Plan" / "Update plan" buttons.
   * Designs a hidden, Monster of the Week-style threat plan: a 6-step
   * countdown plus supporting secrets, all filed as hidden wiki entries the
   * GM uses via RAG but the player never sees. Output is gm-wiki blocks only. */
  function planPrompt(opts) {
    opts = opts || {};
    let lines = [
      'You are the Keeper (GM) of a solo tabletop RPG, designing the hidden machinery behind the story — the kind of behind-the-screen plan a Monster of the Week Keeper prepares. This is NOT a scene and does NOT advance play. Do NOT narrate, do NOT address the player, do NOT add commentary.',
      '',
      'Design the central THREAT and its plan. ' + (opts.threat && String(opts.threat).trim()
        ? 'The player has specified the threat / goal — build around it: ' + String(opts.threat).trim()
        : 'Choose the most compelling antagonist or looming danger that fits the world and what has happened so far.'),
      '',
      (FORMAT_GUIDE[opts.format] || FORMAT_GUIDE.campaign),
      '',
      'Produce, as hidden wiki entries:',
      '1. ONE entry of type "plan" — the COUNTDOWN. Its body states the threat, what it ultimately wants (its doom/goal), and EXACTLY SIX escalating steps it takes if the players never interfere, labelled in order: Day, Shadows, Dawn, Dusk, Sunset, Nightfall. Each step is one concrete development; the later steps are worse; Nightfall is the threat fully achieving its goal. The players do not act in this plan — it is what unfolds unopposed. End the body with one line making clear these six steps are only the threat\'s DEFAULT path if no one stops them: when the players disrupt a step, the threat adapts in character — rerouting, retaliating, changing targets, or improvising — rather than continuing on rails, and the plan should be revised to fit.',
      '2. Several SUPPORTING entries — the threat itself and its key pieces (true nature, secret motive, hidden allies, secret locations or items). Use the appropriate types (npc, faction, location, item, event). Keep distinct things in separate entries. The MAIN threat entry must give the GM enough to play them as a thinking character, not a plot device: include their TEMPERAMENT and how they make decisions, the METHODS they favor (and what they resort to only when desperate), how they REACT to setbacks, and the LIMITS or lines they will not cross — including the weakness or blind spot a clever player could exploit.',
      '',
      'Keep all of this GM-ONLY. Two ways to do that, per object:',
      '- For things that are ENTIRELY secret (the threat itself, hidden allies, undiscovered places, and the countdown — use type "plan" for it), set "hidden": true on the object.',
      '- To plant a secret about something the player ALREADY knows, output an object with that entry\'s EXACT existing name and a "secret" field (do NOT set "hidden"), and omit or leave "body" empty so its public page is not overwritten. Example: {"name": "Mayor Crane", "secret": "She secretly leads the cult driving the countdown."}',
      'Never put a spoiler in the public "body" of an existing entry.',
      '',
      JSON_ARRAY_INSTRUCTION,
      'In addition, each object may include "hidden": true and/or "secret": "<GM-only text>". Use type "plan" for the single countdown entry.'
    ];

    const world = [];
    if (opts.genres && opts.genres.length) world.push('GENRE(S): ' + opts.genres.join(', '));
    if (opts.setting && String(opts.setting).trim()) world.push('SETTING: ' + String(opts.setting).trim());
    if (world.length) lines = lines.concat(['', 'World context:', world.join('\n')]);

    if (opts.existingNames && opts.existingNames.length) {
      lines = lines.concat(['', 'Names already in the wiki (reference these for consistency; reuse the EXACT name only when updating a hidden entry you previously made):',
        opts.existingNames.map(function (n) { return '- ' + n; }).join('\n')]);
    }
    if (opts.recap && String(opts.recap).trim()) {
      lines = lines.concat(['', 'WHAT HAS HAPPENED SO FAR (ground the plan in this):', String(opts.recap).trim()]);
    }
    if (opts.isUpdate) {
      lines = lines.concat(['',
        'This is an UPDATE to an existing plan. Revise it: mark steps already triggered, adjust or replace future steps to reflect how the players have interfered or how the situation has developed, and re-emit the "plan" countdown entry (same name) plus any supporting entries that changed. Keep entry names stable so they update in place.']);
      if (opts.existingPlan && String(opts.existingPlan).trim()) {
        lines = lines.concat(['', 'THE CURRENT PLAN (revise this):', String(opts.existingPlan).trim()]);
      }
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

    /* carried-over recap — when this character continues from a previous story,
     * a digest of what already happened to them. High priority (right after
     * the bio) so the GM picks up the thread. */
    if (opts.recap && String(opts.recap).trim()) {
      const recap = 'THIS CHARACTER\'S STORY SO FAR (carried over from earlier adventures — honor it as established history):\n' + String(opts.recap).trim();
      parts.push(recap);
      used += est(recap);
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

    /* campaign format — paces how the threat's countdown advances */
    if (opts.format && FORMAT_PACING[opts.format]) {
      parts.push(FORMAT_PACING[opts.format]);
      used += est(FORMAT_PACING[opts.format]);
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

    const allWiki = (opts.wiki || []).filter(function (e) { return !e.mergedInto; });
    const hiddenWiki = allWiki.filter(function (e) { return e.hidden; });
    const publicWiki = allWiki.filter(function (e) { return !e.hidden; });
    const secretWiki = publicWiki.filter(function (e) { return e.secret && String(e.secret).trim(); });

    /* GM-ONLY hidden knowledge — the player does not know these. Always tried,
     * with the threat plan/countdown first so it reliably reaches the GM.
     * Includes fully-hidden entries AND the secret sections of public ones. */
    if (hiddenWiki.length || secretWiki.length) {
      const ordered = hiddenWiki.slice().sort(function (a, b) {
        return (a.type === 'plan' ? 0 : 1) - (b.type === 'plan' ? 0 : 1);
      });
      const hiddenLines = [];
      ordered.forEach(function (e) {
        const line = entryText(e);
        if (est(line) <= room) { hiddenLines.push(line); room -= est(line); }
      });
      secretWiki.forEach(function (e) {
        const line = '[' + e.type + '] ' + e.name + ' — SECRET (public page does not show this): ' + String(e.secret).trim();
        if (est(line) <= room) { hiddenLines.push(line); room -= est(line); }
      });
      if (hiddenLines.length) {
        parts.push('GM-ONLY HIDDEN KNOWLEDGE (the player does NOT know these — drive the world and the threat with them, but reveal them only through what happens in the fiction; never state them outright)\n' + hiddenLines.join('\n'));
      }
    }

    /* 4 + 5. wiki: pinned, then name-matched in recent turns (player-known only) */
    const scene = (opts.scenes || []).find(function (s) { return s.id === opts.currentSceneId; });
    const pinnedIds = (scene && scene.pinnedEntryIds) || [];
    const recent = (opts.messages || []).slice(-6).map(function (m) { return m.content; }).join('\n');
    const matched = matchWiki(publicWiki, recent);
    const seen = {};
    const wikiLines = [];
    pinnedIds.map(function (id) { return publicWiki.find(function (e) { return e.id === id; }); })
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

  return { assemble: assemble, protocolPrompt: protocolPrompt, wikiIntakePrompt: wikiIntakePrompt, wikiTopicPrompt: wikiTopicPrompt, wikiDedupePrompt: wikiDedupePrompt, planPrompt: planPrompt, est: est };
})();
