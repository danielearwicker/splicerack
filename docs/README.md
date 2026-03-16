# SpliceRack Documentation

SpliceRack is a YAML-driven video composition system. You define a project in YAML — segments, templates, audio layers — and SpliceRack renders it to a final video using FFmpeg.

## Core Concepts

- [YAML Project Structure](yaml-structure.md) — output settings, templates, timeline
- [Templates](templates.md) — reusable segment and audio configurations
- [Render Pipeline](render-pipeline.md) — how projects become videos
- [Keyframe Animation](keyframes.md) — zoom and pan within segments
- [Caching](caching.md) — content-addressable render and TTS caching
- [Audio System](audio.md) — per-segment audio layers, global mixing, TTS

## Segment Types

Each segment type occupies a slot in the sequence and renders to a video clip.

- [Caption](types/caption.md) — text on a solid background
- [Clip](types/clip.md) — a time range from a library video
- [Image](types/image.md) — a still image with optional animation
- [Pause](types/pause.md) — a solid-color gap
- [Stack](types/stack.md) — composite multiple layers with opacity and delay

## Audio Layer Types

Audio layers attach to segments and are mixed globally after video concatenation.

- [Source](audio/source.md) — native audio from a clip's video file
- [TTS](audio/tts.md) — text-to-speech via Azure Speech
- [File](audio/file.md) — audio file from the library

## Reference

- [API Endpoints](api.md) — server REST API and WebSocket events
- [Adding a New Type](adding-types.md) — how to create a new segment type plugin
- [Environment Variables](environment.md) — configuration
