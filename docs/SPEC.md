# Cartographer's Table — Spec & Roadmap

_Version 0.4 — 3 Sep 2026. Drafted from the prototype-1 HTML and the planning call; updated with the DM's answers. Hosting changed from Supabase to self-hosted. Status: Phases 0 to 4 done._

## 1. What we are building

A lightweight virtual tabletop for one DM and 4–8 players, built for a cave-heavy campaign (Out of the Abyss, Underdark). The DM builds and runs maps on a tablet behind the screen. Players open a link on a phone or a laptop, enter a room code and a name, and see only what the party can currently see. Light and line of sight are the core mechanic, not a premium add-on.

It is not a Roll20 clone. It is "Jackbox for dungeon maps": one host device, a short join code, everyone else is a viewer until the DM says otherwise.

**Non-goals for now:** character sheets, dice, rules automation, image-based maps, accounts, anything commercial. If it ever ships to other people it would be a one-time purchase, so nothing should depend on a paid service.

## 2. Where prototype 1 stands

Prototype 1 is a single HTML file (Canvas 2D, vanilla JS, ~1,500 lines) written with Claude Sonnet. It already has: terrain painting, walls and doors, props, tokens with vision and light, a seeded dungeon generator, DM/player view toggle with explored-fog memory, undo, PNG export, JSON export/import, pan and zoom.

The file is in the repo root as `dnd-map-builder.html`. Phase 0 moves it to `legacy/dnd-map-builder.html` so the new app can own the root.

### 2.1 Known bugs and their causes

| # | Symptom (from the call) | Root cause in prototype 1 | Fix |
|---|---|---|---|
| B1 | Monsters show up in Player View even when no PC can see them | `computeSceneVisibility` loops over **every** token. A monster's own vision (especially darkvision) marks the cells around it as seen, so it reveals itself. | Only party tokens (type `pc`, plus NPCs flagged "with the party") contribute to party vision. Monsters never do. |
| B2 | Darkvision / vision radius "busted" near walls; things leak through | Line of sight is a centre-to-centre Bresenham line per cell. It is asymmetric and lets sight leak through diagonal wall corners. Radius test uses `r + 0.4` which lets extra cells through at the edge. | Replace with symmetric shadowcasting (Albert Ford's algorithm). Symmetric: if A sees B then B sees A. Also faster: one pass per light/viewer instead of one line per cell. |
| B3 | Fog memory behaves oddly; DM "Preview Lighting" changes what players later see | `cellFogState()` sets `cell.ex = true` **during rendering**. Anything that draws the map in preview mode burns memory, and undo snapshots carry the fog with them. | Explored-fog is updated in one explicit state step after the party's vision is computed, never inside render. DM preview is read-only. |
| B4 | Changing a token's type does not change its colour | The create form only updates the colour picker; if "Place on Map" was already armed, the stale config is used. The inspector's type dropdown never touches colour at all. | Type sets the default colour unless the user has overridden it. Applies in both the create form and the inspector. |
| B5 | No select tool; hard to pick tokens up | "Select" mode only exists implicitly when the Tokens tab is opened. There is no button, no hotkey, and picking a terrain swatch silently leaves it. | Dedicated Select/Move tool with a toolbar button, hotkey `V`, `Esc` to deselect, click-drag to move, click-through to cells beneath. |
| B6 | Save does not work; JSON export/import does | Save, Load and Delete call `window.storage.set/get/list/delete`, an API that only exists inside the claude.ai artifact sandbox where the file was written. In any real browser that object is undefined, the call throws, and the "Could not save" alert appears. Export/Import never touch it, which is why they work. | Replace with IndexedDB-backed campaigns (see §5.3). Keep JSON export/import as the portable backup. |
| B7 | Only works on desktop | Mouse events only; no touch, no pinch zoom. | Pointer events + pinch/drag on the canvas. Required before phones can be used. |

Not a bug, but a limit: the render redraws every cell every frame and rebuilds visibility from scratch with a Bresenham line per cell. At 34×24 it is fine; at 100×80 with several lights it will stutter. Shadowcasting and a dirty-rect renderer fix this as a side effect of B2.

## 3. Requirements

Taken from the call. **Must** = needed before the group uses it at the table. **Should** = wanted, can land after. **Later** = explicitly deprioritised on the call.

### 3.1 Lighting and vision — Must (the "key thing")

- R1. In Player View a cell is drawn only if a party member has line of sight to it **and** it is lit, or it is within a party member's darkvision range.
- R1a. Every character can always see the cells next to it, even in total darkness (shown in greyscale like darkvision), so a party with no light is never completely blind. Issue #3.
- R2. Monsters, NPCs and hidden objects are invisible until they stand on a cell the party can currently see. They never reveal themselves.
- R3. Party vision is shared: what any PC sees, every player sees. Only player characters count; NPCs and monsters never reveal anything. Per-player "hardcore" vision is a later mode.
- R4. Light sources have a bright radius and a dim radius (5e: torch 20 ft bright / 20 ft further dim). Bright, dim, darkvision-only and unseen render distinctly.
- R5. Darkvision has a range (60 ft default, 120 ft option for drow / deep gnomes) and shows dark cells in greyscale.
- R6. Cells already seen stay as dimmed "memory" once vision moves away. Memory is a snapshot of what was there when the party last looked: DM edits in explored-but-unseen areas stay hidden until the party looks again. Memory is per map, shared by the party, and resettable by the DM.
- R7. Walls block sight, light and movement. Closed doors block sight and light. Pillars and statues block sight. Doors toggle open/closed.
- R8. The DM can preview exactly what the players see without changing anything.

### 3.2 DM editor — Must

- R9. Select/Move tool for tokens (B5). While dragging, a faint ghost stays at the starting cell until the token is set down, on both the DM and player screens. Issue #10.
- R9a. Selecting a door with the Select tool shows Open/Close, and for secret doors Reveal to players. Doors draw as a bar across whichever wall they sit in, horizontal or vertical, and swing aside when open. Issue #9.
- R9b. The Select tool selects any prop; props drag to another cell (carrying their exit link or treasure description) and can be removed from the inspector. Issue #17.
- R9f. Dragging the Select tool over empty ground selects an area. The panel shows what is inside and offers Remove props, Remove tokens, Remove walls & doors, or Remove everything; the Delete key removes everything. Dragging inside the selection moves its walls, doors, props, links, treasure and tokens together, leaving terrain and fog memory. Undo restores. Issue #25.
- R9c. Chests, treasure, crates and barrels carry a DM-written title and description and a "players can pick it up" flag. Players next to one get a Look button (or tap it) showing the text, and Take when allowed, which removes it from the map and logs who took it in the Session tab. Issue #18.
- R9e. NPC tokens carry a DM-written role and trade. Players tap an NPC they can see to read its name, role and trade. Player characters still show initials only, and monsters reveal nothing. Issue #22.
- R9d. Every prop can carry a DM-written name and description. Players tap any prop they can see to read it, with the prop's own facts (light, blocks sight or movement) when the DM wrote nothing. Take stays limited to chest-type props. Issue #21.
- R10. Layer panel with toggles: Terrain, Walls & Doors, Props, Tokens, Light overlay (bright/dim shading), Party vision overlay, Monster vision overlay, Fog memory, DM notes. Each is a visibility toggle; painting always goes to the layer the active tool belongs to.
- R11. Campaign > Maps structure. Opening a campaign lists its maps; the DM switches the live map at any time.
- R12. Save is automatic and local (IndexedDB). JSON export/import of a whole campaign or a single map stays as the backup and transfer format.
- R13. Works in the browser on the DM's tablet and laptop with no install.
- R14. Undo/redo, at least 25 steps.

### 3.3 Content — Should

- R15. More terrain: Underdark first (fungus floor, rough cave, chasm/pit, shallow water, deep water, mud, ice, crystal, webbing, moss). Overworld basics kept.
- R16. More props: fungus lantern, brazier, campfire, glowing crystal, glowing mushroom cluster (light-emitting), cage, boat, bridge, rope, cart, well, mushroom (large, blocks sight), stalagmite (blocks), portcullis (door variant), ladder, trapdoor, secret door (DM-only until revealed).
- R17. Token types stay free-form (PC / NPC / Monster / Object) with colour, size, vision and light. Add "hidden" flag for DM-only tokens. Players see tokens as colour plus initials only, no names.
- R18. Generator gains a cave theme that produces organic caverns (cellular automata) rather than rectangular rooms.
- R18a. Generating asks "new map or onto this map"; a new map keeps the current one and its tokens, generating onto the current map replaces its layout. Issues #6, #11.
- R18b. Every generated map gets an Entry. Placing a player character offers "at the arrival point" or "place freely"; monsters and everything else are always placed freely. Issue #12.
- R18c. Prefab rooms (tavern, home, shop, smithy, fishing dock, shrine, campsite, inn) stamp onto the map from a Prefabs tab with a hover outline. Issue #15.
- R18d. Prefabs rotate a quarter turn with R or the Rotate button before stamping. Issue #16.
- R18e. Dungeon prefabs: cell, prison block, spider den, mess hall, armoury; new props Iron Bars (block movement, not sight) and Weapon Rack. Issue #24.

### 3.4 Multiplayer session — Should (Prototype 3)

- R19. DM clicks "Start session" and gets a 4–5 character room code.
- R20. Player opens the site on a phone or a computer, enters the code and their name, nothing else. No accounts.
- R21. The DM sees who has joined and assigns each player a token (existing or new).
- R22. Players see the live map in Player View only, with pinch zoom on touch and scroll zoom on desktop. They cannot edit anything.
- R23. Everything the DM does is reflected on every player device within a second. Late joiners and reconnects get the full current state.
- R24. Changing the active map on the DM side changes it for everyone.
- R25. Works with 8 players on any mix of phones and laptops, on the same Wi-Fi or on mobile data.
- R25a. No hosted backend. The session runs from the DM's own device or from a PC on the group's network, like a Minecraft server. Nothing about a session is stored anywhere but the DM's device.
- R25b. Linked maps: an Exit prop on one map leads to an Entry on another. A character standing on an exit waits there until the DM sends them through; the player's screen says so. Players see the map their character is on.
- R25c. Each map has a "next map"; exits without a link of their own lead there, arriving at its first Entry or first open cell. The DM map labels every exit with where it leads, and a banner over the map with a Send Through button appears whenever a character is waiting at one. Issue #7.
- R25d. Joining shows progress (looking for the host, connecting, waiting for the DM) and errors in place, with the Join button disabled meanwhile. Issue #5.
- R25e. Every exit on a map can lead to a different map and entry, configured in the Maps tab, so dungeons can fork. Issue #13.
- R25f. A character that walks onto an exit goes through by itself when the destination has an Entry; walking onto an Entry takes them back to the exit that arrives there. If the exit leads nowhere, or the destination has no Entry, the player is told the DM will place them. Issue #14.

### 3.5 Turns and player movement — Later (Prototype 4)

- R26. The DM marks whose turn it is. Only that player can drag their own token. Movement is blocked by walls, closed doors, blocking props and other characters, and players can only path through cells they can see or remember. A character can never pass through another creature's cell or slip diagonally between two of them. Issue #4.
- R26a. A player can open or close a door next to their character by tapping it, in any movement mode; closed secret doors still read as walls. Issue #8.
- R27. Movement budget per turn (default 30 ft, 5 ft per cell, diagonals cost one cell); the player's top bar shows what is left. A "Next turn" button cycles through assigned players in join order. Three modes: DM moves everyone, turn-based, or free movement.
- R28. When a player is assigned a character, or their character changes map, their screen centres on it; a Find Me button recentres at any time. The Session tab's character dropdowns always include tokens placed after the tab was opened.
- R31. A map can be marked fully lit (daylight) in the Map tab: every cell counts as bright and players see everything in line of sight from where they stand, as far as walls allow. Ordinary doors, open or closed, do not block sight on a lit map; walls and unrevealed secret doors still do. Issues #26, #28.
- R32. Props rotate a quarter turn at a time (Rotate button or R with the prop selected) and the rotation reaches players. Doors can be forced across or up-down instead of following their wall. Issue #27.
- R30. Both maps draw at the screen's real pixel density (up to 4x) with smoothing on, so phones and tablets get a crisp map; pinch-zoom repaints at most once per frame. Issue #23.
- R29. On touch screens, tapping your own character arms tap-to-move ("Now tap where to go"), the next tap on a cell moves there, and tapping the character again cancels. A wobbly finger still counts as a tap. When movement is not allowed the tap says why (the DM moves the characters, or whose turn it is). Issues #19, #20.

### 3.6 Backlog — Later / maybe

- Per-player vision ("hardcore mode").
- Linked levels: stairs jump to another map in the campaign.
- Image import as a map background with a grid overlay (Dungeon Scrawl style maps).
- Measurement tool, area-of-effect templates.
- DM notes pinned to cells, shown only in DM view.
- Cloud save so the campaign follows the DM between devices.

## 4. The lighting and vision model

This section is the contract the engine is tested against.

**Grid.** Square cells, 5 ft each. Distances are in cells; the UI shows feet. Radii from 5e divided by 5.

**Occluders.** A cell is opaque if it is a wall, a closed door, or holds a prop with `blocksSight`. A cell is impassable if it is a wall, a closed door, or holds a prop with `blocksMove`.

**Field of view.** Symmetric shadowcasting from the viewer's cell, out to a radius. Opaque cells themselves are visible (you see the wall you are looking at), but nothing behind them. Result: a set of cells with their distance.

**Light map.** For every light source (prop light or token carrying light): cast FOV out to its dim radius. Cells within the bright radius get `bright`; cells beyond that, up to the dim radius, get `dim`. Light levels combine by taking the brightest.

**Party vision.** For every player character token: cast FOV out to `max(visionRadius, darkvisionRadius)`. For each cell in that FOV:

| Light at cell | Within darkvision range | Visible? | Rendered as |
|---|---|---|---|
| bright | any | yes | full colour |
| dim | any | yes | full colour, slightly darkened |
| dark | yes | yes | greyscale |
| dark | no | no | black, or memory if explored |

The party's visible set is the union over PC tokens. Every cell in it has its current appearance (terrain, wall, door state, prop) snapshotted into memory; memory renders from that snapshot, never from the live cell.

**Token visibility in Player View.** A token is drawn only if its cell is in the party's visible set, or it is a party token. Hidden tokens are never drawn in Player View.

**Monster vision.** Computed the same way per monster token, purely for the DM's "Monster vision" overlay. It never touches party vision or explored memory.

**Acceptance tests (these become unit tests):**

1. A monster with 12-cell darkvision standing in an unlit room with no PC nearby is not in the player render.
2. A PC with a torch in a straight corridor sees 4 cells bright, cells 5–8 dim, cell 9 not at all, in every direction.
3. Two wall cells touching only at a corner do not leak sight diagonally; a PC on one side does not see the cell on the other.
4. If PC A can see cell X, then a viewer on cell X can see A (symmetry).
5. A drow PC (24-cell darkvision) in a pitch-black cave sees 24 cells of greyscale and nothing beyond.
6. Toggling DM Preview on and off leaves the explored set unchanged.
7. Opening a door extends light through it; closing it stops it, in the same frame.

## 5. Architecture

### 5.1 Principle

The single HTML file mixes state, rules, rendering and DOM handlers in one closure, which is why bugs like B3 happen. The rewrite has one rule: **the engine never touches the DOM.** Everything in `engine/` is pure TypeScript over plain data, so lighting can be unit-tested and the same code runs on the DM's tablet and every phone.

```
┌────────────────────────────────────────────────────────┐
│  ui/        panels, tools, inspector, layer toggles     │  DOM
├────────────────────────────────────────────────────────┤
│  render/    canvas layers, fog, token sprites           │  Canvas 2D
├────────────────────────────────────────────────────────┤
│  net/       room codes, snapshots, patches, presence    │  Supabase Realtime
├────────────────────────────────────────────────────────┤
│  store/     campaigns in IndexedDB, JSON import/export  │  IndexedDB
├────────────────────────────────────────────────────────┤
│  engine/    grid, FOV, lighting, movement, generator    │  pure TS, tested
└────────────────────────────────────────────────────────┘
```

### 5.2 Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Catches the class of bug in B4 at compile time; Claude handles it well. |
| Build | Vite | Zero-config, outputs a static folder. |
| UI | Vanilla DOM + Canvas 2D (Preact is allowed for panels if they get fiddly) | Prototype 1 is already this; no framework tax on phones. |
| Tests | Vitest | Runs engine tests headless. Lighting acceptance tests live here. |
| Realtime | Two transports behind one interface: a LAN relay (`server/host.mjs`, WebSocket, ~150 lines, holds no state) and a browser host (WebRTC via PeerJS; the public broker only performs the handshake) | No hosted backend, no accounts. The relay is the "Minecraft server" mode and works with no internet; the browser host lets a tablet or phone run a session from the website. |
| Local persistence | IndexedDB via `idb-keyval`, one record per campaign, autosave | Handles campaigns of many maps without the 5 MB localStorage ceiling. |
| Hosting | GitHub Pages for the site; `npm run host` serves the same build from a PC | Static files only. The LAN host serves the built site itself, because a page loaded over https cannot open a plain WebSocket to a LAN address. |

**Alternatives considered for realtime**

- _Supabase Realtime._ The original plan. Dropped at the DM's request: no hosted service, nothing stored off the DM's device.
- _Cloudflare Workers + Durable Objects (PartyKit)._ An authoritative server with room persistence. More robust over the internet, but it is a hosted service. Revisit only if the browser host proves unreliable away from the table.
- _Manual WebRTC signalling (copy-paste offers)._ Zero third parties, but too clunky for eight phones at a table.

### 5.3 Data model

```ts
Campaign { id, name, createdAt, maps: MapId[], activeMapId }

GameMap {
  id, name, width, height, cellFeet: 5,
  terrain:   Uint8Array   // terrain id per cell
  walls:     Uint8Array   // 0 none, 1 wall, 2 door closed, 3 door open, 4 secret door
  props:     Prop[]       // { id, kind, x, y, rotation?, hidden? }
  tokens:    Token[]
  memory:    CellMemory[] // per cell: what the party last saw there, or null (fog memory)
  notes:     Note[]       // DM-only text pinned to cells
}

Token {
  id, name, kind: 'pc' | 'npc' | 'monster' | 'object',
  x, y, size: 1 | 2 | 3 | 4,          // cells per side
  colour, initials?,
  vision: { radius: number, darkvision: number },   // cells; 0 = none
  light?: { bright: number, dim: number },
  hidden?: boolean,      // DM-only, never sent to players
  ownerPlayerId?: string // set in a session when a player is assigned
}

Session {
  code: 'K7QX',
  dmId, activeMapId,
  players: { id, name, tokenId?, connected }[],
  turn?: { playerId, movementLeft }
}
```

Typed arrays keep a 100×80 map at about 8 KB per layer and make snapshots cheap to send.

### 5.4 Sync model

The DM's device is the single source of truth. Players never write state; in Prototype 4 they send **requests** that the DM's client validates and applies.

```
DM device (host)               relay or WebRTC data channel               Player device
────────────────               ────────────────────────────               ─────────────
Start session ──────────────▶  room K7QX
                                                        ◀──── join K7QX ─────────────── Enter code + name
                               ◀──── hello {playerId, name} ─────────────────────────
welcome, assign, snapshot ───▶ ────────────────────────────────────────────────────▶ render the party's view
edit a wall / move a token ──▶ patch {changed cells, see levels, tokens} ───────────▶ apply, re-render
send a character through ────▶ assign {new map}, snapshot ──────────────────────────▶ show the new map
                               ◀──── move-request {tokenId, to} ───────────────────── (Prototype 4, own turn only)
```

- **View** = the map as the party may know it. The host computes party vision first and sends, per cell, the live cell if it is currently seen, the memory snapshot if it was seen before, and nothing otherwise, plus a see-level and a light-intensity byte per cell for rendering. Closed secret doors are sent as walls. Hidden tokens and unseen monsters never leave the DM's device. Token names are stripped to initials and colour. Player devices render exactly what they are given; they do not recompute fog, so a curious player reading the traffic learns nothing the party cannot see.
- **Patch** = only the cells, see-levels and tokens that changed since the last message to that player. A new map or a changed size means a fresh snapshot.
- **Assignment** tells a player which map and token are theirs and whether they are waiting at an exit. A player's `playerId` lives in their browser, so a reconnect keeps their character.
- **Reconnect.** The player transport retries with backoff. If the DM's tab goes away, players see "The DM has disconnected" and pick up when it returns; the LAN relay keeps a room open for ten minutes for that.
- **Prototype 4.** Players send move _requests_. The DM's client checks it is their turn and the path is passable, applies the move, and broadcasts the patch.

### 5.5 Repository layout

```
dd/
├── index.html                 DM app and player app share one bundle; #/join/K7QX opens the player app
├── src/
│   ├── engine/    types.ts grid.ts fov.ts lighting.ts movement.ts generator.ts
│   ├── render/    canvas.ts layers.ts sprites.ts
│   ├── ui/        panels/ tools/ inspector.ts layers-panel.ts
│   ├── net/       protocol.ts views.ts host.ts transport.ts wsTransport.ts peerTransport.ts
│   ├── player/    app.ts (the player screen)
├── server/host.mjs  LAN relay: serves dist/ and forwards messages; holds no state
│   ├── store/     campaigns.ts json.ts
│   └── main.ts
├── tests/         fov.test.ts lighting.test.ts generator.test.ts
├── docs/SPEC.md   this file
└── legacy/dnd-map-builder.html   prototype 1, kept for reference
```

## 6. Roadmap

Phases are ordered by what the DM asked for: lighting first, then editor quality, then multiplayer, then turns last. Each phase ends in something usable at the table.

### Phase 0 — Foundations (small) — done

- Create the GitHub repo; move prototype 1 to `legacy/dnd-map-builder.html` and commit it.
- Vite + TypeScript + Vitest scaffold; GitHub Pages deploy on push to `main`.
- Port prototype 1 into `engine/ render/ ui/ store/` with no behaviour change.
- **Done when:** the live URL does everything prototype 1 did, and `npm test` runs.

### Phase 1 — Prototype 2: lighting done right (medium) — done

- Symmetric shadowcasting FOV (B2).
- Bright/dim/dark light model, darkvision ranges, greyscale rendering (R4, R5).
- Party-only vision; monsters hidden until seen (B1, R2).
- Explored memory as an explicit state step; DM preview is read-only (B3, R6, R8).
- Light and vision overlays in DM view (part of R10).
- Token colour follows type (B4); Select/Move tool with `V` / `Esc` (B5).
- Fog memory as a snapshot of what was last seen (Q4).
- Unit tests for the seven acceptance cases in §4.
- **Done when:** the DM can run a room-by-room reveal on the tablet with Player View and it looks right every time.

### Phase 2 — Editor and campaigns (medium) — done

- Layer panel with all toggles (R10).
- Campaign > Maps, IndexedDB autosave, campaign JSON export/import (R11, R12).
- Touch support: pointer events, pinch zoom, two-finger pan (B7).
- Underdark terrain and props pack, hidden tokens, secret doors (R15–R17).
- Cave generator (R18): cellular automata, single connected cavern, Underdark dressing.
- Undo/redo (R14), 40 steps, redo on Ctrl+Shift+Z / Ctrl+Y.
- Smooth light falloff through the dim band (Q2).
- Secret doors: look like a wall to players until revealed.
- **Done when:** the DM has prepared the first Out of the Abyss chapter as a campaign with several maps and can switch between them.
- _Note:_ persistence is one IndexedDB record per campaign, autosaved 600 ms after the last change and on page unload. Phase 0/1 single-map saves are folded into a "Saved maps" campaign on first launch.

### Phase 3 — Prototype 3: play together (medium–large)

- Supabase project, room codes, join screen (R19, R20).
- Snapshot/patch protocol with vision-filtered token lists (§5.4, R23).
- DM "Players" panel: who is here, assign token (R21).
- Player app: Player View only, phone layout (R22).
- Reconnect and late-join (R23), map switching (R24).
- **Done when:** a full session runs with players on a mix of phones and laptops and the DM on a tablet, on mobile data, for an evening without anyone refreshing.

### Phase 4 — Turns (small–medium) — done

- Movement modes in the Session tab: DM only, turn-based, free (R26).
- Pure `engine/movement.ts`: passability, 8-way shortest path with the corner rule, `validateMove` covering turn, budget, blockers and visibility; every player move is validated on the DM's device (R26).
- Turn controls: give turn, next turn, end turn, movement per turn, reset; turn-holder ring on the DM map (R27).
- Player screen: drag or tap-to-move your own character when allowed, turn and budget in the top bar, denial toasts, auto-centre and Find Me (R28).
- **Done when:** a combat runs with players moving themselves.

### Later

Backlog items in §3.6, in whatever order the table asks for them.

## 7. Open questions for the DM — answered 3 Sep 2026

1. **NPC vision.** Only PCs count. NPCs never contribute to what players see. _Applied: R3, R17, §4._
2. **Dim light.** Three levels: lit, dim, dark. Lit has a restricted radius that falls off to dim and then dark. _Applied: R4. The engine uses bright and dim radii per light and the renderer fades smoothly through the dim band._
3. **Player names on tokens.** Colours and initials only. _Applied: R17._
4. **Memory fog.** Players see explored areas, but changes made in areas they have explored and can no longer see are not visible to them. _Applied: R6 and §4; memory is a snapshot._
5. **Room persistence.** A "waiting for the DM" screen while the tablet reconnects is fine. _Applied: §5.4._
6. **Map sizes.** The current cap (100×80 cells) is enough.
7. **Roll20 / Dungeon Scrawl features.** Not yet reviewed.

## 8. Out of scope

Character sheets, dice, rules automation, image-based maps, accounts and payments, any DM-side feature that requires a paid service.
