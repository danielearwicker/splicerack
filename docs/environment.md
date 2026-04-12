# Environment Variables

## Required for TTS

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_SPEECH_KEY` | Azure Cognitive Services API key | `abc123...` |
| `AZURE_SPEECH_ENDPOINT` | Azure endpoint URL | `https://uksouth.api.cognitive.microsoft.com/` |

The TTS endpoint (`{region}.tts.speech.microsoft.com`) is derived automatically from the region in your endpoint URL.

TTS is optional — SpliceRack works without it, but `tts` audio layers will produce warnings.

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3344` |

## Prerequisites

- **Node.js** 18+ (uses `--experimental-strip-types` for native TypeScript execution)
- **FFmpeg** and **FFprobe** on PATH
- **Chromium** — downloaded automatically by Puppeteer on `npm install` (required for the `html` segment type)
