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
