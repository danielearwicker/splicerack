# Keyframe Animation

Any segment can have a `keyframes` array that animates zoom and pan over the segment's duration. This is especially useful for screen recordings where you want to zoom into specific UI elements.

## Properties

Each keyframe has:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `time` | number | — | Time in seconds from segment start |
| `scale` | number | 1 | Zoom level (1 = full frame, 2 = 2x zoom, etc.) |
| `x` | number | 0.5 | Horizontal focal point (0 = left, 0.5 = center, 1 = right) |
| `y` | number | 0.5 | Vertical focal point (0 = top, 0.5 = center, 1 = bottom) |
| `ease` | string | "linear" | Interpolation: "linear" or "ease-in-out" |

## Example

```yaml
- type: clip
  source: screen-recording.mp4
  clip: full-demo
  keyframes:
    - time: 0
      scale: 1
      x: 0.5
      y: 0.5
    - time: 2
      scale: 2.5
      x: 0.3
      y: 0.2
      ease: ease-in-out
    - time: 6
      scale: 2.5
      x: 0.7
      y: 0.6
      ease: ease-in-out
    - time: 8
      scale: 1
      x: 0.5
      y: 0.5
      ease: ease-in-out
```

This zooms from a full view into the top-left area, pans across to the right side while staying zoomed, then zooms back out.

## Easing

- **linear** — constant-speed interpolation between keyframes
- **ease-in-out** — smooth acceleration/deceleration (smoothstep: `3t² - 2t³`)

## How It Works

Keyframes are applied as a post-processing step after the segment renderer produces its video. FFmpeg's `crop` and `scale` filters are used with per-frame expressions that interpolate between keyframes.

The crop maintains the output aspect ratio at all zoom levels. At `scale: 1`, the full frame is shown. At `scale: 2`, a half-size rectangle is cropped and scaled up, producing a 2x zoom effect centered on the `(x, y)` focal point.

## AI-Assisted Workflow

The frame extraction endpoint (`GET /api/frame/:filename?time=3.5`) returns a full-resolution JPEG frame from a library video. This enables Claude to:

1. Extract frames at specific timestamps
2. Visually identify UI elements you describe
3. Calculate the `x`, `y`, `scale` values to frame those elements
4. Generate the keyframes array for your YAML

Simply describe what you want to zoom into and when, and Claude can set up the keyframe sequence.
