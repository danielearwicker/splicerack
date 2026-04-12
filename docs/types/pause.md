# Pause

A solid-color gap between segments.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `duration` | number | 1.5 | Pause duration in seconds |
| `background` | color | "#1a1a2e" | Background color |

## Example

```yaml
- type: pause
  duration: 2
  background: "#000000"
```

## Transparent Background

Like captions, the background supports transparency. Set `background` to `"transparent"`, an `rgba(...)` value, or an 8-character hex with alpha to render a transparent pause (useful as a spacer in stacks).

## Rendering

Generates a solid color frame for the specified duration using FFmpeg's `color` filter source. When a transparent background is specified, a transparent canvas is used instead.
