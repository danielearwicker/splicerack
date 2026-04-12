# CLAUDE.md — SpliceRack

## What This Is

SpliceRack is a YAML-driven video composition system built with Express.js, FFmpeg, and a vanilla HTML/JS frontend. Users define videos declaratively in YAML (segments, templates, audio layers) and render them to MP4 via FFmpeg.

## Architecture

- **Server**: `server.ts` — Express + WebSocket. Handles the render pipeline, API endpoints, static file serving. Single file, ~1300 lines. TypeScript executed via `node --experimental-strip-types`.
- **Type plugins**: `types/{name}/server.ts` (FFmpeg renderer), `types/{name}/ui.ts` (client-side schema/serialization), `types/{name}/ui.css` (badge styling). Auto-discovered at startup.
- **Shared utilities**: `shared/` — extracted modules: `types.ts` (TypeScript interfaces), `ffmpeg.ts` (FFmpeg path resolution and helpers), `hash.ts` (deterministic hashing), `deep-merge.ts`, `yaml-utils.ts`.
- **TTS service**: `services/tts.ts` — Azure Speech integration with content-addressable caching.
- **HTML renderer**: `services/html-renderer.ts` — Puppeteer-based frame capture for the `html` segment type.
- **Frontend**: `ui/` — single-page app. `app.ts` is the main logic (~2750 lines). `type-registry.ts` provides `SpliceRack.registerType()`. No build system — TypeScript is stripped to JS at serve-time via `ts-blank-space`.

## Key Design Decisions

- **Templates are unified**: both segment templates and audio templates live in the same `templates` section. Audio templates just happen to have `type: tts|file|source`.
- **Audio is global, not per-segment**: segments render video-only. All audio layers are collected with absolute timestamps and mixed in one FFmpeg pass after video concatenation. This allows audio to overlap across segment boundaries and supports negative delays.
- **Caching excludes audio**: the segment render cache hashes only video properties (plus modification times of referenced library files). Changing audio settings doesn't re-render video — only the final audio mix re-runs.
- **Region-based compositing**: the render pipeline splits the timeline into regions — "simple" (single element, no overlap) and "complex" (multiple overlapping elements). Each region is composited independently and cached, then all regions are concatenated.
- **Parallel rendering**: segments and regions are rendered in parallel with a concurrency limit based on CPU count.
- **Stack compositor**: the `stack` type renders each layer via `renderCached()` (so layers get cached independently), then composites with FFmpeg overlay filters.
- **External templates**: templates can be defined as individual YAML files in the `templates/` directory, managed via the Templates API. External templates are merged with inline project templates (inline overrides external).
- **Filter scripts**: on Windows, FFmpeg filter strings containing font paths with colons are written to temp files and loaded via `-filter_script:v` or `-filter_complex_script` to avoid escaping issues.

## Common Tasks

- **Adding a segment type**: create `types/{name}/server.ts`, `ui.ts`, and optionally `ui.css`. See `docs/adding-types.md`.
- **Modifying the render pipeline**: the render loop is in `server.ts` inside `POST /api/render/:filename`. Element extraction → parallel rendering → compositing plan → region-based compositing → concat → audio mix → final mux.
- **Modifying the UI editor**: property field rendering is in `app.ts` in the `renderEditorPanel()` function. Audio layers editor is `buildAudioLayersEditor()`.
- **Template resolution**: server-side in `resolveTemplates()` and `deepMerge()`. External templates from `templates/` directory are merged with inline project templates. Client-side equivalent in `resolveTemplate()` in `app.ts`.

## Documentation

Full docs are in `docs/`. Start with `docs/README.md` for the index.

## Commands

```bash
npm install          # install dependencies
npm start            # start server on port 3344
npm run restart      # kill port 3344 and restart
npm run typecheck    # run TypeScript type checking
npm test             # run tests
```

## Environment Variables

- `AZURE_SPEECH_KEY` — required for TTS
- `AZURE_SPEECH_ENDPOINT` — required for TTS (e.g., `https://uksouth.api.cognitive.microsoft.com/`)

## Dependencies

- Node.js 18+ (uses `--experimental-strip-types` for native TypeScript)
- FFmpeg/FFprobe on PATH
- npm packages: express, js-yaml, multer, ws, puppeteer (for HTML segment rendering), ts-blank-space (for browser-serving TypeScript)
