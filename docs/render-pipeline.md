# Render Pipeline

When you click Render, the project goes through these stages:

## 1. Parse and Resolve

- YAML is parsed with `js-yaml`
- Templates are resolved: each segment's template name is replaced with a deep-merged copy of the template + the segment's overrides

## 2. Render Segments

Each segment is rendered individually to a temporary video-only `.mp4` file.

- The segment's settings (excluding `audio`) are hashed
- If a cached file exists for that hash, it's copied directly (instant)
- Otherwise, the segment type's `render()` function is called
- The result is saved to cache for future use

All segments produce video-only output — audio is handled separately.

## 3. Concatenate Video

The rendered segment files are concatenated using FFmpeg's concat demuxer with `-c copy` (no re-encoding, very fast).

## 4. Collect Audio Layers

Each segment's absolute start time is calculated from the cumulative segment durations.

For every audio layer on every segment:
- Resolve audio templates (same as segment templates)
- Calculate absolute start time: `segment_start + delay`
- Resolve the audio source:
  - `source` — extract native audio from the clip's library video file
  - `tts` — synthesize via Azure Speech (cached by content hash)
  - `file` — load from library

Project-level `background-audio` layers are also collected (positioned at time 0).

## 5. Mix Audio

All audio layers are mixed into a single audio track using FFmpeg's `amix` filter:

- Each layer gets an `adelay` filter for its absolute start time
- Each layer gets a `volume` filter for its volume setting
- A silent track spanning the full video duration ensures the mix covers the entire video
- `amix` with `duration=longest` combines everything

## 6. Final Mux

The concatenated video and mixed audio are merged:
- Video: stream copy (no re-encoding)
- Audio: encoded as AAC 128kbps, 44.1kHz stereo

## Performance

- **Segment caching** means unchanged segments render instantly on repeat runs
- **TTS caching** means identical speech text isn't re-synthesized
- **Video concat** is a fast copy operation
- **Audio mixing** is the only step that always runs (but it's audio-only, fast)
- Changing audio settings doesn't invalidate video cache
