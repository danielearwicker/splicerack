# Caching

SpliceRack uses content-addressable caching at multiple levels.

## Render Cache

**Location:** `cache/*.mov` (alpha-capable segment renders), `cache/h264_*.mp4` (H.264 conversions), `cache/region_*.mp4` (composite regions)

Each segment's video output is cached by a SHA-256 hash of its settings (with keys sorted for determinism). The `audio` property is excluded from the hash since audio is mixed globally. Modification times of referenced library files are included in the hash, so editing a source file invalidates affected caches.

- First render: segment is rendered and cached
- Subsequent renders: if settings haven't changed, the cached file is copied directly
- Changing a segment's text, style, duration, etc. produces a different hash — cache miss, re-render
- Changing only audio settings — cache hit, only the final audio mix re-runs
- Editing a library file (video, image, HTML) — cache miss for segments referencing that file

### Region Cache

After individual segments are rendered, the pipeline composites them into regions. Each region's composite result is also cached:

- **Simple regions** (single element): cached as `h264_*.mp4` after MOV-to-H.264 conversion
- **Complex regions** (overlapping elements): cached as `region_*.mp4` by a hash of the element content hashes, positions, opacities, and output settings

### API

- `GET /api/cache` — returns `{ entries, totalSizeMB }`
- `DELETE /api/cache` — clears all cached files (`.mov` and `.mp4`)

## TTS Cache

**Location:** `cache/tts/*.mp3`

Azure Speech synthesis results are cached by a hash of `{ text, voice, rate, pitch }`. Volume is not part of the cache key — it's applied during the audio mix stage, so changing volume doesn't re-synthesize.

- Same text + same voice = instant cache hit (no API call)
- Voice list is also cached to disk at `cache/tts/_voices.json`

## Cache Resilience

Both cache directories are automatically recreated if deleted. Clearing the cache is always safe — it just means the next render will be slower.

## Stack Layer Caching

Stack layers are rendered through the same `renderCached()` function, so individual layers within a stack are cached independently. Changing one layer in a stack only re-renders that layer — the others come from cache.
