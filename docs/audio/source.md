# Source (Audio Layer)

Extracts the native audio track from a clip segment's source video file.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `volume` | number | 1 | Volume multiplier (0 = silent, 1 = original, 2 = doubled) |
| `delay` | number | 0 | Seconds to offset from segment start (can be negative) |
| `mute` | boolean | false | Mute this layer entirely |

## Availability

Only available on `clip` segments (or templates that resolve to clip). The source audio is extracted from the original library video file at the clip's time range.

## Example

```yaml
- type: clip
  source: recording.mp4
  clip: demo
  audio:
    - type: source
      volume: 0.3
```

## How It Works

FFmpeg extracts the audio from the source video at the segment's start/end times, applies volume scaling, and outputs a WAV file. This is then positioned at the segment's start time in the global audio mix.
