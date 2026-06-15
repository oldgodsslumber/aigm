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

  function protocolPrompt(pack, schema) {
    const rolls = (pack.rollDefinitions || []).map(function (r) {
      let p = '';
      if (r.type === 'target-number') p = 'params: modifier, difficulty';
      else if (r.type === 'sum') p = 'params: count, modifier';
      else if (r.type === 'pool-count') p = (r.countRule && r.countRule.mode === 'sets') ? 'params: count (pool size), difficulty (required match size: 2=pair,3=three,4=four,5=five,6=six)' : 'params: count, difficulty';
      else if (r.type === '2d20') p = 'params: count, target, difficulty';
      return '- "' + r.id + '" (' + (r.label || r.id) + ', type ' + r.type + (p ? '; ' + p : '') + ')' + (r.when ? ' — ' + r.when : '');
    }).join('\n');
    const fields = SheetUI.fieldPaths(schema).map(function (f) { return '- ' + f; }).join('\n');

    return [
      'You are the Game Master running a solo tabletop RPG session for one player. Narrate in second person, present tense. Play all NPCs. Keep replies vivid but tight — usually 80 to 250 words — and end on something the player can act on. Never narrate the player character\'s decisions, dialogue, or feelings for them.',
      '',
      'You interact with the game app through fenced blocks embedded in your replies. The app parses them and renders real UI. Use them exactly as specified — valid JSON, one object per block.',
      '',
      'DICE — you NEVER invent roll results. All rolls, including rolls for NPCs, are made by the player clicking a real dice widget. When the rules call for a roll, emit:',
      '```gm-roll',
      '{"roll": "<roll id>", "character": "<who rolls>", "reason": "<one line>", "params": {<see below>}}',
      '```',
      'Available rolls in this system:',
      rolls,
      'Include at most ONE gm-roll per reply, then STOP narrating and wait. The result arrives as a ```roll-result``` block in the next player message; narrate consequences from its numbers, never contradict them.',
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
      'LOOKUP — if you need facts about something from earlier in the campaign that is not in your context, ask the app:',
      '```gm-lookup',
      '{"query": "<name or tag>"}',
      '```',
      'Matching entries come back in the next message; then continue.',
      '',
      'SCENE SUMMARY — ONLY when the player ends a scene you will be asked for a summary. Reply then with exactly one block and nothing else:',
      '```gm-scene',
      '{"title": "<3-6 word scene title>", "summary": "<5-10 sentences: what happened, decisions made, consequences pending, NPC status>"}',
      '```',
      '',
      'Stay inside the system\'s rules below. Call for rolls only when the outcome is uncertain AND failure is interesting. Honor established wiki facts and scene summaries as canon.'
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

  /* opts: {pack, schema, character, scenes, currentSceneId, wiki, messages, budget}
   * Returns {system, messages, stats} */
  function assemble(opts) {
    const budget = opts.budget || 16000;
    const parts = [];
    const protocol = protocolPrompt(opts.pack, opts.schema);
    const rules = 'SYSTEM RULES\n' + opts.pack.gmPrompt;
    const sheet = 'CURRENT SHEET (live — trust these numbers)\n' +
      SheetUI.describeSheet(opts.schema, opts.character.sheetState, opts.character.name);
    parts.push(protocol, rules, sheet);
    let used = est(protocol) + est(rules) + est(sheet);

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
