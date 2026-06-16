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
    },

    {
      id: 'running-man',
      title: 'The Running Man',
      tagline: 'You are Ben Richards. Stay alive thirty days on live TV — the whole country is hunting you.',
      blurb: 'A near-future dystopia ruled by the Network and its blood-sport game shows. You play Ben Richards, a blacklisted laborer who signed up for the deadliest show on television to save his sick daughter. The rules are simple: you are now an enemy of the state, you get a head start, and then the Hunters come. Survive thirty days for the grand prize. Everyone watching gets paid to turn you in.',
      defaultCharName: 'Ben Richards',
      firstSceneTitle: 'Day One',
      pc: {
        name: 'Ben Richards',
        description: 'A blacklisted laborer out of the co-op slums, lean and hard from years of work and hunger. Stubborn, quick-witted, and quietly furious at a system that would let his daughter die for the price of medicine. Not a hero — a desperate man with nothing left to lose and a refusal to beg. He runs because his family needs the money, and because he will not give the Network the satisfaction of watching him quit. Smart enough to improvise out of any corner, angry enough to fight back, and far more dangerous than anyone on that broadcast expects.'
      },
      campaign: {
        format: 'multishot',
        genres: ['Sci-Fi', 'Dystopian', 'Thriller', 'Action'],
        setting: 'A near-future America gutted by economic collapse and obscene inequality, ruled in all but name by the Network — a media-corporate state that keeps the masses broke, medicated by free television, and entertained by watching the poor die for prizes. Smog-choked co-op cities, ration cards and blacklists, propaganda blaring from every screen. The Games are the one advertised way out of the gutter, and by far the fastest way into a grave.',
        premise: 'Ben Richards, blacklisted and broke with a daughter dying for want of medicine, has done the last desperate thing left to a man like him: walked into the Games Building and signed his life away. The Network chose him for The Running Man — its deadliest, highest-paying show. As of now he is a declared enemy of the state. He gets a head start, and then the Hunters come, led by Evan McCone, who has never failed. Survive thirty days and the grand prize is his — more money than his family could spend in three lifetimes — and every hour alive earns more. The whole country is watching, and anyone who turns him in gets paid. Ben Richards has never once been good at lying down and dying.',
        boundaries: 'A gritty dystopian thriller — tense, kinetic, and angry, built on chases, disguises, narrow escapes, and the grinding pressure of staying alive while an entire nation hunts you for a reward. Keep violence hard but not gratuitously gory; the real horror is the system — the surveillance, the manufactured spectacle, the desperation it breeds. Richards is defiant, sharp-tongued, and resourceful. Allow moral grays: survival forces ugly choices, and not everyone who offers help is what they seem.',
        rulesNotes: 'Track the survival clock explicitly: it is Day 1 of 30. Note the day as it advances, and let real time pressure build — the Hunters get closer, the net tightens, and the Network manipulates the story as the days pass. Winning means surviving all thirty days OR breaking the Network\'s control of the broadcast; losing means being killed on air or giving up.'
      },
      pinned: ['The Running Man (the Game)', 'The Network', 'The Hunters', 'Evan McCone', 'Dan Killian', 'Bobby Thompson', 'Sheila Richards', 'Cathy Richards'],
      wiki: [
        { type: 'event', name: 'The Running Man (the Game)', aliases: ['the Game', 'the show'], tags: ['rules', 'clock'],
          body: 'The Network\'s deadliest, most-watched game show. The contestant — the Runner — is declared an enemy of the state and must survive thirty days. They are given a head start before the Hunters are loosed. They earn money for every hour they stay alive, and the grand prize for surviving all thirty days is a fortune. The entire population is invited to hunt them: a confirmed sighting pays the tipster a small fortune, so every face in every crowd is a potential informer. The Runner is also required to keep feeding the broadcast — submitting regular footage of themselves — so the show can air their suffering and, in doing so, keep a thread on where they are.' },
        { type: 'faction', name: 'The Network', aliases: ['the Games Network', 'the Games Building'], tags: ['power'],
          body: 'The all-controlling media-corporate state that runs the Games, the news, the propaganda, and effectively the country. It manufactures reality for a sedated, impoverished public: it decides who is a hero and who is a monster, and edits the footage to match. To the Network, Ben Richards is not a person but content — and content that performs well can be made to last, or made to die, exactly when the ratings call for it.' },
        { type: 'faction', name: 'The Hunters', aliases: ['Hunters'], tags: ['threat'],
          body: 'An elite, lavishly funded unit of professional killers the Network unleashes on each Runner. Disciplined, theatrical, and relentless, they treat the hunt as both a craft and a performance for the cameras. They have every advantage — money, weapons, surveillance, the public\'s tips — and they are patient. No Runner has ever outlasted them for thirty days.' },
        { type: 'npc', name: 'Evan McCone', aliases: ['McCone'], tags: ['Hunters', 'threat'],
          body: 'The legendary Chief Hunter who leads the pursuit — a cold, methodical predator who has never once let a Runner reach the end of the clock. Soft-voiced and unhurried, he treats Richards as an interesting problem to be solved rather than a man to be hated, which somehow makes him worse. Where the Hunters go, McCone is the mind behind them.' },
        { type: 'npc', name: 'Dan Killian', aliases: ['Killian'], tags: ['Network'],
          body: 'The Network\'s smooth, powerful producer of the Games — the man who chose Richards and put him on the air. He has a thousand-dollar smile and the patience of someone who has watched a hundred desperate men make the same doomed bet. He sees Richards as the best content he\'s had in years, and is already calculating how the story should end.',
          secret: 'Killian is genuinely impressed by Richards and, if Richards survives long enough and proves dangerous enough, will privately offer him a devil\'s bargain: stop running, come work for the Network as a Hunter, and live rich and comfortable — betraying every other Runner who comes after. It is a real offer and a real trap, and refusing it makes Killian decide Richards must die spectacularly, on cue.' },
        { type: 'npc', name: 'Bobby Thompson', aliases: ['Bobby T', 'the host'], tags: ['Network'],
          body: 'The dazzling, sinister host of The Running Man and the beloved face of the broadcast — all teeth and showmanship and cruelty dressed as charm. He works the studio crowd into a frenzy, narrates the hunt like a sportscaster, and turns each Runner into a villain the nation can cheer to watch fall. The public adores him; he is the smiling mask over the whole machine.' },
        { type: 'npc', name: 'Sheila Richards', aliases: ['Sheila'], tags: ['family'],
          body: 'Ben\'s wife, holding their home together back in the co-op slums while he runs. She is the reason he signed up and the reason he can\'t stop — every hour he survives is money she and Cathy desperately need. She is also a pressure point the Network knows about, and a way to reach Ben that no Hunter could manage alone.' },
        { type: 'npc', name: 'Cathy Richards', aliases: ['Cathy'], tags: ['family'],
          body: 'Ben and Sheila\'s young daughter, sick with an illness the family can\'t afford to treat — the medicine costs more than a blacklisted man can earn in a year. She is the whole reason Ben walked into the Games Building. Keeping her alive is the prize that actually matters to him; the grand prize is just the means.' },

        /* ---- GM-only (hidden); never pinned, fed to the GM automatically ---- */
        { type: 'plan', name: 'The Network\'s Hunt', aliases: [], tags: ['countdown'], hidden: true,
          body: 'THE THREAT: the Network and its Hunters, turning Ben Richards\'s fight to survive into thirty days of profitable spectacle that always ends the same way.\n'
              + 'THE GOAL (Nightfall): Richards is killed on live television at the moment of maximum ratings — the system reaffirmed, the audience roaring, his death sold as entertainment and a warning.\n'
              + 'The six steps the Network carries out unless Richards disrupts them:\n'
              + '- Day: the head start ends and the Hunters deploy; the first citizen tips come in; the Network edits Richards into a snarling monster so the public will cheer his death.\n'
              + '- Shadows: a tip or his own required footage betrays his first hiding place; he is flushed into the open, hurt or nearly caught, and the Network raises the bounty to turn every stranger into a threat.\n'
              + '- Dawn: the Network leans on his family — surveilling and pressuring Sheila and Cathy on air — to flush Richards out or break him, and dangles a public "surrender and we\'ll help your daughter" deal that it has no intention of honoring.\n'
              + '- Dusk: McCone gets a real lead and springs a set-piece ambush; anyone in the underground who helped Richards is exposed or killed; and Richards learns a Network secret that recontextualizes the whole game (see The Rigged Game, The Poisoned Air).\n'
              + '- Sunset: the Network manufactures a finale — herding Richards toward a public, controlled location for a televised kill, stacking the odds, with McCone personally closing in and the cameras ready.\n'
              + '- Nightfall: Richards is killed or co-opted on air and the Network wins the story — UNLESS he has seized the broadcast and turned the nation watching against the people running it.\n'
              + 'Advance this at a believable pace as the days tick by; the clock and the closing net ARE the pressure. Richards wins by surviving all thirty days or by hijacking the spectacle and exposing the truth on the Network\'s own airwaves. Never reveal the machinery outright — show it through what happens.' },
        { type: 'event', name: 'The Rigged Game', aliases: [], tags: ['secret'], hidden: true,
          body: 'The grand prize is a lie. No Runner has ever been permitted to survive thirty days — the prize and the rules exist to sell hope and make the kill feel fair. The clock, the head start, the earnings-per-hour are all theater; when a Runner gets too good or too sympathetic, the Network simply changes the game, manufactures evidence, or arranges an "accident." Discovering this is a turning point: it means the only real way to win is to break the Network\'s control of the story itself.' },
        { type: 'event', name: 'The Poisoned Air', aliases: [], tags: ['secret'], hidden: true,
          body: 'The Network and the state know that the air in the co-op slums is slowly killing the poor — and that the cheap "filters" they sell the public do nothing. The illness taking Cathy, and thousands like her, is not bad luck; it is a quietly accepted cost of the system. If Richards uncovers and broadcasts this, it is the kind of truth that could turn a sedated audience into a furious one — which is exactly why the Network would rather see him dead than let him say it on air.' }
      ],
      opening:
        'The holding room smells of sweat and antiseptic and the hot dust of television lights. Past the door, a crowd that paid to be here is chanting a name like it\'s a curse and a prayer at once. Your name.\n\n'
      + 'Thirty-six hours ago you were nobody — blacklisted, broke, watching your daughter Cathy cough herself thinner while the pharmacy waved away your ration card. Now you are the most-watched man in the country.\n\n'
      + 'On a wall of monitors the host, Bobby Thompson, throws his arms wide to a roaring studio. "Laaadies and gentlemen — your newest Runner!" The screens cut to your face, except it isn\'t yours anymore; they\'ve edited you into something snarling and dangerous, a killer the nation will love to watch die. Beside the monitors, a producer with a thousand-dollar smile — Dan Killian — watches you the way a man watches a horse he\'s bet on.\n\n'
      + 'The rules scroll past in cheerful graphics. You are now, officially, an enemy of the state. Thirty days. Survive them and the grand prize is yours — more New Dollars than your family could spend in three lifetimes — and every hour you stay alive pays out more. The Hunters, led by Evan McCone, who has never once failed, are already gearing up. So is everyone else: a confirmed sighting pays the tipster a year\'s wages, so every face in every crowd is a camera and a knife. And the Network expects its footage — you\'ll be made to keep feeding the show even as it feeds on you.\n\n'
      + 'A handler unlocks the steel door. Cold city air pours in, gray and sour with smog. The red light above the exit ticks over to green.\n\n'
      + '"You get a head start, friend." Killian\'s voice is almost gentle. "I\'d use it."\n\n'
      + 'The chant rises behind you. Ahead: a street of alleys and crowds and cameras on every corner, a whole city that has been told you\'re worth money dead. Thirty days starts now.\n\nWhat do you do?'
    }
  ];

  function list() {
    return LIST.map(function (e) {
      return {
        id: e.id, title: e.title, tagline: e.tagline, blurb: e.blurb,
        defaultCharName: e.defaultCharName,
        /* fixedPC: the player plays a defined character (no name prompt) */
        fixedPC: !!e.pc, pcName: e.pc ? e.pc.name : null
      };
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

    /* Two PC modes: a defined character (def.pc — the player IS Ben Richards,
     * bio prewritten) or a blank self-insert the player names + describes. */
    await Store.saveCharacter(cid, {
      name: (def.pc && def.pc.name) || (charName && charName.trim()) || def.defaultCharName,
      isNPC: false,
      description: (def.pc && def.pc.description) || '',
      createdAt: Date.now()
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
