# Clip

Extracts a time range from a library video file, with optional speed adjustment and overlays.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `source` | file | — | Video filename from the library |
| `clip` | clip-name | — | Named clip (defined in the Library tab) |
| `start` | number | 0 | Start time in seconds (used if no `clip`) |
| `end` | number | 10 | End time in seconds (used if no `clip`) |
| `speed` | number | 1 | Playback speed (0.1 - 10x) |
| `fade-in` | number | 0 | Fade in duration (seconds) |
| `fade-out` | number | 0 | Fade out duration (seconds) |

## Clip Names

You can reference a time range by name instead of specifying `start`/`end`. Clips are created in the Library tab by marking in/out points on a video, giving the clip a name, and saving it.

```yaml
- type: clip
  source: "recording.mp4"
  clip: intro           # uses the saved "intro" clip's start/end times
```

## Speed

Adjusts playback speed. Values below 1 slow down; above 1 speed up. FFmpeg's `setpts` filter is used for video.

```yaml
- type: clip
  source: "recording.mp4"
  start: 10
  end: 30
  speed: 2              # plays at 2x speed, segment is ~10s long
```

## Native Audio

To include the clip's original audio, add a `source` audio layer:

```yaml
- type: clip
  source: "recording.mp4"
  clip: demo
  audio:
    - type: source
      volume: 0.5
```

## Rendering

1. Extracts the specified time range from the source video
2. Scales to output dimensions (maintains aspect ratio with pillarboxing/letterboxing)
3. Applies speed adjustment if speed != 1.0
4. Applies fade transitions
5. Outputs video-only (audio is handled by the global audio mixer)
