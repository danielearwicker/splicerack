# Templates

Templates define reusable configurations. They work for both segment types and audio layer types — there's a single unified `templates` section.

## Defining a Template

A template has a `type` (the built-in type it's based on) and default property values:

```yaml
templates:
  heading:
    type: caption
    duration: 3
    style:
      font-size: 64
      color: "#ffffff"
      background: "#1a1a2e"
      align: center
      valign: middle
    fade-in: 0.5
    fade-out: 0.5

  narrator:
    type: tts
    voice: en-GB-RyanNeural
    volume: 0.9
```

## Using a Template

Reference a template by name as the `type`. Any properties you specify override the template defaults. Nested objects (like `style`) merge — you only need to specify the keys you want to change.

### Segment templates

```yaml
timeline:
  - type: heading
    text: "My Title"         # required — template doesn't set text
    style:
      color: "#e94560"       # overrides just the color; font-size, align, etc. inherited
```

### Audio templates

Audio templates work identically. If an audio layer's `type` isn't a built-in audio type (`source`, `tts`, `file`), it's looked up in `templates`.

```yaml
  - type: clip
    source: demo.mp4
    audio:
      - type: narrator       # resolved from templates
        text: "Welcome"      # override — template provides voice and volume
```

## Resolution

Templates are resolved via deep merge:

1. Start with the template's properties as the base
2. Overlay the segment/layer's own properties on top
3. For nested objects, merge recursively (segment values win)
4. The template's `type` determines which renderer is used

This means you can override any individual property without losing the rest of the template.
