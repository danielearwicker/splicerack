# API Reference

SpliceRack runs on port 3344 by default. The UI communicates via REST API and WebSocket.

## Library

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/library` | List media files. Query: `?type=audio\|video\|html\|image\|all` to filter |
| `POST` | `/api/upload` | Upload files (multipart/form-data, field: `files`) |
| `GET` | `/api/probe/:filename` | FFprobe metadata for a library file |
| `GET` | `/api/thumbnail/:filename` | JPEG thumbnail. Query: `?time=seconds` |
| `GET` | `/api/frame/:filename` | Full-resolution JPEG frame. Query: `?time=seconds`. For AI-assisted keyframe targeting |

## Clips

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/clips/:filename` | Get named clips for a video |
| `PUT` | `/api/clips/:filename` | Save clips. Body: `{ clips: [...] }` |

## Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List YAML project files |
| `GET` | `/api/project/:filename` | Load project (raw YAML + parsed object) |
| `PUT` | `/api/project/:filename` | Save project. Body: `{ raw: "yaml" }` or `{ parsed: object }` |

## Templates

External templates stored as individual YAML files in the `templates/` directory.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/templates` | List all external templates with name, type, and parsed content |
| `GET` | `/api/template/:name` | Get a single template (raw YAML + parsed object) |
| `PUT` | `/api/template/:name` | Create or update a template. Body: `{ raw: "yaml" }` or `{ parsed: object }` |
| `DELETE` | `/api/template/:name` | Delete a template |

## Rendering

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/render/:filename` | Start render. Returns `{ ok, output }` |
| `GET` | `/api/render/status` | Current render status |

## Cache

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cache` | Cache stats: `{ entries, totalSizeMB }` |
| `DELETE` | `/api/cache` | Clear render cache |

## TTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tts/voices` | List Azure Speech voices |
| `POST` | `/api/tts` | Synthesize speech. Body: `{ text, voice, ... }` |

## Outputs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/outputs` | List rendered output files |
| `DELETE` | `/api/outputs/:filename` | Delete an output |

## Static Files

| Path | Description |
|------|-------------|
| `/api/types.js` | Bundled UI definitions for all segment types (TypeScript stripped at serve-time) |
| `/api/types.css` | Bundled CSS for all segment types |
| `/api/shared.js` | Shared utilities (e.g. `deepMerge`) for the browser |
| `/app.js` | Main app logic (TypeScript stripped at serve-time) |
| `/type-registry.js` | Type registry (TypeScript stripped at serve-time) |
| `/card-list.js` | Card list component (TypeScript stripped at serve-time) |
| `/library/:filename` | Serve a library file |
| `/output/:filename` | Serve a rendered output |

## WebSocket Events

Connect to `ws://localhost:3344`. The server broadcasts these events:

| Event | Fields | Description |
|-------|--------|-------------|
| `library-updated` | — | A file was uploaded |
| `clips-updated` | `filename` | Clips were saved |
| `project-updated` | `filename` | A project file was saved |
| `templates-updated` | — | An external template was created, updated, or deleted |
| `render-started` | `filename` | Render began |
| `render-progress` | `segment`, `total`, `segmentType`, `cached` | Per-element progress |
| `render-phase` | `phase` | Status text ("Rendering 5 elements...", "Mixing audio...", etc.) |
| `render-complete` | `output`, `filename` | Render finished |
| `render-error` | `errors` | Render failed |
| `audio-warning` | `errors` | Non-fatal audio issues |
| `outputs-updated` | — | An output was deleted |
| `ffmpeg-slot` | `slot`, `label`, `line`, `done` | Live FFmpeg stderr output for a specific render slot |
| `ffmpeg-slots` | `count` | Reset/clear all FFmpeg output slots |
