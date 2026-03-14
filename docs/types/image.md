# Image

Displays a still image with optional animation (Ken Burns effect).

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `source` | file | — | Image filename from the library |
| `duration` | number | 5 | Display duration in seconds |
| `animation.type` | enum | "none" | "none", "ken-burns", "zoom", "pan" |
| `animation.from` | object | — | Start state: `{ x, y, scale }` |
| `animation.to` | object | — | End state: `{ x, y, scale }` |
| `fade-in` | number | 0.5 | Fade in duration (seconds) |
| `fade-out` | number | 0.5 | Fade out duration (seconds) |

## Animation

The `ken-burns`, `zoom`, and `pan` types animate between `from` and `to` states over the duration. Each state has:

- `x` — horizontal position (0 = left, 0.5 = center, 1 = right)
- `y` — vertical position (0 = top, 0.5 = center, 1 = bottom)
- `scale` — zoom level (1 = fill, 1.5 = 150%, etc.)

```yaml
- type: image
  source: photo.jpg
  duration: 6
  animation:
    type: ken-burns
    from: { x: 0.3, y: 0.3, scale: 1.2 }
    to: { x: 0.7, y: 0.5, scale: 1.5 }
  fade-in: 1
  fade-out: 1
```

## Rendering

Uses FFmpeg's `zoompan` filter for animation, or simple scaling for static display. Images are scaled to fill the output dimensions while maintaining aspect ratio.
