# File (Audio Layer)

Plays an audio file from the library.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `source` | string | — | Audio filename from the library |
| `volume` | number | 1 | Volume multiplier (0-2) |
| `delay` | number | 0 | Seconds to offset from segment start (can be negative) |
| `loop` | boolean | false | Loop audio to fill the video duration |
| `mute` | boolean | false | Mute this layer entirely |

## Supported Formats

`.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`, `.m4a`

Upload audio files to the library the same way as video files (drag-and-drop or file browser).

## Example

```yaml
- type: pause
  duration: 3
  audio:
    - type: file
      source: transition-sound.mp3
      volume: 0.5
```

## Background Music

For music that spans the entire video, use `output.background-audio` instead of attaching to a specific segment:

```yaml
output:
  background-audio:
    - type: file
      source: chill-beats.mp3
      volume: 0.15
      loop: true
```
