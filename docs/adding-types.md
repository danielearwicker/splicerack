# Adding a New Segment Type

Segment types are self-contained plugins. Each type is a directory under `types/` with up to three files.

## Directory Structure

```
types/
  my-type/
    server.js    # Required: rendering logic
    ui.js        # Required: UI definition
    ui.css       # Optional: badge color and styles
```

## server.js

Export a default object with `type` and `render()`:

```javascript
export default {
  type: "my-type",

  async render(seg, outFile, ctx) {
    // seg: the resolved segment object from the YAML
    // outFile: path to write the output .mp4
    // ctx: render context with helpers

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      // ... your FFmpeg arguments ...
      outFile,
    ], { maxBuffer: 50 * 1024 * 1024 });
  },
};
```

### Render Context (`ctx`)

| Property | Description |
|----------|-------------|
| `width`, `height`, `fps` | Output video dimensions and frame rate |
| `defaultBg` | Default background color from output settings |
| `defaultFont` | System font path (escaped for FFmpeg) |
| `buildFadeFilter(seg, duration)` | Returns FFmpeg fade filter string |
| `resolveClip(seg)` | Returns `{ start, end }` for a clip segment |
| `readClips(filename)` | Returns clip array for a library video |
| `writeFilterScript(filter)` | Writes filter to a temp file, returns path |
| `LIBRARY_DIR` | Path to the library directory |
| `OUTPUT_DIR` | Path to the output directory |
| `execFileAsync` | Promisified `child_process.execFile` |
| `existsSync`, `join` | Node.js fs/path helpers |
| `rendererRegistry` | Map of type name to renderer (for stack-like composition) |
| `renderCached(seg, outFile, ctx)` | Render a segment with caching |

## ui.js

Register the type with the client-side type registry:

```javascript
SpliceRack.registerType("my-type", {
  schema: [
    { key: "text", label: "Text", type: "string", default: "Hello" },
    { key: "duration", label: "Duration", type: "number", default: 3, min: 0.1, max: 300, step: 0.1 },
    // ... more fields
  ],

  badgeColor: { bg: "#2d3a87", fg: "#8ab4f8" },

  defaults() {
    return {
      type: "my-type",
      text: "Hello",
      duration: 3,
    };
  },

  sequenceDisplay(seg) {
    return {
      title: seg.text || "My Type",
      detail: `${seg.duration || 3}s`,
    };
  },

  serialize(seg, lines) {
    // Append YAML lines for this segment's properties
    if (seg.text) lines.push(`    text: "${seg.text}"`);
    if (seg.duration) lines.push(`    duration: ${seg.duration}`);
  },
});
```

### Schema Field Types

| Type | Renders As |
|------|-----------|
| `string` | Text input |
| `number` | Numeric input (supports `min`, `max`, `step`) |
| `color` | Color picker + hex text input |
| `dropdown` | Select. Requires `options: ["a", "b", "c"]` |
| `file` | Dropdown of library video files |
| `clip-dropdown` | Dropdown of clips for the segment's source video |
| `layers` | Layer list editor (used by stack) |

Fields support `condition: (seg) => boolean` to conditionally show/hide.

## ui.css

Optional. Define the badge color for the sequence:

```css
.seg-type-my-type { background: #2d3a87; color: #8ab4f8; }
```

## Auto-Discovery

The server discovers types by scanning `types/*/server.js` at startup. The UI loads all `types/*/ui.js` and `types/*/ui.css` via the `/api/types.js` and `/api/types.css` bundle endpoints. No registration in a central file is needed.
