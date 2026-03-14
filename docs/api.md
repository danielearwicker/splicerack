# API Reference

SpliceRack runs on port 3344 by default. The UI communicates via REST API and WebSocket.

## Library

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/library` | List media files. Query: `?type=audio\|video` to filter |
| `POST` | `/api/upload` | Upload files (multipart/form-data, field: `files`) |
| `GET` | `/api/probe/:filename` | FFprobe metadata for a library file |
| `GET` | `/api/thumbnail/:filename` | JPEG thumbnail. Query: `?time=seconds` |

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
| `PUT` | `/api/project/:filename` | Save project. Body: `{ raw: "yaml" }` |

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
| `/api/types.js` | Bundled UI definitions for all segment types |
| `/api/types.css` | Bundled CSS for all segment types |
| `/library/:filename` | Serve a library file |
| `/output/:filename` | Serve a rendered output |

## WebSocket Events

Connect to `ws://localhost:3344`. The server broadcasts these events:

| Event | Fields | Description |
|-------|--------|-------------|
| `library-updated` | — | A file was uploaded |
| `clips-updated` | `filename` | Clips were saved |
| `project-updated` | `filename` | A project file was saved |
| `render-started` | `filename` | Render began |
| `render-progress` | `segment`, `total`, `segmentType`, `cached` | Per-segment progress |
| `render-phase` | `phase` | Status text ("Concatenating video...", "Mixing audio...") |
| `render-complete` | `output`, `filename` | Render finished |
| `render-error` | `errors` | Render failed |
| `audio-warning` | `errors` | Non-fatal audio issues |
| `outputs-updated` | — | An output was deleted |
