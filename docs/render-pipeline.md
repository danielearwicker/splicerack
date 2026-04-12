# Render Pipeline

When you click Render, the project goes through these stages:

## 1. Parse and Resolve

- YAML is parsed with `js-yaml`
- Templates are resolved: external templates (from `templates/` directory) are merged with inline project templates, then each segment's template name is replaced with a deep-merged copy of the template + the segment's overrides

## 2. Extract Elements

The resolved timeline is expanded into a flat list of renderable elements:

- Non-stack segments become a single element
- Stack segments are expanded into individual layer elements, each with their `delay` and `opacity`

## 3. Render Elements (Parallel)

Each element is rendered individually to a temporary alpha-capable `.mov` file.

- The element's settings (excluding `audio`) are hashed, including modification times of referenced library files
- If a cached file exists for that hash, it's copied directly (instant)
- Otherwise, the segment type's `render()` function is called
- The result is saved to cache for future use
- Keyframe post-processing (zoom/pan) is applied after rendering if the segment has a `keyframes` array

Rendering runs in parallel with a concurrency limit based on CPU count (2-6 workers).

All elements produce video-only output — audio is handled separately.

## 4. Build Compositing Plan

Each element's absolute start time is calculated from cumulative segment durations plus any layer delay. The pipeline probes each rendered element for its actual duration and builds a compositing plan with absolute timestamps.

## 5. Region-Based Compositing

The compositing plan is split into regions:

- **Simple regions**: a single element with no overlap. The element is converted from alpha-capable MOV to H.264 MP4 (with its own cache layer).
- **Complex regions**: multiple overlapping elements. FFmpeg's `filter_complex` composites them onto a background canvas with per-element timing (`overlay` with `enable` expressions), opacity (`colorchannelmixer`), and PTS shifting. The composite result is cached.

Both region types are rendered in parallel.

## 6. Concatenate Regions

The rendered region files are concatenated using FFmpeg's concat demuxer with `-c copy` (no re-encoding, very fast).

## 7. Collect Audio Layers

Each segment's absolute start time is calculated from the cumulative segment durations.

For every audio layer on every segment:
- Resolve audio templates (same as segment templates)
- Calculate absolute start time: `segment_start + delay`
- Resolve the audio source:
  - `source` — extract native audio from the clip's library video file
  - `tts` — synthesize via Azure Speech (cached by content hash)
  - `file` — load from library

Project-level `background-audio` layers are also collected (positioned at time 0).

## 8. Mix Audio

All audio layers are mixed into a single audio track using FFmpeg's `amix` filter:

- Each layer gets an `adelay` filter for its absolute start time
- Each layer gets a `volume` filter for its volume setting
- A silent track spanning the full video duration ensures the mix covers the entire video
- `amix` with `duration=longest` combines everything

## 9. Final Mux

The concatenated video and mixed audio are merged:
- Video: stream copy (no re-encoding)
- Audio: encoded as AAC 128kbps, 44.1kHz stereo

## Performance

- **Element caching** means unchanged segments render instantly on repeat runs
- **Region caching** means unchanged compositing regions are reused
- **H.264 conversion caching** means simple regions aren't re-encoded on repeat runs
- **Library file modification tracking** means editing a source file correctly invalidates affected caches
- **TTS caching** means identical speech text isn't re-synthesized
- **Parallel rendering** uses multiple CPU cores for element and region rendering
- **Region concatenation** is a fast copy operation
- **Audio mixing** is the only step that always runs (but it's audio-only, fast)
- Changing audio settings doesn't invalidate video cache
