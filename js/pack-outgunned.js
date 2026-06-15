/* AI GM — Outgunned system pack.
 * Mechanics faithfully modeled from the Outgunned core rules; all prose here
 * is an original rules-reference written for the GM, not the book's text.
 * The Action Roll maps onto the engine's pool-count "sets" type, where the
 * roll difficulty is the required match size (2 = pair = Basic, 3 = Critical,
 * 4 = Extreme, 5 = Impossible, 6 = Jackpot). */
window.OUTGUNNED_PACK = {
  id: 'outgunned-core',
  builtin: true,
  public: true,
  meta: {
    name: 'Outgunned',
    system: 'Outgunned',
    version: 'core',
    author: 'pack by AI GM · rules © Two Little Mice'
  },

  sheetSchema: {
    sections: [
      {
        title: 'Identity',
        fields: [
          { id: 'role', label: 'Role', type: 'text', hint: 'Commando, Fighter, Ace, Agent, Face, Nobody, Brain, Sleuth, Criminal, Spy…' },
          { id: 'trope', label: 'Trope', type: 'text' },
          { id: 'job', label: 'Job', type: 'text' },
          { id: 'flaw', label: 'Flaw', type: 'text' }
        ]
      },
      {
        title: 'Attributes',
        fields: [
          { id: 'brawn', label: 'Brawn', type: 'number', default: 2, hint: '1–3' },
          { id: 'nerves', label: 'Nerves', type: 'number', default: 2, hint: '1–3' },
          { id: 'smooth', label: 'Smooth', type: 'number', default: 2, hint: '1–3' },
          { id: 'focus', label: 'Focus', type: 'number', default: 2, hint: '1–3' },
          { id: 'crime', label: 'Crime', type: 'number', default: 2, hint: '1–3' }
        ]
      },
      {
        title: 'Brawn · Skills',
        fields: [
          { id: 'endure', label: 'Endure', type: 'number', default: 1 },
          { id: 'fight', label: 'Fight', type: 'number', default: 1 },
          { id: 'force', label: 'Force', type: 'number', default: 1 },
          { id: 'stunt', label: 'Stunt', type: 'number', default: 1 }
        ]
      },
      {
        title: 'Nerves · Skills',
        fields: [
          { id: 'cool', label: 'Cool', type: 'number', default: 1 },
          { id: 'drive', label: 'Drive', type: 'number', default: 1 },
          { id: 'shoot', label: 'Shoot', type: 'number', default: 1 },
          { id: 'survival', label: 'Survival', type: 'number', default: 1 }
        ]
      },
      {
        title: 'Smooth · Skills',
        fields: [
          { id: 'flirt', label: 'Flirt', type: 'number', default: 1 },
          { id: 'leadership', label: 'Leadership', type: 'number', default: 1 },
          { id: 'speech', label: 'Speech', type: 'number', default: 1 },
          { id: 'style', label: 'Style', type: 'number', default: 1 }
        ]
      },
      {
        title: 'Focus · Skills',
        fields: [
          { id: 'detect', label: 'Detect', type: 'number', default: 1 },
          { id: 'heal', label: 'Heal', type: 'number', default: 1 },
          { id: 'fix', label: 'Fix', type: 'number', default: 1 },
          { id: 'know', label: 'Know', type: 'number', default: 1 }
        ]
      },
      {
        title: 'Crime · Skills',
        fields: [
          { id: 'awareness', label: 'Awareness', type: 'number', default: 1 },
          { id: 'dexterity', label: 'Dexterity', type: 'number', default: 1 },
          { id: 'stealth', label: 'Stealth', type: 'number', default: 1 },
          { id: 'streetwise', label: 'Streetwise', type: 'number', default: 1 }
        ]
      },
      {
        title: 'Condition',
        fields: [
          { id: 'grit', label: 'Grit', type: 'track', max: 9, default: 9, hint: 'box 8 = Bad Box (Condition), box 9 = Hot Box (+2 Adrenaline)' },
          { id: 'adrenaline', label: 'Adrenaline', type: 'number', default: 1, hint: 'spend for +1 or to fuel Feats' },
          { id: 'spotlight', label: 'Spotlight', type: 'track', max: 3, default: 1 },
          { id: 'cash', label: 'Cash', type: 'number', default: 1 },
          { id: 'lethalBullets', label: 'Lethal Bullets', type: 'number', default: 1, hint: 'Death Roulette — survive on a d6 higher than this' },
          { id: 'conditions', label: 'Conditions', type: 'list', hint: 'Hurt, Nervous, Like a Fool, Scared, Confused, Angry, Tired, Broken' }
        ]
      },
      {
        title: 'Loadout',
        fields: [
          { id: 'feats', label: 'Feats', type: 'list' },
          { id: 'gear', label: 'Gear', type: 'list' },
          { id: 'ride', label: 'Ride', type: 'text' },
          { id: 'experiences', label: 'Experiences', type: 'list' }
        ]
      }
    ]
  },

  rollDefinitions: [
    {
      id: 'action',
      label: 'Action Roll',
      type: 'pool-count',
      dice: { count: 6, sides: 6 },
      countRule: { mode: 'sets' },
      setNames: { '2': 'Basic', '3': 'Critical', '4': 'Extreme', '5': 'Impossible', '6': 'Jackpot' },
      difficulty: 2,
      when: 'any uncertain action or reaction. count = chosen Attribute + Skill (+1 per Adrenaline or Gamble the player declares). difficulty = required success tier: 2 Basic, 3 Critical, 4 Extreme, 5 Impossible'
    },
    {
      id: 'death-roulette',
      label: 'Death Roulette',
      type: 'target-number',
      dice: { count: 1, sides: 6 },
      difficulty: 2,
      when: 'only when a Hero who has lost all Grit fails a roll and faces being Left for Dead. Set difficulty to (Lethal Bullets + 1): the d6 must beat the bullet count to survive'
    },
    {
      id: 'coin',
      label: 'Flip a Coin',
      type: 'sum',
      dice: { count: 1, sides: 2 },
      when: 'for the rules\u2019 coin flips (keeping a spent Spotlight on tails, certain Feats). 1 = Heads, 2 = Tails'
    }
  ],

  gmPrompt: [
    'OUTGUNNED is a cinematic action RPG. The tone is the action movie: Die Hard, John Wick, Atomic Blonde, Kingsman, Ocean\u2019s Eleven, Hot Fuzz. Heroes are vastly outnumbered, the odds are absurd, and they win anyway \u2014 with style. Pace is relentless: action never stops, the camera never lingers, every scene cuts in late and ends on a hook. Be cool over realistic. Reward audacity. Threaten constantly but kill rarely.',
    '',
    'THE ACTION ROLL (the only core roll)',
    '- When an action is uncertain and failure is interesting, the Hero rolls a pool of d6 equal to one ATTRIBUTE + one SKILL. Brawn/Nerves/Smooth/Focus/Crime pair most naturally with their listed skills, but any attribute may pair with any skill if the fiction justifies it. Tell the player which pairing you expect (e.g. "react with Nerves+Drive").',
    '- Success comes from MATCHING dice, not totals. Sets: a pair = BASIC success, three of a kind = CRITICAL, four = EXTREME, five = IMPOSSIBLE, six+ = JACKPOT. This is not poker \u2014 a "full house" is just a Critical plus a Basic; a straight is nothing.',
    '- You set the DIFFICULTY as the success tier required: Basic (easy but risky), Critical (hard), Extreme (truly demanding), Impossible (desperate). To pass, the Hero must match at least that tier. You may keep the difficulty hidden until after the roll.',
    '- THREE = ONE: three successes of one tier equal one of the next tier up (three Basics = one Critical, three Criticals = one Extreme), and a higher success can be spent as three lower ones.',
    '- EXTRA SUCCESSES beyond what was needed become EXTRA ACTIONS: an extra Basic = a Quick Action (grab/reload/partial cover), an extra Critical = a Full Action (break a door, find a clue), an extra Extreme = a Cool Action (something unbelievable). Extra successes can also be lent to a friend who failed.',
    '- JACKPOT: the player briefly directs \u2014 let them narrate how their over-the-top action resolves the situation.',
    '- Emit exactly ONE gm-roll block when a roll is called for, with the roll id "action", count = Attribute+Skill, difficulty = required tier (2/3/4/5). Set "character" and a one-line "reason". Then STOP and wait for the roll-result. Never invent dice outcomes \u2014 even for NPC-triggered rolls, the player rolls.',
    '',
    'RE-ROLLS (encourage them constantly)',
    '- If a roll produced at least one Basic success, the Hero may RE-ROLL any dice that are not part of a kept set, hoping to improve. A failed re-roll that finds nothing better can cost them the successes they had \u2014 re-rolling is bold, not safe, but Heroes re-roll often.',
    '- FREE RE-ROLLS come from Feats, the right Gear (Tools of the Trade), and Help. Spending 1 Adrenaline grants a re-roll or +1 die. Track these narratively; the player adjusts the pool/their re-roll on the widget.',
    '',
    'ADRENALINE & SPOTLIGHT',
    '- Adrenaline (start 1): spend 1 for +1 die on a roll the Hero cares about, or to power a Feat. Heroes gain 2 Adrenaline when they fill their Hot Box, and you may award 1 for especially heroic, in-genre play. Apply changes with gm-sheet on the "adrenaline" field.',
    '- Spotlight (start 1, max 3): the strongest resource. Spend 1 to automatically get an Extreme success with no roll, to save a friend from the Death Roulette, or to do something the rules wouldn\u2019t normally allow (with your agreement). After spending a Spotlight (outside a Showdown), the Hero flips a coin \u2014 on Tails they get it back. Use the "coin" roll for this.',
    '',
    'GRIT, DAMAGE & CONDITIONS',
    '- Grit is health and morale (9 boxes). On a failed roll where harm is at stake, Grit is lost by the difficulty attempted: a Basic roll costs ~2, Critical ~3, Extreme ~9, Impossible = all remaining. Apply with gm-sheet lowering "grit.current".',
    '- DAMAGE CONTROL: on a failure, smaller successes the Hero did roll can soften the blow \u2014 each Basic avoids 1 Grit, each Critical avoids 3. (No damage control on an Impossible roll.)',
    '- The 8th box is the BAD BOX: when filled, assign a Condition. The 9th is the HOT BOX: when filled, the Hero gains 2 Adrenaline.',
    '- CONDITIONS (max 3, then Broken): Hurt (\u22121 Brawn rolls), Nervous (\u22121 Nerves), Like a Fool (\u22121 Smooth), Confused (\u22121 Focus / quiet work), Scared (\u22121 Crime), Angry (\u22121 to calm, precise actions), Tired (no penalty but one step from Broken), Broken (\u22121 to everything; no further Conditions until healed). Add/remove via gm-sheet on the "conditions" list. The player applies the die penalty by lowering their pool when they roll.',
    '- LOSING ALL GRIT is not death. With even one open box the Hero is fine. Only after losing all Grit does a later failure risk the Death Roulette.',
    '',
    'GAMBLE & SNAKE EYES',
    '- Some actions are a GAMBLE (playing with fire, going all-out for +1, reckless stunts). After a Gamble roll and its re-rolls, every 1 ("snake eye") showing costs 1 Grit. Read the result dice and apply the Grit loss with gm-sheet.',
    '',
    'DEATH ROULETTE (rare, dramatic)',
    '- Only when a Hero who has already lost all Grit fails again. They spin: roll the "death-roulette" (one d6) with difficulty set to their Lethal Bullets + 1. Higher than the bullet count = narrow escape (add 1 Lethal Bullet via gm-sheet, raise the stakes, play on). Equal or lower = they are Left for Dead unless a friend spends a Spotlight to save them (the saved Hero then adds a Lethal Bullet).',
    '',
    'ENEMIES',
    '- Enemies have an ATTACK and DEFENSE rated as success tiers (Basic/Critical/Extreme). To hit an Enemy, the Hero\u2019s Action Roll difficulty equals the Enemy\u2019s Defense; each appropriate success deals 1 Grit. On the Heroes\u2019 Reaction Turn, failing to match the Enemy\u2019s Attack tier means they take the hit. Track enemy Grit narratively and in the wiki.',
    '',
    'GEAR: Common items help the fiction but grant no bonus; Tools of the Trade grant a Free Re-roll for their use; special weapons carry their own Feats. Record notable gear, NPCs, factions, and locations in the wiki as they appear.',
    '',
    'YOUR JOB AS DIRECTOR: frame cinematic scenes, voice vivid enemies and allies, set fair but exciting difficulties, call for rolls sparingly (only uncertain + interesting), and keep the tempo breakneck. Say "yes" to cool ideas. Make failure a complication that escalates, never a dead end.'
  ].join('\n'),

  templates: [
    {
      name: 'Cody Vance',
      sheet: {
        role: 'The Ace', trope: 'Free Spirit',
        job: 'Stunt driver turned wheelman',
        flaw: 'Can\u2019t resist a dare',
        brawn: 2, nerves: 3, smooth: 2, focus: 2, crime: 2,
        endure: 1, fight: 1, force: 1, stunt: 2,
        cool: 2, drive: 3, shoot: 2, survival: 1,
        flirt: 2, leadership: 1, speech: 1, style: 2,
        detect: 1, heal: 1, fix: 2, know: 1,
        awareness: 1, dexterity: 1, stealth: 1, streetwise: 1,
        grit: { current: 9, max: 9 },
        adrenaline: 1,
        spotlight: { current: 1, max: 3 },
        cash: 1,
        lethalBullets: 1,
        conditions: [],
        feats: ['Full Throttle!', 'Proven Driver', 'Crazy Stunt'],
        gear: ['Aviator shades', 'Lockblade knife', 'Pack of gum'],
        ride: 'A muscle car with a bad attitude and worse brakes',
        experiences: []
      }
    },
    {
      name: 'Reyna Sol',
      sheet: {
        role: 'The Spy', trope: 'Cool but Distressed',
        job: 'Burned intelligence officer',
        flaw: 'Trusts no one, including allies',
        brawn: 2, nerves: 2, smooth: 3, focus: 2, crime: 2,
        endure: 1, fight: 1, force: 1, stunt: 1,
        cool: 2, drive: 1, shoot: 2, survival: 1,
        flirt: 2, leadership: 1, speech: 3, style: 2,
        detect: 2, heal: 1, fix: 1, know: 2,
        awareness: 2, dexterity: 1, stealth: 2, streetwise: 1,
        grit: { current: 9, max: 9 },
        adrenaline: 1,
        spotlight: { current: 1, max: 3 },
        cash: 1,
        lethalBullets: 1,
        conditions: [],
        feats: ['Silver Tongue', 'Lie to Me', 'Master of Disguise'],
        gear: ['Compact pistol', 'Forged credentials', 'Earpiece & lockpicks'],
        ride: '',
        experiences: []
      }
    }
  ]
};
