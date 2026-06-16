/* AI GM — ready-to-play example adventures.
 *
 * Each example is a fully pre-seeded campaign: world + premise + boundaries,
 * a populated wiki (public cast AND a hidden, GM-only threat plan), a first
 * scene with the cast pinned, and an opening GM "pass" already written so the
 * player can read it the moment they open Play. The only thing left to the
 * player is describing their own character — which they do by answering the
 * opening scene. Hidden entries (the villain, the countdown) are NOT pinned:
 * Context.assemble feeds every hidden entry + secret to the GM automatically,
 * while scene pins (which show as chips to the player) stay public-only. */
const Examples = (function () {

  const LIST = [
    {
      id: 'mi-syndicate',
      title: 'Mission: Impossible — The Syndicate',
      tagline: 'Your phone rings. Ethan Hunt says the Syndicate is real, and he needs you.',
      blurb: 'A globe-trotting espionage thriller. The IMF has just been shut down, Ethan Hunt is a fugitive, and a network of agents who are all supposed to be dead — the Syndicate — is dismantling the world order from the shadows. Join Benji, Luther, Brandt, and the dangerously unreadable Ilsa Faust to expose them and stop the man behind it all.',
      defaultCharName: 'The Recruit',
      firstSceneTitle: 'The Call',
      campaign: {
        format: 'multishot',
        genres: ['Modern', 'Espionage', 'Action', 'Thriller'],
        setting: 'The present-day world of espionage at its most cinematic — the Impossible Missions Force and the agents who do what no one else can. A globe of safehouses and opera houses, rooftop sprints and impossible heists, latex masks and last-second saves: London, Vienna, Casablanca, Havana, anywhere a lead points. Grounded but stylish, tense but clever, in the spirit of the Mission: Impossible films.',
        premise: 'The IMF has just been dissolved — folded into the CIA by a Director who calls it a relic of luck and chaos. Ethan Hunt has gone off the grid, branded a fugitive, chasing a ghost no one else believes in: the Syndicate, a network of intelligence agents from every nation, each officially dead and erased from the record, now working as one with no flag and no rules to tear down the world\'s governments from the inside. Hunt can\'t do this alone and he can\'t trust the Agency. So he\'s reaching out off the books — to people like you. Benji Dunn, Luther Stickell, and William Brandt are already in. The job: prove the Syndicate is real and take down the man behind it before he vanishes for good.',
        boundaries: 'Action-thriller tone — tense, clever, and stylish, full of daring set pieces, narrow escapes, and last-second improvisation. Keep it PG-13: violence is bloodless and cinematic, no gratuitous gore; these spies bluff, sneak, and outthink far more than they kill. The team are professionals who genuinely care about each other — keep the camaraderie and the wit.',
        rulesNotes: ''
      },
      /* pinned to scene 1 (public cast the player already knows about) */
      pinned: ['Ethan Hunt', 'Benji Dunn', 'Luther Stickell', 'William Brandt', 'Ilsa Faust', 'The Impossible Missions Force', 'The Syndicate'],
      wiki: [
        { type: 'npc', name: 'Ethan Hunt', aliases: ['Hunt', 'Ethan'], tags: ['IMF', 'team'],
          body: 'The IMF\'s best field agent and your point of contact. Relentless, improvisational, and almost impossible to predict or kill — he runs toward the thing everyone else runs from. Now a fugitive after the IMF was disbanded, hunted by the CIA while he hunts the Syndicate. He trusts a very short list of people, and he is betting the world on it.' },
        { type: 'npc', name: 'Benji Dunn', aliases: ['Benji'], tags: ['IMF', 'team', 'tech'],
          body: 'Field agent and technical genius, a former lab tech who talked his way into the action. Hacks, masks, comms, and gadgets are his domain. Nervy, funny, and braver than he thinks when it counts. He\'ll be in your ear and at your shoulder for most of what\'s coming.' },
        { type: 'npc', name: 'Luther Stickell', aliases: ['Luther'], tags: ['IMF', 'team', 'tech'],
          body: 'Hunt\'s oldest friend and the team\'s master of computers and counter-surveillance. Steady, wise, and the moral center of the group — the one who says the hard, true thing out loud. If Luther is worried, you should be.' },
        { type: 'npc', name: 'William Brandt', aliases: ['Brandt', 'Will'], tags: ['IMF', 'team'],
          body: 'Former IMF chief analyst turned field agent — sharp, cautious, and carrying a guilty conscience and a head for consequences. He works the official channels and the politics, and clashes with Hunt\'s leap-first instincts, which is exactly why the team needs him.' },
        { type: 'npc', name: 'Ilsa Faust', aliases: ['Ilsa'], tags: ['wildcard'],
          body: 'A lethally capable British operative who keeps turning up wherever the Syndicate operates. She has saved Hunt\'s life and very nearly ended it. Brilliant, disciplined, and unreadable — no one is sure whose side she is on, least of all the people counting on her.',
          secret: 'Ilsa is a deep-cover MI6 agent embedded inside the Syndicate, trying to bring it down from within. London has ordered her to hold her cover at all costs and has disavowed her if she is caught. She will help Hunt and the team when she safely can, but she cannot break cover without proof that would free her — so her loyalty repeatedly looks like betrayal until the last possible moment.' },
        { type: 'npc', name: 'Alan Hunley', aliases: ['Hunley', 'Director Hunley'], tags: ['CIA'],
          body: 'Director of the CIA, the man who engineered the IMF\'s dissolution, calling it "the home of the gambler\'s odds." He considers Hunt a dangerous liability and has tasked the Agency with bringing him in. Not a villain — a man who believes in rules and accountability — but right now his manhunt is the Syndicate\'s best cover.' },
        { type: 'faction', name: 'The Impossible Missions Force', aliases: ['IMF'], tags: ['agency'],
          body: 'The deniable agency that takes the missions no one else can survive, on improvisation, infiltration, and impossible odds. As of this morning it officially no longer exists — absorbed into the CIA, its agents scattered, disavowed, or on the run. What is left of it is the handful of people answering Hunt\'s call.' },
        { type: 'faction', name: 'The Syndicate', aliases: ['Anti-IMF'], tags: ['threat'],
          body: 'A rumored network of intelligence operatives from many nations — each officially dead, scrubbed from every record — now working together with no flag and no rules. The CIA insists they are a conspiracy theory, a pattern Hunt invented to justify his paranoia. Hunt is certain they are real, disciplined, and already at work tearing down the old order. Proving they exist at all is half the battle.' },
        { type: 'item', name: 'The Syndicate Ledger', aliases: ['the ledger', 'the red box'], tags: ['objective'],
          body: 'An encrypted disk said to hold the Syndicate\'s true prize: a hidden fortune in untraceable funds and the real identities of every dead agent in its ranks. Whoever controls it controls the Syndicate. It is locked behind layers no one has cracked, and more than one government would burn a city to keep it buried.' },

        /* ---- GM-only (hidden); never pinned, fed to the GM automatically ---- */
        { type: 'npc', name: 'Solomon Lane', aliases: ['Lane', 'the Director'], tags: ['threat', 'Syndicate'], hidden: true,
          body: 'The founder and director of the Syndicate — a former British intelligence agent sent into the cold who chose never to come back. Soft-spoken, patient, and utterly without remorse, he believes the world\'s institutions are a machine for grinding up good agents, and he intends to dismantle that machine and rebuild it under his own control. He never appears in the open; he works through disavowed agents and engineered catastrophes. He regards the IMF as the last thing standing in his way, and Ethan Hunt as a personal problem to be removed.' },
        { type: 'plan', name: 'The Syndicate\'s Design', aliases: [], tags: ['countdown'], hidden: true,
          body: 'THE THREAT: Solomon Lane and the Syndicate — dead men with no allegiance, waging an invisible war to collapse the world\'s governments and rebuild them in Lane\'s image.\n'
              + 'THE GOAL (Nightfall): unlock the encrypted ledger\'s fortune and become a self-funding shadow state — able to topple governments at will, untraceable and untouchable, with Lane quietly remaking the world.\n'
              + 'The six steps the Syndicate carries out unless the team disrupts them:\n'
              + '- Day: a disaster staged as an accident — a plant fire, a transit crash, a bank\'s sudden collapse — reads as misfortune. It is the Syndicate proving its reach and seeding fear while the team is still trying to prove the Syndicate exists at all.\n'
              + '- Shadows: a public figure — a chancellor, a minister, an oversight chief — is assassinated or disgraced, the blame pinned elsewhere. The Syndicate harvests the chaos and tightens its grip on a national security service.\n'
              + '- Dawn: the Syndicate moves to seize the encrypted ledger, coercing or abducting the one person alive who can open it. Whoever holds the ledger holds the war chest.\n'
              + '- Dusk: with the funds unlocking, Lane burns his loose ends — exposing assets, moving to silence the agent hidden in his own ranks (Ilsa), and framing Hunt as the terrorist behind it all so the world\'s manhunt does Lane\'s work for him.\n'
              + '- Sunset: coordinated strikes destabilize an entire region; governments turn on one another; panic spreads. The Syndicate quietly sells itself as the only thing that can restore order.\n'
              + '- Nightfall: the Syndicate stands financed, faceless, and unstoppable — a shadow intelligence agency answering to no nation. Lane has won, and almost no one knows his name.\n'
              + 'Advance this at a believable pace as scenes pass and the team interferes; show its effects in the world long before anyone can name the cause. Never reveal the plan outright — only its consequences.' }
      ],
      opening:
        'Your phone lights up at an hour it has no business ringing — a number with no name, no country code, a string of digits that shouldn\'t connect to anything at all. You answer.\n\n'
      + 'For a moment there\'s only static and the rush of wind, like someone moving fast down an open street. Then a voice, low and certain: "Don\'t say my name. Don\'t say yours. If you\'re hearing this, it\'s because I\'ve run out of people I can trust and started on the ones I have to."\n\n'
      + 'A pause. The hiss of tires on wet road. "The IMF is gone — shut down this morning, signed away to people who decided we\'re a liability. And the thing they shut us down for chasing is real. The Syndicate. Agents who are all supposed to be dead, working as one, and they are already moving. I\'ve seen what they can do. No one will believe me. That\'s the point."\n\n'
      + 'His breathing steadies, like a decision being made. "Benji, Luther, Brandt — they\'re already in. I need one more. Someone off the books, someone the Agency doesn\'t have a file on. I need you."\n\n'
      + 'The wind drops, as if he\'s stepped through a doorway. "I\'m trusting you because I don\'t have a choice — so let\'s make it even. Who am I talking to? Tell me who you are, and what you bring to a job nobody is supposed to walk away from."'
    }
  ];

  function list() {
    return LIST.map(function (e) {
      return { id: e.id, title: e.title, tagline: e.tagline, blurb: e.blurb, defaultCharName: e.defaultCharName };
    });
  }

  async function instantiate(id, charName) {
    const def = LIST.filter(function (e) { return e.id === id; })[0];
    if (!def) throw new Error('Unknown example: ' + id);
    const uid = Store.uid();

    const cid = await Store.saveCampaign(Object.assign({
      name: def.title, ownerUid: uid, members: [uid],
      settings: {}, currentSceneId: null, createdAt: Date.now(), example: def.id
    }, def.campaign));

    await Store.saveCharacter(cid, {
      name: (charName && charName.trim()) || def.defaultCharName,
      isNPC: false, description: '', createdAt: Date.now()
    });

    const nameToId = {};
    for (const w of def.wiki) {
      const wid = await Store.saveWiki(cid, {
        type: w.type, name: w.name, aliases: w.aliases || [], tags: w.tags || [],
        body: w.body || '', createdBy: 'player', mergedInto: null,
        hidden: w.hidden === true, secret: w.secret || ''
      });
      nameToId[w.name] = wid;
    }

    const pinnedEntryIds = (def.pinned || []).map(function (n) { return nameToId[n]; }).filter(Boolean);
    const sceneId = await Store.saveScene(cid, {
      title: def.firstSceneTitle || 'Scene 1', summary: '', status: 'active',
      pinnedEntryIds: pinnedEntryIds, startedAt: Date.now()
    });

    const camp = await Store.getCampaign(cid);
    camp.currentSceneId = sceneId;
    await Store.saveCampaign(camp);

    if (def.opening) {
      await Store.addMessage(cid, { role: 'gm', content: def.opening, sceneId: sceneId, blocks: [], blockMeta: {} });
    }
    return cid;
  }

  return { list: list, instantiate: instantiate };
})();
