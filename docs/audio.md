# Audio System

Audio in SpliceRack is a global layer on top of the video sequence. Audio layers are attached to segments but are not clipped to segment boundaries — they run their full natural length and can overlap freely.

## Per-Segment Audio

Any segment can have an `audio` array:

```yaml
- type: clip
  source: recording.mp4
  clip: demo
  audio:
    - type: source
      volume: 0.3
    - type: tts
      text: "Here we see the dashboard"
      voice: en-GB-RyanNeural
      delay: 1.5
```

### Timing

Each audio layer's start time is: **segment start time + delay**

- `delay` defaults to 0
- `delay` can be **negative** to start audio before the segment begins
- Audio plays for its full natural duration regardless of segment length
- Multiple audio layers from different segments can overlap

### Audio Layer Types

| Type | Description | Key Properties |
|------|-------------|----------------|
| `source` | Native audio from a clip's video file | `volume`, `mute` |
| `tts` | Azure Speech synthesis | `text`, `voice`, `volume`, `delay` |
| `file` | Audio file from library | `source`, `volume`, `delay`, `loop` |

See individual docs: [Source](audio/source.md), [TTS](audio/tts.md), [File](audio/file.md)

### Templates

Audio layers support templates. Define a template with an audio-related `type` (tts, file, source), then reference it by name:

```yaml
templates:
  narrator:
    type: tts
    voice: en-GB-RyanNeural
    volume: 0.9

timeline:
  - type: caption
    text: "Welcome"
    audio:
      - type: narrator
        text: "Welcome to the demo"
```

## Background Audio

Project-level audio that spans the entire video is defined in `output.background-audio`:

```yaml
output:
  background-audio:
    - type: file
      source: background-music.mp3
      volume: 0.15
      loop: true
```

## How Mixing Works

After video concatenation, all audio layers (per-segment + background) are collected with absolute timestamps. FFmpeg's `amix` filter mixes them into a single track:

1. Each layer gets `adelay` for its absolute start time (milliseconds)
2. Each layer gets `volume` scaling
3. A silent track spanning the full video duration is included to prevent truncation
4. The mixed audio is muxed with the video (video is stream-copied, audio encoded as AAC)
