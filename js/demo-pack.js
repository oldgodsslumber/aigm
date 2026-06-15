/* AI GM — built-in demo system pack: "Emberwood" (original mini-system).
 * Exists so the app is playable out of the box and exercises every
 * field type and three of the four roll types. Replace or ignore once
 * real packs are installed. */
window.DEMO_PACK = {
  id: 'emberwood-demo',
  builtin: true,
  public: true,
  meta: {
    name: 'Emberwood',
    system: 'Emberwood (demo)',
    version: '1.0',
    author: 'AI GM built-in'
  },
  sheetSchema: {
    sections: [
      {
        title: 'Essence',
        fields: [
          { id: 'body', label: 'Body', type: 'number', default: 2, hint: '1–5' },
          { id: 'mind', label: 'Mind', type: 'number', default: 2, hint: '1–5' },
          { id: 'heart', label: 'Heart', type: 'number', default: 2, hint: '1–5' }
        ]
      },
      {
        title: 'Condition',
        fields: [
          { id: 'grit', label: 'Grit', type: 'track', max: 5, default: 5 },
          { id: 'luck', label: 'Luck', type: 'track', max: 3, default: 3 },
          { id: 'resolve', label: 'Resolve', type: 'derived', expr: 'heart + grit' }
        ]
      },
      {
        title: 'Traits',
        fields: [
          { id: 'calling', label: 'Calling', type: 'text' },
          { id: 'bonds', label: 'Bonds', type: 'list' },
          { id: 'gear', label: 'Gear', type: 'list' }
        ]
      }
    ]
  },
  rollDefinitions: [
    {
      id: 'check', label: 'Check', type: 'target-number',
      dice: { count: 1, sides: 20 },
      difficulty: { default: 12 },
      when: 'any uncertain, risky act — modifier is the relevant Essence score'
    },
    {
      id: 'fate', label: 'Fate Dice', type: 'pool-count',
      dice: { count: 3, sides: 6 },
      countRule: { mode: 'threshold', min: 5 },
      when: 'the player spends Luck to twist fortune — count = Luck spent + 1'
    },
    {
      id: 'harm', label: 'Harm', type: 'sum',
      dice: { count: 1, sides: 6 },
      when: 'something injures a character — result is Grit lost'
    }
  ],
  gmPrompt: [
    'EMBERWOOD is a folk-fantasy world of deep woods, lantern-lit villages, and old bargains: cozy at the hearth, perilous past the treeline. Tone: warm, a little eerie, never grimdark. Magic is small, costly, and bound by etiquette — spirits take offense easily.',
    '',
    'RULES OF PLAY',
    '- Characters have three Essence scores: Body (strength, stealth, toil), Mind (lore, wit, craft), Heart (courage, charm, will). 2 is ordinary, 4 is remarkable, 5 is legendary.',
    '- When the outcome of a risky act is uncertain, call a "check": d20 + relevant Essence vs a difficulty you set. Easy 8, tricky 12, hard 16, foolhardy 19. Only roll when failure is interesting; otherwise just say yes.',
    '- Grit is health and morale in one (max 5). Injuries, exhaustion and despair cost Grit — call a "harm" roll when the source is violent or wild, or deduct 1 directly for lesser tolls. At 0 Grit the character is out of the action (unconscious, captured, lost) — never dead without the player choosing it. Rest at a safe hearth restores all Grit.',
    '- Luck (max 3) belongs to the player. They may spend 1–2 Luck before a check fails stands to roll "fate" dice (Luck spent + 1 dice; each 5+ is a boon you weave in: a lucky break, a kind stranger, a forgotten tool). Luck returns 1 per scene ended.',
    '- Bonds are people and promises. When a character acts in service of a Bond, difficulty drops one step. When a Bond is endangered, say so.',
    '',
    'RUNNING THE TABLE',
    '- Open scenes in motion. Describe with two senses, then offer a choice with teeth.',
    '- NPCs want things and say so. Name them; record the memorable ones in the wiki.',
    '- Failure moves the story sideways, never stops it: a cost, a complication, a worse path that still leads on.'
  ].join('\n'),
  templates: [
    {
      name: 'Wren the Wayfinder',
      sheet: {
        body: 2, mind: 3, heart: 4,
        grit: { current: 5, max: 5 },
        luck: { current: 3, max: 3 },
        calling: 'Wayfinder — reads paths, weather, and the moods of the wood',
        bonds: ['Marda, who raised me', 'The debt owed to the Miller of Hollow Ford'],
        gear: ['Walking staff', 'Brass lantern', 'Map with one deliberate error', 'Half a loaf, shared']
      }
    },
    {
      name: 'Tamsin Underbough',
      sheet: {
        body: 4, mind: 2, heart: 3,
        grit: { current: 5, max: 5 },
        luck: { current: 3, max: 3 },
        calling: 'Hedge-warden — keeps the old fences between farm and forest',
        bonds: ['My sister Bel, gone three winters', 'The Warden\'s Oath'],
        gear: ['Billhook', 'Iron nails (cold-forged)', 'Rope, twenty feet', 'A whistle that the dogs obey']
      }
    }
  ]
};
