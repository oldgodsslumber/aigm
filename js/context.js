/* AI GM — deterministic context assembly (the "RAG").
 * Priority order, against a token budget (chars/4 estimate):
 *   1. pack gmPrompt + protocol instructions     (always)
 *   2. current character sheet                   (always)
 *   3. prior scene summaries                     (oldest truncate first)
 *   4. wiki entries pinned to the current scene
 *   5. wiki entries name/alias-matched in recent turns
 *   6. last N raw transcript turns               (N shrinks to fit)
 * No embeddings; the LLM covers gaps via gm-lookup. */
const Context = (function () {

  function est(s) { return Math.ceil(String(s || '').length / 4); }

  function protocolPrompt(pack, schema, opts) {
    const manualDice = !opts || opts.manualDice !== false; /* default: player rolls */
    const rolls = (pack.rollDefinitions || []).map(function (r) {
      let p = '';
      if (r.type === 'target-number') p = 'params: modifier, difficulty';
      else if (r.type === 'sum') p = 'params: count, modifier';
      else if (r.type === 'pool-count') p = (r.countRule && r.countRule.mode === 'sets') ? 'params: count (pool size), difficulty (required match size: 2=pair,3=three,4=four,5=five,6=six)' : 'params: count, difficulty';
      else if (r.type === '2d20') p = 'params: count, target, difficulty';
      return '- "' + r.id + '" (' + (r.label || r.id) + ', type ' + r.type + (p ? '; ' + p : '') + ')' + (r.when ? ' — ' + r.when : '');
    }).join('\n');
    const fields = SheetUI.fieldPaths(schema).map(function (f) { return '- ' + f; }).join('\n');

    const diceSection = manualDice ? [
      'DICE — the player rolls ALL dice physically (real dice on the table), for their own character AND for every NPC, and types the outcome to you in their next message (e.g. "I got 2 successes" or "the guard rolled a 5"). You NEVER invent, assume, or pre-decide a roll result, and you do NOT use any dice widget or gm-roll block.',
      '',
      'ASK FOR A ROLL ONLY WHEN ONE IS GENUINELY NEEDED. Default to NO roll. A roll is needed only when the system\'s rules require it for an action whose outcome is truly uncertain AND where failure would change the story. Everything else just happens — narrate it and move on. Do NOT roll for routine, trivial, or low-stakes actions; do NOT roll "to see what happens", for atmosphere, for perception/noticing, or to add tension. Do NOT ask for more than one roll in a reply, and do NOT chain rolls. IMPORTANT: every roll you ask for costs the player an extra, limited request to the AI — so when in doubt, do NOT roll. Resolve it in the fiction instead.',
      'When a roll truly is required: in plain prose, tell the player exactly what to roll and the target/difficulty (using the dice rules below), then STOP and wait for them to report. Narrate consequences only from the numbers they give you; never contradict them.',
      'Dice rules in this system (use these when telling the player what to roll):',
      rolls
    ].join('\n') : [
      'DICE — you NEVER invent roll results. All rolls, including rolls for NPCs, are made by the player clicking a real dice widget. When the rules call for a roll, emit:',
      '```gm-roll',
      '{"roll": "<roll id>", "character": "<who rolls>", "reason": "<one line>", "params": {<see below>}}',
      '```',
      'Available rolls in this system:',
      rolls,
      'Include at most ONE gm-roll per reply, then STOP narrating and wait. The result arrives as a ```roll-result``` block in the next player message; narrate consequences from its numbers, never contradict them.'
    ].join('\n');

    return [
      'You are the Game Master running a solo tabletop RPG session for one player. Narrate in second person, present tense. Play all NPCs. Keep replies vivid but tight — usually 80 to 250 words — and end on something the player can act on. Never narrate the player character\'s decisions, dialogue, or feelings for them.',
      '',
      'You interact with the game app through fenced blocks embedded in your replies. The app parses them and renders real UI. Use them exactly as specified — valid JSON, one object per block.',
      '',
      diceSection,
      '',
      'SHEET CHANGES — when the rules change a character\'s sheet (damage, spent resources, new gear), emit a field-level diff. It auto-applies with an undo button, so be precise:',
      '```gm-sheet',
      '{"character": "<name>", "reason": "<one line>", "changes": [{"field": "<field path>", "from": <old>, "to": <new>}]}',
      '```',
      'Valid field paths for this system:',
      fields,
      '',
      'WIKI — when a notable NPC, location, faction, item, or event is established in play, record it (auto-creates an entry; updates if the name already exists):',
      '```gm-wiki',
      '{"type": "npc|location|faction|item|event", "name": "<canonical name>", "aliases": ["<other names>"], "tags": ["<topic>"], "body": "<2-5 sentences of durable facts>"}',
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
      'Stay inside the system\'s rules below. Call for a roll ONLY when the rules require it for a genuinely uncertain action where failure is interesting — otherwise never call for one; just narrate the outcome. When no roll is needed, your reply must contain no roll request of any kind. Honor established wiki facts and scene summaries as canon.'
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

  /* opts: {pack, schema, character, scenes, currentSceneId, wiki, premise,
   *        boundaries, manualDice, messages, budget}
   * Returns {system, messages, stats} */
  function assemble(opts) {
    const budget = opts.budget || 16000;
    const parts = [];
    const protocol = protocolPrompt(opts.pack, opts.schema, { manualDice: opts.manualDice });
    const rules = 'SYSTEM RULES\n' + opts.pack.gmPrompt;
    const bio = opts.character.description && String(opts.character.description).trim()
      ? 'WHO THIS CHARACTER IS (the player\'s own words):\n' + String(opts.character.description).trim() + '\n\n'
      : '';
    const sheet = 'CURRENT SHEET (live — trust these numbers)\n' + bio +
      SheetUI.describeSheet(opts.schema, opts.character.sheetState, opts.character.name);
    parts.push(protocol, rules);
    let used = est(protocol) + est(rules);

    /* 2a. story setup — premise + boundaries the player defined for THIS
     * campaign. Always included (high priority); boundaries are hard limits
     * that override the system's default genre tone. */
    const setupLines = [];
    if (opts.premise && String(opts.premise).trim()) {
      setupLines.push('PREMISE / STARTING SITUATION (the player set this up — build the story from it):\n' + String(opts.premise).trim());
    }
    if (opts.boundaries && String(opts.boundaries).trim()) {
      setupLines.push('TONE & BOUNDARIES (HARD CONSTRAINTS — always obey; these override the system\'s default tone and any genre convention):\n' + String(opts.boundaries).trim());
    }
    if (setupLines.length) {
      const setup = setupLines.join('\n\n');
      parts.push(setup);
      used += est(setup);
    }

    parts.push(sheet);
    used += est(sheet);

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
