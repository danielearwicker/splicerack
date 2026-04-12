# SpliceRack

A YAML-driven video composition system. Define your video as segments in YAML — captions, clips, images, pauses — add text-to-speech narration, layer elements with a compositor, and render to a final video with FFmpeg.

## Features

- **YAML orchestration** — define your video structure declaratively
- **Segment types** — captions, video clips, HTML animations, images, pauses, and composited stacks
- **Templates** — reusable configurations for segments and audio, with property overrides
- **Audio system** — per-segment audio layers (native clip audio, TTS, audio files) mixed globally with overlap support
- **Text-to-speech** — Azure Speech integration with automatic caching
- **Render caching** — content-addressable caching means only changed segments re-render
- **Web UI** — library management, clip marking, visual sequence editor, property editor, render logs
- **Plugin architecture** — add new segment types by dropping files in a directory

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3344.

### Prerequisites

- Node.js 18+
- FFmpeg and FFprobe on PATH
- (Optional) Azure Speech credentials for TTS — set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_ENDPOINT`

#### Linux Only

Puppeteer prerequisites for HTML animation rendering:

```
sudo apt-get update && sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0
```

## How It Works

1. Upload media to the **Library** tab. Mark named clips on videos.
2. Create a project in the **Sequence** tab. Build your video in YAML or use the visual editor.
3. Click **Render**. Watch progress in the **Logs** tab.
4. Review the result in the **Outputs** tab.

## Example Project

```yaml
output:
  width: 1920
  height: 1080
  fps: 30
  background: "#1a1a2e"

templates:
  heading:
    type: caption
    duration: 3
    style:
      font-size: 64
      color: "#ffffff"
      background: "#1a1a2e"
    fade-in: 0.5
    fade-out: 0.5

  narrator:
    type: tts
    voice: en-GB-RyanNeural
    volume: 0.9

timeline:
  - type: heading
    text: "Welcome"

  - type: clip
    source: demo.mp4
    clip: intro
    audio:
      - type: narrator
        text: "Let me walk you through this feature."

  - type: heading
    text: "Thanks for watching!"
    style:
      color: "#e94560"
```

## Project Structure

```
server.ts                 # Express server, render pipeline, API
shared/                   # Extracted modules
  types.ts                #   TypeScript interfaces
  ffmpeg.ts               #   FFmpeg path resolution and helpers
  hash.ts                 #   Deterministic hashing
  deep-merge.ts           #   Deep merge utility
  yaml-utils.ts           #   YAML helpers
types/                    # Segment type plugins (auto-discovered)
  caption/                #   server.ts (renderer) + ui.ts (schema/UI) + ui.css
  clip/
  html/                   #   HTML/CSS animation via headless browser
  image/
  pause/
  stack/                  #   compositor — layers multiple segments
services/
  tts.ts                  # Azure Speech TTS with caching
  html-renderer.ts        # Puppeteer-based frame capture for HTML segments
ui/
  index.html              # Single-page app
  app.ts                  # UI logic
  type-registry.ts        # Client-side type registration
  style.css
docs/                     # Documentation
library/                  # Media files (created at runtime)
cache/                    # Render + TTS cache (created at runtime)
output/                   # Rendered videos (created at runtime)
```

## Documentation

See [docs/README.md](docs/README.md) for full documentation covering:

- [YAML structure](docs/yaml-structure.md)
- [Templates](docs/templates.md)
- [Render pipeline](docs/render-pipeline.md)
- [Caching](docs/caching.md)
- [Audio system](docs/audio.md)
- [Segment types](docs/README.md#segment-types) (caption, clip, html, image, pause, stack)
- [Audio layer types](docs/README.md#audio-layer-types) (source, tts, file)
- [API reference](docs/api.md)
- [Keyframe animation](docs/keyframes.md)
- [Adding new types](docs/adding-types.md)
- [Environment variables](docs/environment.md)
