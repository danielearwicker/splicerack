# Pause

A solid-color gap between segments.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `duration` | number | 1.5 | Pause duration in seconds |
| `background` | color | (from output settings) | Background color |

## Example

```yaml
- type: pause
  duration: 2
  background: "#000000"
```

## Rendering

Generates a solid color frame for the specified duration using FFmpeg's `color` filter source.
