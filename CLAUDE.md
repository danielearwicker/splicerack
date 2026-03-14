# CLAUDE.md — SpliceRack

## What This Is

SpliceRack is a YAML-driven video composition system built with Express.js, FFmpeg, and a vanilla HTML/JS frontend. Users define videos declaratively in YAML (segments, templates, audio layers) and render them to MP4 via FFmpeg.

## Architecture

- **Server**: `server.js` — Express + WebSocket. Handles the render pipeline, API endpoints, static file serving. Single file, ~780 lines.
- **Type plugins**: `types/{name}/server.js` (FFmpeg renderer), `types/{name}/ui.js` (client-side schema/serialization), `types/{name}/ui.css` (badge styling). Auto-discovered at startup.
- **TTS service**: `services/tts.js` — Azure Speech integration with content-addressable caching.
- **Frontend**: `ui/` — single-page app. `app.js` is the main logic (~1900 lines). `type-registry.js` provides `SpliceRack.registerType()`. No build system — vanilla JS loaded via script tags.

## Key Design Decisions

- **Templates are unified**: both segment templates and audio templates live in the same `templates` section. Audio templates just happen to have `type: tts|file|source`.
- **Audio is global, not per-segment**: segments render video-only. All audio layers are collected with absolute timestamps and mixed in one FFmpeg pass after video concatenation. This allows audio to overlap across segment boundaries and supports negative delays.
- **Caching excludes audio**: the segment render cache hashes only video properties. Changing audio settings doesn't re-render video — only the final audio mix re-runs.
- **Stack compositor**: the `stack` type renders each layer via `renderCached()` (so layers get cached independently), then composites with FFmpeg overlay filters.
- **Filter scripts**: on Windows, FFmpeg filter strings containing font paths with colons are written to temp files and loaded via `-filter_script:v` or `-filter_complex_script` to avoid escaping issues.

## Common Tasks

- **Adding a segment type**: create `types/{name}/server.js`, `ui.js`, and optionally `ui.css`. See `docs/adding-types.md`.
- **Modifying the render pipeline**: the render loop is in `server.js` inside `POST /api/render/:filename`. Segment rendering → concat → audio collection → audio mix → final mux.
- **Modifying the UI editor**: property field rendering is in `app.js` in the `renderEditorPanel()` function. Audio layers editor is `buildAudioLayersEditor()`.
- **Template resolution**: server-side in `resolveTemplates()` and `deepMerge()`. Client-side equivalent in `resolveTemplate()` in `app.js`.

## Documentation

Full docs are in `docs/`. Start with `docs/README.md` for the index.

## Commands

```bash
npm install          # install dependencies
node server.js       # start server on port 3344
npm run restart      # kill port 3344 and restart
```

## Environment Variables

- `AZURE_SPEECH_KEY` — required for TTS
- `AZURE_SPEECH_ENDPOINT` — required for TTS (e.g., `https://uksouth.api.cognitive.microsoft.com/`)

## Dependencies

- Node.js 18+, FFmpeg/FFprobe on PATH
- npm packages: express, js-yaml, multer, ws
