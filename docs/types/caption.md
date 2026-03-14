# Caption

Renders text on a solid-color background.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `text` | string | "New caption" | The caption text |
| `duration` | number | 3 | Display duration in seconds |
| `style.font-size` | number | 48 | Font size in pixels |
| `style.color` | color | "#ffffff" | Text color |
| `style.background` | color | "#1a1a2e" | Background color |
| `style.align` | enum | "center" | Horizontal: "left", "center", "right" |
| `style.valign` | enum | "middle" | Vertical: "top", "middle", "bottom" |
| `fade-in` | number | 0.5 | Fade in duration (seconds) |
| `fade-out` | number | 0.5 | Fade out duration (seconds) |

## Example

```yaml
- type: caption
  text: "Welcome to the Demo"
  duration: 4
  style:
    font-size: 72
    color: "#e94560"
    background: "#0a0a1a"
    align: center
    valign: middle
  fade-in: 0.8
  fade-out: 1
```

## Rendering

Uses FFmpeg's `drawtext` filter with the system font. Text positioning is calculated from the align/valign settings. Filter scripts are written to files to avoid font path escaping issues on Windows.
