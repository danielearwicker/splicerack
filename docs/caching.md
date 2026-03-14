# Caching

SpliceRack uses content-addressable caching at two levels.

## Render Cache

**Location:** `cache/*.mp4`

Each segment's video output is cached by a SHA-256 hash of its settings (with keys sorted for determinism). The `audio` property is excluded from the hash since audio is mixed globally.

- First render: segment is rendered and cached
- Subsequent renders: if settings haven't changed, the cached file is copied directly
- Changing a segment's text, style, duration, etc. produces a different hash — cache miss, re-render
- Changing only audio settings — cache hit, only the final audio mix re-runs

### API

- `GET /api/cache` — returns `{ entries, totalSizeMB }`
- `DELETE /api/cache` — clears all cached segment files

## TTS Cache

**Location:** `cache/tts/*.mp3`

Azure Speech synthesis results are cached by a hash of `{ text, voice, rate, pitch, volume }`.

- Same text + same voice = instant cache hit (no API call)
- Voice list is also cached to disk at `cache/tts/_voices.json`

## Cache Resilience

Both cache directories are automatically recreated if deleted. Clearing the cache is always safe — it just means the next render will be slower.

## Stack Layer Caching

Stack layers are rendered through the same `renderCached()` function, so individual layers within a stack are cached independently. Changing one layer in a stack only re-renders that layer — the others come from cache.
