# Cartographer's Table

A light-first virtual tabletop for one DM and 4–8 players. Spec, architecture and roadmap: [docs/SPEC.md](docs/SPEC.md).

## Develop

```sh
npm install
npm run dev      # local dev server with hot reload
npm test         # engine unit tests (Vitest)
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
```

## Layout

```
index.html        app shell (markup + styles)
src/engine/       grid, line of sight, lighting, generator — pure TypeScript, no DOM
src/render/       Canvas 2D renderer
src/store/        IndexedDB persistence, JSON import/export
src/ui/           panels, tools, inspector, save/load modals
src/state.ts      app state, undo stack, visibility cache
tests/            Vitest unit tests for the engine and JSON format
legacy/           prototype 1, the original single HTML file, kept for reference
```

## Deploy

Pushing to `main` builds, tests and publishes to GitHub Pages via `.github/workflows/deploy.yml`.
In the repository settings, set Pages → Source to **GitHub Actions** once.

## Playing together

There are two ways to run a session. Both use the same room code and the same player screen.

**From the website (no install).** Open the site, go to the Session tab and press Start session.
Your browser hosts the game directly over WebRTC; players open the join link or type the code.
The public PeerJS broker only introduces devices to each other; map data goes straight from your
browser to each player. Keep the DM tab open while playing.

**From a PC on your network (like a Minecraft server).** On any computer:

```sh
git clone https://github.com/AngusBlomley/dd.git && cd dd
npm install
npm run host
```

It prints the addresses. The DM opens the first one, players open the join link on the same Wi-Fi.

**Linked maps.** Place Exit and Entry props. Each map has a "next map", and each exit can point at a
different map from the Maps tab, so dungeons can fork. Characters that walk onto an exit go through
by themselves; walking onto an Entry takes them back.

**Letting players move.** In the Session tab, Movement chooses who can move characters: the DM only,
one player at a time (turn-based, with a movement budget), or everyone freely. Players drag their own
character, or tap it and then tap where to go. Every move is checked on the DM's device.
No internet is needed. The relay holds no game state; the DM's browser is still the source of truth,
so the DM can be on a tablet while the PC just relays. Forward the port on your router to let
players join from elsewhere.
