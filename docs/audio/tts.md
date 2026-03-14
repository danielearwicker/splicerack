# TTS (Audio Layer)

Text-to-speech synthesis using Azure Cognitive Services Speech.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `text` | string | — | Text to synthesize |
| `voice` | string | — | Azure voice name (e.g., "en-GB-RyanNeural") |
| `volume` | number | 1 | Volume multiplier (0-2) |
| `delay` | number | 0 | Seconds to offset from segment start (can be negative) |
| `rate` | string | "0%" | Speech rate adjustment |
| `pitch` | string | "0%" | Pitch adjustment |

## Setup

Requires two environment variables:
- `AZURE_SPEECH_KEY` — your Azure Speech API key
- `AZURE_SPEECH_ENDPOINT` — your Azure endpoint (e.g., `https://uksouth.api.cognitive.microsoft.com/`)

The TTS endpoint is derived automatically from the region in your endpoint URL.

## Example

```yaml
- type: caption
  text: "Welcome"
  duration: 5
  audio:
    - type: tts
      text: "Welcome to our product demo."
      voice: en-GB-RyanNeural
      volume: 0.9
```

## With Templates

TTS layers work well with templates to avoid repeating voice/volume settings:

```yaml
templates:
  narrator:
    type: tts
    voice: en-GB-RyanNeural
    volume: 0.9

timeline:
  - type: caption
    text: "Section 1"
    audio:
      - type: narrator
        text: "In this section we'll cover..."
```

## Voice Selection

The UI populates a voice dropdown from the Azure API. Available voices depend on your Azure subscription and region. The voice list is cached to disk for offline use.

## Caching

TTS results are cached in `cache/tts/` by a hash of `{ text, voice, rate, pitch, volume }`. Identical synthesis requests are served from cache instantly.

## Timing

TTS audio runs for its full natural duration. If the speech is longer than the segment, it overlaps into subsequent segments. Use `delay` to offset the start — negative values start the audio before the segment begins.
