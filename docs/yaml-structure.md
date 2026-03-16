# YAML Project Structure

A SpliceRack project is a YAML file with three sections: `output`, `templates`, and `timeline`.

## Output Settings

```yaml
output:
  width: 1920              # Video width in pixels
  height: 1080             # Video height in pixels
  fps: 30                  # Frames per second
  background: "#1a1a2e"    # Default background color (hex)
  background-audio:        # Optional global audio layers
    - type: file
      source: background-music.mp3
      volume: 0.15
      loop: true
```

## Templates

Reusable configurations for segments or audio layers. See [Templates](templates.md).

```yaml
templates:
  heading:
    type: caption
    duration: 3
    style:
      font-size: 64
      color: "#ffffff"
    fade-in: 0.5
    fade-out: 0.5

  narrator:
    type: tts
    voice: en-GB-RyanNeural
    volume: 0.9
```

## Timeline

An ordered list of segments. Each segment has a `type` — either a built-in type or a template name.

```yaml
timeline:
  - type: heading
    text: "Welcome"

  - type: clip
    source: demo.mp4
    clip: intro
    audio:
      - type: narrator
        text: "Let me walk you through this."

  - type: pause
    duration: 1
```

## Audio Layers

Any segment can have an `audio` array. Audio layers are positioned by their segment's place in the sequence plus an optional `delay` (which can be negative). Audio runs its full natural length regardless of segment boundaries.

```yaml
  - type: clip
    source: recording.mp4
    clip: demo
    audio:
      - type: source
        volume: 0.3
      - type: narrator
        text: "Here we can see the dashboard."
        delay: 1.5
```

See [Audio System](audio.md) for details.
