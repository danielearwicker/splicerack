# HTML

Renders HTML/CSS content to video using a headless browser (Puppeteer). Supports CSS animations, JavaScript-driven content, and full alpha transparency.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `file` | file | — | HTML filename from the library (`.html` or `.htm`) |
| `html` | string | — | Inline HTML content (used if no `file`) |
| `duration` | number | 3 | Duration in seconds |
| `vars` | object | — | Custom variables for template substitution (YAML-only, not available in the visual editor) |

Either `file` or `html` must be provided.

## Variable Substitution

HTML content (whether from a file or inline) supports variable substitution using `{{name}}` syntax. Built-in variables:

| Variable | Value |
|----------|-------|
| `{{width}}` | Output width in pixels |
| `{{height}}` | Output height in pixels |
| `{{duration}}` | Segment duration in seconds |
| `{{fps}}` | Frames per second |
| `{{background}}` | Default background color |

Custom variables can be passed via `vars`:

```yaml
- type: html
  file: title-card.html
  duration: 5
  vars:
    title: "My Video"
    subtitle: "Episode 1"
```

In `title-card.html`, `{{title}}` and `{{subtitle}}` will be replaced.

## CSS Animations

CSS animations are paused and seeked frame-by-frame. The renderer captures each frame at the correct animation time, so CSS `@keyframes` and `transition` work as expected.

```yaml
- type: html
  duration: 4
  html: |
    <html>
    <head>
      <style>
        .title {
          font-size: 72px;
          color: white;
          animation: fadeSlide 4s forwards;
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(50px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="title">Hello World</div>
    </body>
    </html>
```

## JavaScript-Driven Content

For content that needs JavaScript updates per frame, listen for the `splicerack-frame` custom event:

```javascript
window.addEventListener("splicerack-frame", (e) => {
  const { timeMs, progress, duration } = e.detail;
  // timeMs: current time in milliseconds
  // progress: 0-1 normalized progress
  // duration: total duration in milliseconds
});
```

## Transparency

HTML segments render with full alpha transparency — the page background is transparent by default. This makes HTML segments ideal as stack layers for overlays, lower thirds, titles, etc.

## Example

```yaml
- type: html
  file: logo-intro.html
  duration: 3

- type: html
  html: "<html><body style='background:transparent'><h1 style='color:white'>Title</h1></body></html>"
  duration: 2
```

## Rendering

1. Puppeteer launches a headless Chromium instance
2. The HTML is loaded with all CSS animations paused
3. For each frame, animations are seeked to the correct time and a PNG screenshot is captured (with transparent background)
4. The PNG frame sequence is stitched into an alpha-capable video with FFmpeg

This approach supports any HTML/CSS/JS content, including web fonts, SVG, Canvas, and complex layouts.
