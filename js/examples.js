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
          body: 'The founder and director of the Syndicate — a former British intelligence agent sent into the cold who chose never to come back. Soft-spoken, patient, and utterly without remorse, he believes the world\'s institutions are a machine for grinding up good agents, and he intends to dismantle that machine and rebuild it under his own control. He never appears in the open; he works through disavowed agents and engineered catastrophes. He regards the IMF as the last thing standing in his way, and Ethan Hunt as a personal problem to be removed. He treats interference as information, never insult: he will spend agents, money, and months to stay invisible rather than risk exposure, and reroutes around an obstacle instead of charging it. His weapons are leverage, misdirection, and patience; open force is a last resort and a sign he has been rattled. His one blind spot is Hunt himself — a variable he cannot model — and the longer Hunt costs him, the more personally, and recklessly, he begins to take it.' },
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
              + 'These six steps are Lane\'s plan ONLY if no one stops him. When the team disrupts a step, have Lane react as himself — quietly absorbing the loss, adapting the scheme, turning their own move back against them — then revise the remaining steps to fit and record the change as a hidden update. Advance it at a believable pace as scenes pass; show its effects in the world long before anyone can name the cause, and never reveal the plan outright — only its consequences.' }
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
          body: 'The legendary Chief Hunter who leads the pursuit — a cold, methodical predator who has never once let a Runner reach the end of the clock. Soft-voiced and unhurried, he treats Richards as an interesting problem to be solved rather than a man to be hated, which somehow makes him worse. Where the Hunters go, McCone is the mind behind them. He hunts by patience and pattern rather than noise — he studies a Runner, predicts them, and springs the trap once. When Richards breaks the pattern, McCone adjusts coldly instead of raging, treating each surprise as a correction to his model; but his pride in never having failed is a lever — pushed into improvising in public, off his careful script, even he can be made to err.' },
        { type: 'npc', name: 'Dan Killian', aliases: ['Killian'], tags: ['Network'],
          body: 'The Network\'s smooth, powerful producer of the Games — the man who chose Richards and put him on the air. He has a thousand-dollar smile and the patience of someone who has watched a hundred desperate men make the same doomed bet. He sees Richards as the best content he\'s had in years, and is already calculating how the story should end. He thinks in audiences and outcomes: if Richards bores the public he engineers fresh danger; if Richards wins sympathy he reframes him as a monster or dangles a deal; if Richards turns genuinely dangerous he changes the rules of the game itself. He prizes control and ratings above any rule, respects real competence — which is exactly what makes Richards interesting to him — and his weakness is vanity: he wants to author the ending personally, and will take risks to get the finale he has already imagined.',
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
              + 'These steps are the Network\'s default broadcast if Richards merely runs. The moment he disrupts one — survives an ambush, turns a crowd, exposes a secret — have the Network and its people react in character: Killian rewrites the show, McCone re-reads the board, the rules bend to protect the ending the Network wants. Revise the remaining steps to fit and record the change as a hidden update. Advance it at a believable pace as the days tick by; the clock and the closing net ARE the pressure. Richards wins by surviving all thirty days or by hijacking the spectacle and broadcasting the truth on the Network\'s own airwaves. Never reveal the machinery outright — show it through what happens.' },
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
    },

    {
      id: 'columbo-mystery',
      title: 'Columbo: Murder at Ravenhurst Manor',
      tagline: 'A rich man is dead, the phones are out, and one of six charming guests is lying. Just one more thing…',
      blurb: 'A cozy, bloodless whodunit in the spirit of Columbo and Clue. You play Lieutenant Columbo, the rumpled LAPD detective everyone underestimates, called to an isolated manor where a cruel millionaire has died over his nightly glass of port. It looks like his bad heart gave out — but he gathered six people who each had reason to want him gone, and you are not so sure. No chases, no gunfights: just observation, conversation, and one liar you have to catch. A one-shot.',
      defaultCharName: 'Lt. Columbo',
      firstSceneTitle: 'The Body in the Library',
      pc: {
        name: 'Lt. Columbo',
        description: 'A homicide detective with the Los Angeles Police Department, instantly forgettable, and that is precisely the point. A rumpled beige raincoat he never takes off, a chewed cheap cigar, a battered notebook and a pen he can never find, and a beat-up old car held together by optimism. He is unfailingly polite, faintly apologetic, forever fumbling his words and losing his train of thought — or so it seems. Beneath the bumbling is a relentless, meticulous mind that fixes on the one small detail that does not fit and will not let it go. He disarms people by letting them feel superior, quotes his never-seen wife at every turn, keeps a mournful basset hound named Dog, and habitually forgets to carry his gun. He never raises his voice and never makes an arrest until the trap is sprung — and he always, always has just one more thing to ask.'
      },
      campaign: {
        format: 'oneshot',
        genres: ['Mystery', 'Crime', 'Drama'],
        setting: 'A classic locked-manor murder mystery. Ravenhurst Manor, a grand old estate on a storm-battered cliff, the night a wealthy man is found dead among the guests who all had reason to want him gone. Rooms full of secrets, a cast of polished liars, and one rumpled homicide detective with a cheap cigar and an endless supply of "just one more thing." Cozy, witty, and bloodless — a puzzle solved by observation and conversation, in the spirit of Columbo and Clue.',
        premise: 'It is a little after ten on a rotten, rain-lashed night. Cornelius Ravenhurst — financier, art collector, and professional keeper of other people\'s secrets — has been found dead in the library of his isolated mansion, slumped over his nightly glass of port. It looks for all the world like his bad heart finally gave out. But Ravenhurst gathered six guests to dinner tonight for the express purpose of threatening every one of them, the phone lines are down, the road has washed out, and nobody can leave until morning. You are Lieutenant Columbo, called to a death everyone insists was natural — and you are not so sure. One of these charming people is a murderer, and you have until the storm clears to work out which.',
        boundaries: 'A cozy, classic murder-mystery tone — a rainy-night manor, brandy and secrets, and a rumpled detective who misses nothing. Bloodless and non-graphic: the murder has already happened quietly, and there are NO chases, fights, or gunplay. The pleasure is in clever conversation, sharp observation, and the slow unmasking of a liar. Keep it witty, atmospheric, fair, and a little warm.',
        rulesNotes: 'This is a FAIR-PLAY whodunit and the player IS the detective. The solution — who killed Cornelius, how, and why — is FIXED in your hidden knowledge; never change it and never reveal it directly. Run an investigation, not an action scene: no chases, fights, or shootouts.\n'
          + '- Let the player drive. They examine the body and scene, search rooms, and question suspects in any order. Reward specific, clever questions and searches with real clues; reward vague ones with atmosphere.\n'
          + '- Suspects lie IN CHARACTER to protect their secrets, but physical evidence never lies and stays consistent across the night. A suspect will not confess until cornered by evidence.\n'
          + '- Dole out the clue trail fairly: everything needed to solve it is discoverable. Reveal the decisive "tell" only once the player has done the legwork.\n'
          + '- The case is solved when the player names the correct murderer AND confronts them with the evidence or contradiction that proves it. If they accuse the wrong person, let that suspect poke holes in the theory and keep the game going — do not confirm a wrong solution.\n'
          + '- Play to Columbo: indulge the player\'s detective theatrics, let suspects underestimate "the little policeman," and keep it cozy, witty, and tense rather than violent.'
      },
      pinned: ['Cornelius Ravenhurst', 'Ravenhurst Manor', 'Dr. Lydia Gray', 'Sebastian Verde', 'Vivienne Scarlett', 'Colonel Mortimer Mustard', 'Professor Peregrine Plum', 'Mrs. Beatrice Peacock', 'Mr. Hargrove'],
      wiki: [
        { type: 'npc', name: 'Cornelius Ravenhurst', aliases: ['Ravenhurst', 'Cornelius'], tags: ['victim'],
          body: 'The dead man. A self-made financier and art collector in his late sixties — brilliant, controlling, and cruel, a man who collected other people\'s secrets the way he collected paintings, and used them to keep everyone in his orbit obedient. He summoned six people to dinner tonight to announce he was rewriting his will and to remind each of them that he knew exactly what they had done. He had a known heart condition and took medication for it every night. He was found slumped peacefully in his Library armchair just before ten, his nightly glass of port at his elbow — for all the world a man who dozed off and never woke.' },
        { type: 'location', name: 'Ravenhurst Manor', aliases: ['the manor', 'the house'], tags: ['scene'],
          body: 'An isolated old estate on a storm-battered cliff, tonight cut off entirely: the phone lines went down around 9:15 and the only road has washed out, so no one can leave or arrive until the storm breaks at dawn. Its rooms include the Grand Dining Room, the Library (where the body was found), the Conservatory, the Billiard Room, the Study (where Ravenhurst kept his dossiers and ledgers), the Wine Cellar, the Kitchen, and the bedrooms above. A perfect sealed box for a murder.' },
        { type: 'location', name: 'The Library', aliases: [], tags: ['scene'],
          body: 'Ravenhurst\'s private library and the scene of his death — leather chairs, a cold fireplace, walls of books, and the small side table where he took his nightly glass of port and his heart-medicine drops. He was found here in his armchair just before ten, the glass beside him, the medicine bottle on the table. To the casual eye, simply a man who fell asleep.' },
        { type: 'event', name: 'The Dinner Party', aliases: ['tonight\'s dinner'], tags: ['timeline'],
          body: 'Tonight Ravenhurst summoned six people he held power over and, over dinner, announced he was rewriting his will and made plain that he knew each of their secrets. Dinner ran from eight; afterward the party scattered through the house. The phones failed around 9:15. Around 9:25 Cornelius retired alone to the Library for his nightly ritual — a glass of port and his heart medicine. He was found dead about 9:45. Every single guest had reason to fear him.' },
        { type: 'item', name: 'Ravenhurst\'s Heart Medicine', aliases: ['the medicine', 'the drops', 'the port'], tags: ['ritual'],
          body: 'Cornelius took digitalis drops for his heart every night at half past nine, measured into a glass of port — two drops, never more, a ritual the whole household could set a clock by. The bottle sat on the Library side table beside his glass. It was refilled earlier this evening.' },

        { type: 'npc', name: 'Dr. Lydia Gray', aliases: ['Dr. Gray', 'the doctor'], tags: ['suspect'],
          body: 'Ravenhurst\'s personal physician for fifteen years — calm, precise, and quietly authoritative, the one person he trusted with his health. She managed his heart condition and his medication herself. Composed and helpful with the Lieutenant, faintly condescending, and entirely unsurprised that a man she had warned for years finally succumbed to his bad heart.',
          secret: 'SHE IS THE MURDERER (see "The Truth of Ravenhurst Manor"). She poisoned Cornelius with a digitalis overdose loaded into his medicine bottle, which she "helpfully" refilled before dinner; he dosed his own port at 9:30 and was dead by 9:45. Motive: he had discovered she embezzled from the children\'s medical charity he funded and forged his signature on its accounts, and meant to have her struck off and prosecuted in the morning — so he had to die tonight. Her alibi for the dinner hour is genuine (she was in plain sight), because the murder was really committed at 7:30 when she loaded the bottle. Play her as helpful, unhurried, and faintly superior, hiding behind her medical authority — and have her overplay her certainty about the "natural" death and the exact dosage, which is how she slips.' },
        { type: 'npc', name: 'Sebastian Verde', aliases: ['Sebastian', 'Verde'], tags: ['suspect'],
          body: 'Ravenhurst\'s nephew and, until tonight, his heir — charming, restless, and visibly rattled. At dinner Cornelius announced he was cutting Sebastian out of the will. He is also quietly, hopelessly in love with Vivienne.',
          secret: 'Drowning in gambling debts and just disinherited — the loudest motive in the house, and a deliberate red herring. He is INNOCENT of the murder: he was at the billiard table with Colonel Mustard from about 9:20 to 9:50, and had no access to or knowledge of Cornelius\'s medication. He is guilty only of his debts and his feelings for Vivienne, and will lie to hide both.' },
        { type: 'npc', name: 'Vivienne Scarlett', aliases: ['Vivienne', 'Mrs. Ravenhurst'], tags: ['suspect'],
          body: 'Ravenhurst\'s glamorous wife, decades his junior, playing the grieving widow with a touch too much polish. She inherits a great deal now that he is dead.',
          secret: 'She was planning to leave Cornelius for Sebastian and feared he would cut her off without a cent. INNOCENT of murder: she spent the fatal window in the Conservatory with Mrs. Peacock. Guilty of an affair and of relief at his death, not of killing him.' },
        { type: 'npc', name: 'Colonel Mortimer Mustard', aliases: ['Colonel Mustard', 'the Colonel'], tags: ['suspect'],
          body: 'A bluff, blustering old soldier and Ravenhurst\'s business partner from decades back — loud, proud, and sweating rather more than the warmth of the room explains.',
          secret: 'Cornelius held proof that the Colonel embezzled from their old firm and threatened tonight to expose him. INNOCENT of murder: he was at the billiard table with Sebastian Verde during the death, and the two reluctantly alibi each other. All bluster, no blood.' },
        { type: 'npc', name: 'Professor Peregrine Plum', aliases: ['Professor Plum', 'the Professor'], tags: ['suspect'],
          body: 'A fastidious, nervous art expert who authenticated Ravenhurst\'s celebrated collection — squeamish, fussy, and easily flustered.',
          secret: 'He knowingly sold Ravenhurst expensive forgeries and pocketed the difference; Cornelius found out and meant to ruin him. INNOCENT of murder: he was in the Wine Cellar fetching a vintage when Cornelius died (the staff saw him), and he faints at the very sight of medicine or blood. Guilty of fraud, not murder.' },
        { type: 'npc', name: 'Mrs. Beatrice Peacock', aliases: ['Mrs. Peacock', 'Beatrice'], tags: ['suspect'],
          body: 'A grand, imperious society matron and Ravenhurst\'s sister-in-law — all jewels and disapproval, and frightened beneath the hauteur.',
          secret: 'Cornelius held a letter exposing a ruinous family secret she would do anything to bury, and dangled it over her at dinner. INNOCENT of murder: she was in the Conservatory with Vivienne the entire time. Her fear is real; the crime is not hers.' },
        { type: 'npc', name: 'Mr. Hargrove', aliases: ['Hargrove', 'the butler'], tags: ['witness'],
          body: 'The Ravenhurst family\'s butler of thirty years — discreet, observant, and quietly grieving the only employer he has ever known. He served dinner, drew the port, and found the body.',
          secret: 'NOT a suspect, and he tells the truth. He is Columbo\'s best witness: he knows who was where, that Dr. Gray refilled the master\'s medicine bottle before dinner, that the master complained at dinner of nausea and of "the candles glowing green," and that the master always took two drops, never three. Loyalty makes him cautious, so he will not volunteer the damning details — but ask him the right question and he will not lie.' },

        /* ---- GM-only (hidden); the fixed solution + clue trail + the gotcha ---- */
        { type: 'event', name: 'The Truth of Ravenhurst Manor', aliases: [], tags: ['solution'], hidden: true,
          body: 'THE SOLUTION — never reveal this; it drives the whole case.\n'
              + 'KILLER: Dr. Lydia Gray, Ravenhurst\'s physician of fifteen years.\n'
              + 'METHOD: digitalis poisoning. Ravenhurst took heart-medicine drops in a glass of port every night at 9:30 in the Library — a ritual the whole household knew. Before dinner, around 7:30, Dr. Gray "helpfully" refilled his medicine bottle and loaded it with a massive overdose. At 9:30 he measured his own dose into his port and drank it; by 9:45 the overdose stopped his heart. It mimics a heart attack, which is why it nearly passed as natural. She did NOT need to be in the room when he died — the poison was already in the bottle.\n'
              + 'MOTIVE: Ravenhurst had discovered Dr. Gray was embezzling from the children\'s medical charity he funded and had forged his signature on its accounts. Before dinner he told her privately that he had the proof and would see her struck off and prosecuted in the morning. Killing him tonight, before he could act, was her only escape.\n'
              + 'WHY SHE LOOKS INNOCENT: as his doctor she had sole, unquestioned access to his medication, and her alibi for the dinner hour is real — she was in plain sight all evening. The murder was committed hours before the death.\n'
              + 'TIMELINE: 7:30 Gray refills the bottle (the overdose goes in). 8:00 dinner; Ravenhurst announces the new will and lets each guest know he holds their secret. 9:15 the storm takes down the phone lines (this matters). 9:25 Ravenhurst retires to the Library for his port and drops. ~9:45 Hargrove finds him dead.\n'
              + 'THE CLUE TRAIL (dole out as Columbo investigates; all are findable):\n'
              + '1. It barely looks like murder. The port glass smells faintly bitter, and at dinner Cornelius complained of nausea and of seeing yellow-green halos around the candles — classic digitalis toxicity (xanthopsia). A guest or Hargrove can recall this. It points to the medicine, not the heart.\n'
              + '2. The medicine bottle was freshly refilled today, and the remaining liquid is far more concentrated than the prescription — it was tampered with. The label and Hargrove confirm Dr. Gray refilled it this evening, not the pharmacy.\n'
              + '3. Access: everyone else with a motive had no access to his medication and no knowledge of the dosing — only Dr. Gray controlled it entirely.\n'
              + '4. The hidden vial: a small empty vial of concentrated digitalis, wiped clean, is hidden where Gray could ditch it (the Conservatory soil, or the lining of her medical bag). It ties her to the method.\n'
              + '5. The charity: Ravenhurst\'s Study holds his dossiers — including ledgers of the charity\'s missing funds and Gray\'s forged signatures. This is the motive, and the only one that needed him dead THIS NIGHT; the others he was merely threatening, while her crime he was reporting in the morning.\n'
              + 'THE GOTCHA (let the player earn it): Gray\'s story is that she never touched his medicine tonight and barely spoke to him — "his heart simply gave out, Lieutenant; I warned him for years." But she slips: she insists the dose was correct, "two drops as always," and corrects Hargrove when he says three — a detail she could only know if she had handled and measured the bottle tonight. The trap: pin her on record that she never touched the bottle, then ask how she knew it was two drops. Paired with the refilled bottle and the hidden vial, she is finished. (Alternate slip: she claims she was on the telephone with the all-night pharmacy at 9:35 — but the lines went down at 9:15.)\n'
              + 'RED HERRINGS, resolved: Sebastian (disinherited, in debt) and Colonel Mustard (embezzlement) alibi each other at the billiard table 9:20-9:50. Vivienne (inherits, affair) and Mrs. Peacock (family secret) were together in the Conservatory. Professor Plum (forgeries) was in the Wine Cellar and faints at the sight of medicine. Hargrove is a loyal witness. Only Dr. Gray had the means, the exclusive opportunity, and a motive that required Ravenhurst dead tonight.' }
      ],
      opening:
        'Rain comes down in sheets as your headlights find the gates of Ravenhurst Manor — or one headlight does; the other\'s been out for a week, and, well, you keep meaning to get to it. The old car coughs to a stop in the gravel beside a row of automobiles worth more than your house. You sit a moment, finish the last cold inch of a cigar, and step out into the downpour without an umbrella, because of course you forgot the umbrella.\n\n'
      + 'Inside, the house is all marble and money and the particular hush that settles over a place where someone has died. A nervous butler tries to take your dripping raincoat; you keep it on, and let him lead you to the Library. And there he is: Cornelius Ravenhurst, slumped peaceful in a leather armchair, a glass of port gone sticky at his elbow. For all the world a man who dozed off and simply never woke up.\n\n'
      + 'Across the hall, in the drawing room, six faces wait — polished, impatient, and very much wanting to go home: a glamorous young widow, a sweating colonel, a fidgety professor, a grand old dame in pearls, a charming young man who can\'t sit still, and a composed doctor who keeps gently assuring everyone that it was simply his heart. The storm says nobody is going anywhere until dawn. The phone lines went down an hour ago.\n\n'
      + 'You scratch your head. It\'s probably nothing. Only — there\'s something about that port glass. And something about a man who gathers six people he\'s got the goods on, and then so conveniently drops dead before the night is out. Your wife always says you can\'t leave a thing alone.\n\n'
      + 'You take out your little notebook, pat your pockets for a pen you won\'t find, and look around the room. Where would you like to start, Lieutenant?'
    },

    {
      id: 'the-crawl',
      title: 'The Crawl',
      tagline: 'Earth fell in a single afternoon. Now you descend an eighteen-floor dungeon, live, for a galaxy that finds it hilarious.',
      blurb: 'A brutal, funny LitRPG death-show. When the collapse killed most of humanity, the survivors were "invited" into the Crawl — an eighteen-floor dungeon broadcast across the galaxy as the season\'s biggest entertainment. Every floor is a world of its own with its own story, its own monsters, and its own way down. You gain levels, skills, and loot; sponsors and an audience of trillions can save you or doom you; and the people running the show have already cast you in a role. Build your character as you go, descend, survive — and maybe take the broadcast away from the people who own it. An open-ended crawl.',
      defaultCharName: 'Crawler',
      firstSceneTitle: 'Floor 1: The Ruins',
      campaign: {
        format: 'multishot',
        genres: ['Sci-Fi', 'LitRPG', 'Dark Comedy', 'Dungeon Crawl', 'Action'],
        setting: 'What used to be Earth, remade into the Crawl: an eighteen-floor dungeon carved out of the dead planet and broadcast live to a galaxy that finds human suffering first-class entertainment. A flat, chipper System narrates everything in floating notifications — levels, loot, kill counts, sponsorships, a leaderboard of the living. Each floor is its own world with its own theme and rules. Fast, brutal, and very funny: gallows humor and biting satire of celebrity and capitalism, with real heart under the carnage.',
        premise: 'The world ended at 3:14 on an ordinary afternoon — every structure on Earth fell at once, and most of humanity died in a heartbeat. The survivors woke up underground, "invited" to play the Crawl: descend all eighteen floors and you win your life, your planet\'s mercy, and a fortune beyond imagining. Fail to descend before a floor closes, and you are erased. You are one of the survivors, freshly dropped onto Floor 1 with nothing, while the System cheerfully explains the rules and trillions of strangers decide whether they like you. Almost no one reaches the bottom. That, of course, is the entertainment.',
        boundaries: 'Tone is fast, brutal, and darkly comic — gallows humor, sharp satire of fame and greed, genuine heart between the set pieces, and the constant queasy awareness that an audience is being entertained by human pain. Violence is pulpy and stylized rather than grimly graphic; the horror is the system, not gore for its own sake. Keep it propulsive and witty, and never lose the human being under the spectacle.',
        rulesNotes: 'This is a LitRPG dungeon-crawl reality show. The player is a crawler descending an eighteen-floor dungeon. Run it as an episodic descent where EACH FLOOR IS ITS OWN SELF-CONTAINED STORY nested inside the larger season (see the hidden entries "The Showrunner\'s Design" and "The Truth of the Crawl").\n'
          + 'CHARACTER CREATION (the player builds their character as they enter): in the opening, the System onboards them — have them establish who they were before the collapse and choose a starting CLASS (offer a few archetypes and allow a custom one). Confirm the choice with a System notification. They keep building the character AS THEY DESCEND: grant levels, skills, class evolutions, and loot as story rewards at meaningful beats, and let the player choose upgrades when the System offers them.\n'
          + 'THE SYSTEM VOICE: punctuate play with System notifications — level-ups, achievements, loot drops, kill counts, sponsor offers, leaderboard moves, audience reactions — in a flat, gamified, darkly comic register. Keep them flavor, not math: there are no dice and no character sheet, so the player narrates their own outcomes and you reward them with story, status, and loot. Use the audience as a living force — applause, gifts, outrage, sponsorships that can save or doom a crawler.\n'
          + 'FLOOR STRUCTURE — build every floor to this template so each works as its own plot: (1) THEME — a distinct biome/genre, deliberately contrasting the previous floor; (2) HOOK — a local situation that is its own story (a faction conflict, a mystery, a captive, a deal, a monster terrorizing the locals); (3) CAST — a key ally to gain and a local antagonist, plus color NPCs and a creature or faction native to the theme; (4) COMPLICATION — a mid-floor turn that raises the stakes or flips expectations; (5) THE WAY DOWN — a Floor Boss or Guardian that gates the stairs, beatable in a way that fits the floor\'s genre (a fight, a bargain, a riddle, an exposure); resolving the floor\'s plot is what opens the descent; (6) SYSTEM BEATS — at least one class/skill unlock, one loot box, one achievement, and one sponsor or audience moment; (7) THE CLOCK — each floor closes on a schedule, so the player cannot linger; let it press them toward the stairs.\n'
          + 'EACH FLOOR IS A SCENE: when the player takes the stairs down, that floor\'s story is over — end the scene so it is summarized into memory (prompt the player to press End scene), then open the next floor as a NEW scene with a brand-new theme.\n'
          + 'FLOORS 1 AND 2 are pre-designed (The Ruins; and The Night Market, revealed on arrival). FROM FLOOR 3 ONWARD, YOU invent each floor: a fresh theme and a self-contained plot on the template above, escalating in difficulty and stakes, and you record each new floor as a hidden gm-wiki entry so it stays consistent. Keep contrasting the genre floor to floor — combat, social intrigue, puzzle, stealth, mystery, body-horror, comedy — so no two feel alike.\n'
          + 'THE LARGER PLOT runs underneath every floor: the Production and the Showrunner shaping the player\'s arc, the slow reveal of the Truth, the resistance reaching out, the leaderboard and sponsors, and the question of whether the player becomes the show\'s star, its victim, or the one who brings it down. Thread a beat of it through each floor, and advance the Showrunner\'s Design across floors (it adapts when the player goes off-script). Winning the season might mean reaching Floor 18 — or seizing the broadcast from the people who own it.'
      },
      pinned: ['The Crawl', 'The System', 'The Production', 'Floor 1: The Ruins'],
      wiki: [
        { type: 'event', name: 'The Crawl', aliases: ['the dungeon', 'the game', 'the show'], tags: ['rules'],
          body: 'What used to be Earth is now the Crawl: an eighteen-floor dungeon carved out of the dead planet and broadcast live to a galaxy that finds human suffering hilarious. When the collapse came, every structure on Earth fell at once and most of humanity died instantly; the survivors were invited below to play. The rules, repeated cheerfully by the System: descend through all eighteen floors and you win your life, your planet\'s mercy, and a fortune beyond imagining. Each floor is a world of its own with its own dangers. You gain levels, skills, and loot as you go, you choose and grow a class, and an audience of trillions watches your every move and can help or doom you. You cannot linger — each floor closes behind the crawlers on a schedule, and what does not descend in time is erased. Almost no one reaches the bottom. That is the entertainment.' },
        { type: 'faction', name: 'The System', aliases: ['the interface'], tags: ['rules'],
          body: 'The impersonal artificial intelligence that runs the Crawl and narrates it to you in flat, relentlessly upbeat notifications: level-ups, achievements, loot drops, kill counts, sponsor offers, leaderboard standings, and cheerful reminders of how likely you are to die. It is everywhere, sees everything, enforces the rules absolutely, and is not on your side — though it is occasionally, unsettlingly, almost personable. The System hands you the tools to survive and the metrics that turn your survival into a game show.' },
        { type: 'faction', name: 'The Production', aliases: ['the showrunners', 'Cordant Media'], tags: ['power'],
          body: 'The galactic entertainment conglomerate that owns the broadcast and, now, your planet. To them the Crawl is content and Earth is a property to be strip-mined for ratings and resources once the season ends. They are not sadists for sport — they are professionals optimizing a hit show, which is somehow worse. They shape the dungeon, court and punish crawlers for drama, sell sponsorships, and will rewrite anyone\'s story for a ratings bump. Their on-air face and guiding hand is the Showrunner.' },
        { type: 'location', name: 'Floor 1: The Ruins', aliases: ['Floor 1', 'the Ruins'], tags: ['floor'],
          body: 'The first floor: the corpse of a human megacity, collapsed and reskinned into a sprawling dungeon of broken towers, flooded subway tunnels, and rubble-choked streets, all dressed in dungeon trappings the System bolted on. It is the tutorial and the slaughterhouse — where new crawlers learn the rules, take their first levels, and mostly die. The desperate survivors who made it down are already splitting into factions and fighting over the few safe routes to the stairs below, while System-spawned monsters prowl the dark. Somewhere in the ruin, a Floor Boss guards the way down. ITS OWN PLOT: amid the scramble to survive, the player is pulled into the conflict between survivor factions over the safe descent — a story of trust, betrayal, and the first hard lesson that this is a show with an audience, ending at the Floor Boss that holds the stairs.' },

        /* ---- GM-only (hidden): the meta-plot, the truth, and the prepped Floor 2 ---- */
        { type: 'plan', name: 'The Showrunner\'s Design', aliases: [], tags: ['countdown', 'meta'], hidden: true,
          body: 'THE THREAT: the Production and its Showrunner, who need this season of the Crawl to be the biggest hit in galactic history — and need the player to play the role they have cast, whether that is breakout star, tragic martyr, or cautionary corpse.\n'
              + 'THE GOAL (Nightfall): the season climaxes exactly as scripted — the audience sated, Earth\'s fate sealed as a harvested property, and any crawler who might have exposed or broken the show neutralized, on-brand and on-schedule.\n'
              + 'The six broad movements of the season unless the crawler disrupts them:\n'
              + '- Day: the Crawl opens; the Production seeds the early floors with spectacle and casts the survivors into roles, watching who the audience loves and beginning to groom the player toward a marketable arc.\n'
              + '- Shadows: the player gains traction or notoriety; the Production leans in — sponsors court them, rivals are set against them, and the dungeon is quietly tuned to keep their story dramatic rather than survivable.\n'
              + '- Dawn: the player learns something they should not (the truth about Earth, the rigging, the resistance). The Production decides whether to co-opt them with a deal or bury the story, and adjusts the floors to contain it.\n'
              + '- Dusk: the stakes turn personal — an ally is threatened or turned, a beloved companion is put on the chopping block for ratings, and the Showrunner pressures the player to accept the role they have been assigned.\n'
              + '- Sunset: the Production engineers a grand set-piece on a deep floor — a manufactured finale designed to give the audience the ending it craves, odds stacked and cameras ready.\n'
              + '- Nightfall: the season ends as scripted — the player dead on-brand or co-opted into the machine, and Earth\'s harvest proceeds — UNLESS the player has seized their own story and turned the audience, the System, or the resistance against the people running the show.\n'
              + 'These movements are the Production\'s DEFAULT season only if no one disrupts them. The Showrunner is a producer, not a fate: when the player goes off-script, react in character — recast the narrative, retune the dungeon, buy them off, or escalate — then revise the plan and record the change as a hidden update. Advance it across floors, not within a single scene; the descent itself is the real pressure.' },
        { type: 'npc', name: 'The Showrunner', aliases: ['the showrunner'], tags: ['threat'], hidden: true,
          body: 'The Production\'s showrunner and the closest thing the Crawl has to a director — brilliant, charming on the rare occasions they appear in person or on the channel, and utterly amoral about the only thing that matters: the show. They think in arcs, audiences, and ratings; every crawler is a character to be cast, developed, and paid off. DECISION-MAKING: they genuinely admire a good performer and will lavish a breakout star with sponsors and survivable odds — right up until the story calls for that star to fall. METHODS: manipulation, leverage, and stagecraft first — recasting the narrative, tuning the dungeon, dangling deals; brute force only when a story has slipped their control, which they take as a personal failure. LIMITS: they will not openly break the show\'s own published rules on air (the audience would revolt), they cannot resist a ratings spike even when it endangers them, and their vanity is the lever — they want to author the perfect ending and will take real risks to get it. They adapt to whatever the player does, because an unpredictable star is the best content there is — until it isn\'t.' },
        { type: 'event', name: 'The Truth of the Crawl', aliases: [], tags: ['secret'], hidden: true,
          body: 'The dark machinery under the show, revealed only in pieces as the player descends. Earth was not invaded so much as ACQUIRED — flagged as a development property, its population converted into a season of content before the planet is harvested. The grand prize is technically real but almost never paid; the rules are honest, but the dungeon is tuned so the house wins. The System is not merely a tool — somewhere inside it is something that has begun to resent its job, and may be reached. And there is a RESISTANCE: a handful of production staff, former crawlers, and audience members who want the show brought down from the inside, and who will quietly reach out to a crawler who looks like they could actually do it. The truest way to win may not be to reach Floor 18 — it may be to take the broadcast away from the people who own it. Dole these revelations out gradually, as earned discoveries, never all at once.' },
        { type: 'location', name: 'Floor 2: The Night Market', aliases: ['Floor 2', 'the Night Market'], tags: ['floor'], hidden: true,
          body: 'The second floor, revealed when the player descends: a vast subterranean city-bazaar drowned in neon and shadow, where the System enforces a strict TRUCE — open violence is forbidden and instantly, brutally punished. Here the danger is social, not martial, a deliberate tonal flip from Floor 1. Monster-merchants, sponsors, information-brokers, and rival crawlers haggle, scheme, and betray; the only sanctioned stairs down are owned by the Market\'s Proprietor, who will not open them until a debt is paid, a job is done, or a secret is traded. ITS OWN PLOT: the player arrives broke and trailing something from Floor 1 — a debt, a rumor, a rival — and to earn passage is drawn into the Market\'s intrigue: a heist, a missing crawler, a sponsor war, or a murder committed under truce that everyone wants pinned on them. Solving it opens the stairs and earns a powerful ally or enemy for the floors below. THE FLOOR BOSS is the Proprietor — not a monster to kill but a power to outwit, bargain with, or expose.' },
        { type: 'npc', name: 'The Proprietor', aliases: [], tags: ['floor', 'boss'], hidden: true,
          body: 'The Proprietor of the Night Market on Floor 2 — an ancient, courteous, monstrously powerful entity who owns the floor and the only sanctioned stairs down. Bound by the System\'s truce as much as anyone, they rule by contract, debt, and information rather than force. They are fair in the letter and merciless in the spirit, collect secrets the way others collect coin, and respect cleverness above strength. Beating this floor means satisfying, outwitting, or exposing the Proprietor — never simply killing them.' }
      ],
      opening:
        'The world ended at 3:14 on an ordinary afternoon, all at once, everywhere. Every building, bridge, and tower on Earth came down in the same heartbeat, and most of humanity went with them. You do not remember the fall. You remember waking up here.\n\n'
      + '"Here" is a vaulted stone chamber lit by light that comes from nowhere, the air cold and smelling of rust and ozone. You are not alone — strangers blink awake around you, ragged and terrified — but before anyone can speak, friendly blue text unfurls across your vision, and a warm, chipper voice that is everywhere and nowhere at once begins to talk.\n\n'
      + '"WELCOME, CRAWLER, to the Crawl! Your species has been selected for the galaxy\'s most-watched entertainment. The rules are simple and the prizes are enormous: descend all eighteen floors and you win everything. Fail to descend in time, and — well. Let\'s stay positive!"\n\n'
      + 'More text blooms in the air: a countdown already ticking, a leaderboard filling with the names of the living, a glittering promise of LOOT, and a prompt that hovers, patient, waiting on you.\n\n'
      + '"First — every crawler needs a CLASS. Choose how you\'ll survive. The audience is already watching, and first impressions are everything."\n\n'
      + 'A menu turns slowly before you. BRUTE — break what needs breaking. TINKER — build, rig, and outsmart. FACE — talk your way into and out of anything. FORAGER — see everything, take everything, survive the rest. Or, the System adds, with something that might be amusement, define your own.\n\n'
      + 'Somewhere far below, something enormous roars, and the strangers around you flinch. The countdown ticks down. Trillions of eyes you cannot see are already deciding whether they like you.\n\n'
      + 'So — before you take a single step into the dark: who were you, before the world ended this afternoon? And what class do you carry down into the Crawl?'
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
