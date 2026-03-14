# Stack

Composites multiple segment layers on top of each other with per-layer opacity and delay control.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `duration` | number | 0 (auto) | Total duration. 0 = derived from longest layer + delay |
| `background` | color | "#1a1a2e" | Base canvas color |
| `layers` | array | — | Ordered list of layer objects (bottom to top) |

## Layer Properties

Each layer is a regular segment (any built-in type except stack) plus two stack-specific properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `opacity` | number | 1 | Layer opacity (0 = transparent, 1 = opaque) |
| `delay` | number | 0 | Seconds before this layer starts within the stack |

Layers can use templates, just like timeline segments.

## Example

```yaml
- type: stack
  background: "#1a1a2e"
  layers:
    - type: heading
      text: "Left side"
      style:
        align: left
      opacity: 0.5
    - type: heading
      text: "Right side"
      style:
        align: right
      opacity: 0.5
```

## Compositing

1. A base canvas is created with the background color spanning the total duration
2. Each layer is rendered individually to a temp file (using the normal render + cache pipeline)
3. Layers are overlaid sequentially using FFmpeg's `overlay` filter
4. Opacity is applied via `colorchannelmixer` (alpha channel)
5. Delay is applied via `tpad` (transparent leading frames)

## Caching

Each layer is cached independently through `renderCached()`. Changing one layer only re-renders that layer — the others come from cache. The composite result is also cached as a whole.

## Constraints

- Stacks cannot be nested (the stack type is excluded from the layer type dropdown)
- Layers render as video-only — audio on stack layers should be placed on the stack segment itself
