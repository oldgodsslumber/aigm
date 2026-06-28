# AI Game Master App — Vision Doc (v1)

## Audit Summary

**What was strong:** The core concept was already coherent — one app combining an AI GM loop, persistent campaign memory, dice facilitation, and sheet maintenance, on the established vanilla HTML + Firebase + GitHub Pages stack. The instinct to support both Gemini and a local LLM was kept, with the constraint properly scoped.

**Filled in during audit:**
- Scoped v1 to **solo play**; group sessions deferred but the data model (campaign membership, append-only logs) won't block them.
- LLM access: **each user supplies their own Gemini key**, stored in localStorage only, never in Firestore. Local LLM is a Jason-at-home backend via a configurable OpenAI-compatible endpoint URL.
- "RAG" resolved to **structured retrieval** (Option A): typed wiki entries with names/aliases/tags, deterministic context assembly, plus LLM-requested lookups. No embeddings in v1.
- **System-agnostic engine** defined as a System Pack format: sheet schema + declarative roll definitions + GM rules prompt + character templates. v1 ships with **two packs: Star Trek Adventures and Outgunned**.
- Character sheets are **schema-driven**; LLM-proposed changes **auto-apply with an undo log** (sheet state = append-only change log).
- All dice rolls are **visible and player-triggered**, including NPC/GM rolls. The LLM never invents roll results.
- Wiki entries are **auto-created from LLM proposals**, with aliases and a merge function to handle duplicates.
- Journal = **per-scene summaries generated during play**, which double as context compression.
- Pack authoring in v1 = **JSON upload + validation only** (no visual editor).
- **Desktop-first, mobile usable.**

**Assumptions made (please confirm or correct):**
- Roll definitions are **declarative JSON** interpreted by one roll engine (no per-system JS code). Supported roll types in v1: `sum`, `target-number`, `pool-count`, `2d20` (with complication range). STA's 2d20 quirks are the stress test for this format.
- Firestore pattern: **campaign-membership writes** — a campaign doc has `ownerUid` + `members[]`; only members read/write that campaign's subcollections. System packs are per-user (owner writes, any signed-in user can read public packs).
- Transcript and sheet log use **onSnapshot** (multi-device now, group play later); wiki and campaign list are fetch-once with manual refresh.
- Dark theme, clean and readable; narration text styled distinctly from UI chrome. Desktop layout: chat center, sheet panel right, dice/roll widgets inline in chat.
- Local-LLM mode assumes Chrome (HTTPS page → `http://localhost` is permitted there; Safari is not a support target for local mode). Oobabooga must run with its API enabled and CORS allowed for the GitHub Pages origin.
- Hard-delete only for campaigns (with a type-the-name confirm); everything inside a campaign is soft (undo log, merged-not-deleted wiki entries).

**Still open (needs your call before Claude Code starts):**
- App name and GitHub Pages repo/URL slug.
- Confirm which two pack documents you'll author first (assumed STA + Outgunned per the audit — confirm the specific STA edition).

---

## Overview

A browser-based AI Game Master for solo TTRPG play. The player picks a campaign, the app assembles context (system rules, character sheet, scene summaries, relevant wiki entries, recent transcript) and converses with an LLM acting as GM. The LLM requests dice rolls and sheet changes through a structured tag protocol; the app renders real roll widgets, applies sheet changes with an undo trail, and grows a campaign wiki and per-scene journal as play proceeds.

Stack: vanilla HTML/CSS/JS, no build step, Firebase Auth (Google sign-in) + Firestore, hosted on GitHub Pages. The `html-firebase-app` skill's defaults apply throughout.

## Views

1. **Campaign List** — landing page after sign-in. Cards for each campaign the user owns or belongs to; create-campaign flow (pick a system pack, name it, pick/create a character from the pack's templates).
2. **Play View** — the main screen. Chat transcript center; character sheet panel on the right (collapsible); roll widgets and sheet-change notices render inline in the chat; scene header at top with "end scene" control. Mobile: sheet becomes a slide-over.
3. **Wiki View** — browse/search entries by type (NPC, location, faction, item, event) and tag; edit entries; merge two entries; pin entries to the current scene.
4. **Journal View** — chronological list of scenes with their summaries; click through to the raw transcript of any scene.
5. **Pack Manager** — upload a system pack JSON, validate it (clear error messages on schema violations), list installed packs, view raw JSON.
6. **Settings** — LLM backend selection per campaign or globally: Gemini (user pastes their own API key; stored in localStorage, never synced) or Local (OpenAI-compatible base URL, default `http://localhost:5000/v1`); model name; token budget; temperature.

## System Pack Format

A pack is one JSON document containing:

- **meta** — name, system, version, author.
- **sheetSchema** — sections and fields that drive sheet rendering. Field types: `number`, `text`, `track` (current/max, e.g. stress), `list` (inventory), `derived` (computed from other fields by simple expression). Example: STA defines attributes (6 numbers), disciplines (6 numbers), stress track, determination track, values (list), focuses (list).
- **rollDefinitions** — named, declarative rolls the engine can execute. Each has a `type` (`sum` | `target-number` | `pool-count` | `2d20`) plus type-specific parameters (dice count, target source fields, success threshold, complication range, crit rules). Example: Outgunned's pool roll = `pool-count` of d6 counting matched sets; STA's task roll = `2d20` with target `attribute + discipline`, complications on 20.
- **gmPrompt** — the rules-knowledge document: how the system plays, when to call for rolls, difficulty guidance, tone. Authored by Jason, injected as part of the system prompt every turn.
- **templates** — zero or more starting character sheets.

v1 ships with two packs (STA and Outgunned), authored as JSON outside the app.

## The Tag Protocol

The GM prompt instructs the LLM to embed fenced blocks in its replies. The app parses them out of the response text (works identically on Gemini and local models — no function calling required):

- `gm-roll` — requests a roll: which rollDefinition, which character/NPC, difficulty, and a one-line reason. The app renders a roll widget; the player clicks; dice resolve client-side (`crypto.getRandomValues`); the structured result is sent back as the next message. **All rolls, including NPC rolls, are player-triggered and visible.**
- `gm-sheet` — proposes a sheet change as a field-level diff ("stress: 3 → 5"). Auto-applies, appends to the sheet log, and renders an inline notice with an Undo button.
- `gm-wiki` — proposes a new or updated wiki entry (type, name, aliases, body). Auto-creates/updates and renders a small inline notice linking to the entry.
- `gm-lookup` — requests wiki entries by name or tag. The app fetches matches and sends them back as a system-style message, then re-prompts.
- `gm-scene` — proposes a scene summary when the player ends a scene (player can edit before saving).

Malformed blocks render as plain text and are logged to console — never crash the turn.

## Context Assembly (the "RAG")

Every turn, the prompt is assembled deterministically, in priority order, against a configurable token budget (default sized for a 16k local model; Gemini gets a larger default):

1. System pack `gmPrompt` + protocol instructions (always)
2. Current character sheet state (always)
3. Scene summaries for all prior scenes in the campaign (oldest summaries truncate first)
4. Wiki entries pinned to the current scene
5. Wiki entries whose name or alias appears in the last N transcript turns
6. The last N raw transcript turns (current scene; N shrinks to fit budget)

No embeddings, no vector store. The LLM covers semantic gaps via `gm-lookup`. The schema keeps a clean upgrade path (entries are discrete typed docs) if vector retrieval is ever wanted later.

## Data Model (Firestore)

- `systemPacks/{packId}` — `{meta, sheetSchema, rollDefinitions, gmPrompt, templates, ownerUid, public: bool}`
- `campaigns/{campaignId}` — `{name, ownerUid, members: [uid], packId, settings, currentSceneId, createdAt}`
- `campaigns/{id}/characters/{charId}` — `{name, isNPC: bool, sheetState (cached current values), packId, createdAt}`
- `campaigns/{id}/sheetLog/{eventId}` — append-only: `{ts, charId, source: "llm"|"player"|"undo", diff, transcriptMsgId}`
- `campaigns/{id}/scenes/{sceneId}` — `{title, summary, status: "active"|"closed", pinnedEntryIds: [], startedAt, closedAt}`
- `campaigns/{id}/transcript/{msgId}` — `{role, content, sceneId, ts, blocks: [parsed gm-* blocks], rollResult?}`
- `campaigns/{id}/wiki/{entryId}` — `{type, name, aliases: [], tags: [], body, createdBy: "llm"|"user", mergedInto: null|entryId, updatedAt}`

Relationships: characters and wiki entries reference the campaign's pack; transcript messages reference their scene; sheetLog events reference the transcript message that caused them (for undo context). Sheet "truth" is the log; `sheetState` is a cached projection updated on every applied event.

**Write permissions:** campaign subcollections writable only by `ownerUid` + `members[]` of the parent campaign. Packs writable by their owner; readable by any signed-in user when `public`. (Membership exists now solely so group play later is a feature, not a migration.)

**Real-time vs fetch-once:** transcript, sheetState, and sheetLog via `onSnapshot`; campaign list, wiki, journal fetched on load with manual refresh.

## LLM Backends

- **Gemini** — user pastes their own API key in Settings; stored in localStorage only. Direct REST calls from the browser.
- **Local (OpenAI-compatible)** — configurable base URL; default targets Oobabooga's OpenAI extension. Requires Ooba launched with API + CORS for the GitHub Pages origin. Chrome-only support stance for local mode.

Both backends consume the same assembled prompt and the same tag protocol. Backend choice is a per-campaign setting with a global default. No proxy server in v1; the spec accepts that local mode only works on Jason's machines.

## Dice Engine

One engine interprets the pack's declarative rollDefinitions. v1 roll types: `sum` (XdY+Z), `target-number` (roll vs DC), `pool-count` (roll N dice, count successes/matches per rule), `2d20` (roll-under vs attribute+discipline target, complication range, extra-dice purchase). Randomness via `crypto.getRandomValues`. Every roll renders its individual dice, not just the outcome, and is stored on its transcript message.

## Milestones

- **M1 — Shell + chat loop.** Auth, campaign list, settings with both backends (key/URL entry), Play View with a plain freeform GM prompt (no packs yet), transcript persisted to Firestore. *Done when: I can sign in, create a campaign, and have a persistent GM conversation on either backend.*
- **M2 — System packs + sheets.** Pack JSON format, upload + validation, schema-driven sheet rendering, sheet log with undo (manual edits only at this stage). Author and load the STA and Outgunned packs. *Done when: both packs validate and render correct, editable sheets.*
- **M3 — Tag protocol + dice.** Parse gm-* blocks; roll widgets executing pack rollDefinitions; results returned to the LLM; gm-sheet auto-apply with inline undo. *Done when: the GM calls for an STA task roll, I click to roll, and the result drives the fiction and my stress track.*
- **M4 — Wiki + retrieval.** Wiki view, gm-wiki auto-creation, aliases, merge function, pinning, gm-lookup round-trip, name/alias matching in context assembly. *Done when: an NPC invented in play shows up in the wiki and gets pulled into context two sessions later.*
- **M5 — Scenes + journal + budget.** Scene lifecycle, gm-scene summaries with player edit, Journal View, full priority-ordered context assembly with token budget. *Done when: a long campaign stays under the local model's context limit and the GM still remembers act one.*
- **M6 — Polish.** Mobile-usable pass (slide-over sheet), empty states, error states (bad key, unreachable local endpoint, malformed pack), campaign delete with confirm.

## Out of Scope (v1)

Live multi-player group sessions; visual pack editor; vector embeddings; any proxy/server component; voice or TTS; image generation; importing rulebook PDFs; per-message Gemini cost tracking.

## Done Looks Like

I open the app on my desktop, resume my Outgunned campaign, and the GM picks up exactly where the last scene's summary left off — referencing an NPC it invented three sessions ago. It asks for a Critical roll; I tap the widget, the dice land on screen, and my grit track updates with an undo button under it. When the heist wraps, I end the scene, tweak the summary it drafted, and the wiki has quietly gained two new entries I can clean up later. Next week a friend signs in, pastes their own Gemini key, and starts their own campaign with the same packs — without me touching anything.

## Visual/UX Direction

Dark theme, clean and uncluttered. GM narration in a comfortable reading typeface, clearly distinct from UI chrome and player input. Roll widgets feel like dice, not forms. Desktop-first three-zone layout (transcript center, sheet right, scene header top); on mobile the sheet becomes a slide-over and everything else stacks.
