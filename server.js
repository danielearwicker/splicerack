import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import multer from "multer";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, basename, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { copyFileSync } from "fs";
import yaml from "js-yaml";
import { loadTypes } from "./types/index.js";
import { buildFadeFilter, buildKeyframeFilter } from "./types/_helpers.js";
import { getVoices, synthesize } from "./services/tts.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_DIR = process.cwd();
const LIBRARY_DIR = join(PROJECT_DIR, "library");

// Ensure library directory exists
if (!existsSync(LIBRARY_DIR)) {
  mkdirSync(LIBRARY_DIR, { recursive: true });
}

const TEMPLATES_DIR = join(PROJECT_DIR, "templates");
if (!existsSync(TEMPLATES_DIR)) {
  mkdirSync(TEMPLATES_DIR, { recursive: true });
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(join(__dirname, "ui")));

// Serve bundled type UI scripts and styles (concatenated from types/*/ui.js and ui.css)
const TYPES_DIR = join(__dirname, "types");

function getTypeDirs() {
  return readdirSync(TYPES_DIR)
    .filter(f => !f.startsWith("_") && !f.startsWith(".") && !f.endsWith(".js"))
    .filter(f => statSync(join(TYPES_DIR, f)).isDirectory());
}

app.get("/api/types.js", (req, res) => {
  let bundle = "";
  for (const dir of getTypeDirs()) {
    const uiPath = join(TYPES_DIR, dir, "ui.js");
    if (existsSync(uiPath)) {
      bundle += readFileSync(uiPath, "utf-8") + "\n";
    }
  }
  res.type("application/javascript").send(bundle);
});

app.get("/api/types.css", (req, res) => {
  let bundle = "";
  for (const dir of getTypeDirs()) {
    const cssPath = join(TYPES_DIR, dir, "ui.css");
    if (existsSync(cssPath)) {
      bundle += readFileSync(cssPath, "utf-8") + "\n";
    }
  }
  res.type("text/css").send(bundle);
});

// Serve library video files
app.use("/library", express.static(LIBRARY_DIR));

// Upload videos to library
const storage = multer.diskStorage({
  destination: LIBRARY_DIR,
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

app.post("/api/upload", upload.array("files"), (req, res) => {
  const uploaded = req.files.map((f) => f.originalname);
  broadcast({ type: "library-updated" });
  res.json({ uploaded });
});

// List library files
app.get("/api/library", async (req, res) => {
  try {
    const files = readdirSync(LIBRARY_DIR)
      .filter((f) => {
        const ext = extname(f).toLowerCase();
        const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
        const audioExts = [".mp3", ".wav", ".aac", ".ogg", ".flac", ".m4a"];
        const htmlExts = [".html", ".htm"];
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
        const typeFilter = req.query.type;
        if (typeFilter === "audio") return audioExts.includes(ext);
        if (typeFilter === "video") return videoExts.includes(ext);
        if (typeFilter === "html") return htmlExts.includes(ext);
        if (typeFilter === "image") return imageExts.includes(ext);
        if (typeFilter === "all") return true;
        return [...videoExts, ...audioExts, ...htmlExts, ...imageExts].includes(ext);
      })
      .map((f) => {
        const filePath = join(LIBRARY_DIR, f);
        const stat = statSync(filePath);
        return {
          name: f,
          size: stat.size,
          modified: stat.mtime,
        };
      });
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get video metadata using ffprobe
app.get("/api/probe/:filename", async (req, res) => {
  const filePath = join(LIBRARY_DIR, req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate thumbnail at a specific time
app.get("/api/thumbnail/:filename", async (req, res) => {
  const filePath = join(LIBRARY_DIR, req.params.filename);
  const time = req.query.time || "0";
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-ss", String(time),
        "-i", filePath,
        "-vframes", "1",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-q:v", "5",
        "-",
      ],
      { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 }
    );
    res.set("Content-Type", "image/jpeg");
    res.send(stdout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full-resolution frame extraction (for AI-assisted zoom targeting)
app.get("/api/frame/:filename", async (req, res) => {
  const filePath = join(LIBRARY_DIR, req.params.filename);
  const time = req.query.time || "0";
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-ss", String(time),
        "-i", filePath,
        "-vframes", "1",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-q:v", "2",
        "-",
      ],
      { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 }
    );
    res.set("Content-Type", "image/jpeg");
    res.send(stdout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clips sidecar file management
function clipsPath(filename) {
  return join(LIBRARY_DIR, filename + ".clips.json");
}

function readClips(filename) {
  const p = clipsPath(filename);
  if (existsSync(p)) {
    return JSON.parse(readFileSync(p, "utf-8"));
  }
  return [];
}

function writeClips(filename, clips) {
  writeFileSync(clipsPath(filename), JSON.stringify(clips, null, 2));
}

// Get clips for a video
app.get("/api/clips/:filename", (req, res) => {
  res.json({ clips: readClips(req.params.filename) });
});

// Save clips for a video
app.put("/api/clips/:filename", (req, res) => {
  const clips = req.body.clips;
  if (!Array.isArray(clips)) {
    return res.status(400).json({ error: "clips must be an array" });
  }
  writeClips(req.params.filename, clips);
  broadcast({ type: "clips-updated", filename: req.params.filename });
  res.json({ ok: true });
});

// --- Orchestration (YAML) ---
const OUTPUT_DIR = join(PROJECT_DIR, "output");
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const CACHE_DIR = join(PROJECT_DIR, "cache");
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// Content-addressable render cache: hash segment settings → cached .mp4
// Use a replacer function that sorts keys at every nesting level for deterministic output.
function segmentHash(seg) {
  // Exclude 'audio' from the hash — audio is mixed globally, not per-segment.
  const json = JSON.stringify(seg, (key, value) => {
    if (key === "audio") return undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      for (const k of Object.keys(value).sort()) sorted[k] = value[k];
      return sorted;
    }
    return value;
  });

  // Include modification times of referenced library files so edits invalidate cache.
  let fileMeta = "";
  const filesToCheck = [seg.file, seg.source].filter(Boolean);
  for (const f of filesToCheck) {
    try {
      const p = join(LIBRARY_DIR, f);
      if (existsSync(p)) fileMeta += `|${f}:${statSync(p).mtimeMs}`;
    } catch {}
  }

  return createHash("sha256").update(json + fileMeta).digest("hex").slice(0, 16);
}

function getCachePath(hash) {
  return join(CACHE_DIR, `${hash}.mp4`);
}

// --- Audio mixer ---
// Resolve a single audio layer to a file path, generating if needed.
async function resolveAudioLayer(layer, seg, ctx) {
  if (layer.mute) return null;

  if (layer.type === "source") {
    // Extract native audio from the clip's source video
    if (seg.type !== "clip" || !seg.source) return null;
    const sourcePath = join(ctx.LIBRARY_DIR, seg.source);
    if (!existsSync(sourcePath)) return null;
    const { start, end } = ctx.resolveClip(seg);
    const audioFile = join(ctx.OUTPUT_DIR, `_audio_source_${Date.now()}.wav`);
    const vol = layer.volume != null ? layer.volume : 1;
    await ctx.execFileAsync("ffmpeg", [
      "-y", "-ss", String(start), "-to", String(end),
      "-i", sourcePath,
      "-vn", "-af", `volume=${vol}`,
      "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
      audioFile,
    ], { maxBuffer: 50 * 1024 * 1024 });
    return { path: audioFile, delay: layer.delay || 0, temp: true };

  } else if (layer.type === "tts") {
    const { path, cached } = await synthesize({
      text: layer.text,
      voice: layer.voice,
      rate: layer.rate,
      pitch: layer.pitch,
    });
    return { path, delay: layer.delay || 0, volume: layer.volume, temp: false, ttsCached: cached };

  } else if (layer.type === "file") {
    const filePath = join(ctx.LIBRARY_DIR, layer.source);
    if (!existsSync(filePath)) throw new Error(`Audio file not found: ${layer.source}`);
    return { path: filePath, delay: layer.delay || 0, volume: layer.volume, loop: layer.loop, temp: false };
  }

  return null;
}



// Render a segment, using cache if available. Returns the output file path.
async function renderCached(seg, outFile, ctx) {
  const hash = segmentHash(seg);
  const cached = getCachePath(hash);

  if (existsSync(cached)) {
    copyFileSync(cached, outFile);
    return { hit: true };
  }

  const renderer = ctx.rendererRegistry.get(seg.type);
  if (!renderer) throw new Error(`Unknown segment type: ${seg.type}`);

  await renderer.render(seg, outFile, ctx);

  // Post-process: keyframe zoom/pan animation
  if (seg.keyframes && seg.keyframes.length >= 2) {
    // Probe source dimensions
    let srcW = ctx.width, srcH = ctx.height;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "quiet", "-print_format", "json", "-show_streams", outFile,
      ]);
      const streams = JSON.parse(stdout).streams;
      const video = streams.find((s) => s.codec_type === "video");
      if (video) { srcW = video.width; srcH = video.height; }
    } catch {}

    const kfFilter = buildKeyframeFilter(seg.keyframes, ctx.fps, srcW, srcH, ctx.width, ctx.height);
    const kfScript = ctx.writeFilterScript(kfFilter);
    const kfTmp = outFile.replace(".mp4", "_kf.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-i", outFile,
      "-filter_complex_script", kfScript,
      "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
      "-an", kfTmp,
    ], { maxBuffer: 50 * 1024 * 1024 });
    unlinkSync(outFile);
    copyFileSync(kfTmp, outFile);
    unlinkSync(kfTmp);
  }

  // Video-only output — audio is mixed globally after concat.

  // Cache the result
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    copyFileSync(outFile, cached);
  } catch {}
  return { hit: false };
}

// List YAML files in project root
app.get("/api/projects", (req, res) => {
  const files = readdirSync(PROJECT_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => {
      const stat = statSync(join(PROJECT_DIR, f));
      return { name: f, modified: stat.mtime };
    });
  res.json({ files });
});

// Load a YAML orchestration file
app.get("/api/project/:filename", (req, res) => {
  const filePath = join(PROJECT_DIR, req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  const raw = readFileSync(filePath, "utf-8");
  try {
    const parsed = yaml.load(raw);
    res.json({ raw, parsed });
  } catch (err) {
    res.json({ raw, error: err.message });
  }
});

// Save a YAML orchestration file
app.put("/api/project/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!filename.endsWith(".yaml") && !filename.endsWith(".yml")) {
    return res.status(400).json({ error: "Filename must end in .yaml or .yml" });
  }
  const filePath = join(PROJECT_DIR, filename);
  // Accept either raw YAML string or a parsed object
  let content;
  if (typeof req.body.raw === "string") {
    content = req.body.raw;
  } else if (req.body.parsed) {
    content = yaml.dump(req.body.parsed, { lineWidth: 120, noRefs: true });
  } else {
    return res.status(400).json({ error: "Provide raw or parsed" });
  }
  writeFileSync(filePath, content);
  broadcast({ type: "project-updated", filename });
  res.json({ ok: true });
});

// Load renderer plugins and derive built-in types from the registry
const rendererRegistry = await loadTypes();
const BUILTIN_TYPES = new Set(rendererRegistry.keys());

// Resolve templates: if a segment's type is not a built-in, look it up in templates
// and deep-merge the template defaults with the segment's own properties.
function getMergedTemplates(project) {
  const external = loadExternalTemplates();
  const inline = project.templates || {};
  return { ...external, ...inline }; // inline overrides external
}

function resolveTemplates(project) {
  const templates = getMergedTemplates(project);
  const timeline = project.timeline || [];

  function resolveSeg(seg) {
    if (BUILTIN_TYPES.has(seg.type)) {
      // Resolve stack layers recursively
      if (seg.type === "stack" && seg.layers) {
        return { ...seg, layers: seg.layers.map(resolveSeg) };
      }
      return seg;
    }
    const template = templates[seg.type];
    if (!template) return seg;
    const resolved = deepMerge(template, seg);
    // Resolve stack layers recursively
    if (resolved.type === "stack" && resolved.layers) {
      resolved.layers = resolved.layers.map(resolveSeg);
    }
    return resolved;
  }

  return timeline.map(resolveSeg);
}

// Deep merge: template is the base, segment overrides.
// For objects, merge recursively. For everything else, segment wins.
function deepMerge(base, override) {
  const result = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(override)])) {
    const bVal = base[key];
    const oVal = override[key];
    if (key === "type") {
      // Use the template's real type, not the template name
      result[key] = bVal;
    } else if (oVal === undefined) {
      result[key] = bVal;
    } else if (bVal && typeof bVal === "object" && !Array.isArray(bVal) &&
               oVal && typeof oVal === "object" && !Array.isArray(oVal)) {
      result[key] = deepMerge(bVal, oVal);
    } else {
      result[key] = oVal;
    }
  }
  return result;
}

// Resolve a clip reference to start/end times
function resolveClip(segment) {
  if (segment.start != null && segment.end != null) {
    return { start: segment.start, end: segment.end };
  }
  if (segment.clip && segment.source) {
    const clips = readClips(segment.source);
    const found = clips.find((c) => c.name === segment.clip);
    if (!found) throw new Error(`Clip "${segment.clip}" not found in ${segment.source}`);
    return { start: found.start, end: found.end };
  }
  throw new Error("Clip segment must have clip+source or start+end");
}

// --- Render pipeline ---
let activeRender = null;

app.post("/api/render/:filename", async (req, res) => {
  if (activeRender) {
    return res.status(409).json({ error: "A render is already in progress" });
  }

  const filePath = join(PROJECT_DIR, req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  let project;
  try {
    project = yaml.load(readFileSync(filePath, "utf-8"));
  } catch (err) {
    return res.status(400).json({ error: "Invalid YAML: " + err.message });
  }

  const outputSettings = project.output || {};
  const width = outputSettings.width || 1920;
  const height = outputSettings.height || 1080;
  const fps = outputSettings.fps || 30;
  const bg = outputSettings.background || "#1a1a2e";
  const timeline = resolveTemplates(project);

  if (timeline.length === 0) {
    return res.status(400).json({ error: "Timeline is empty" });
  }

  // Timestamp the output so each render is preserved
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const baseName = req.params.filename.replace(/\.ya?ml$/, "");
  const outputFilename = `${baseName}_${timestamp}.mp4`;
  const outputFile = join(OUTPUT_DIR, outputFilename);

  // Build FFmpeg filter complex
  // Strategy: render each segment to a temp file, then concatenate
  const tempFiles = [];
  const errors = [];

  // Build render context shared by all renderer plugins
  // On Windows, colons in font paths (e.g. C:\Windows\Fonts) can't be reliably escaped
  // in FFmpeg filter strings passed via execFile. We escape the colon with \: and use
  // -filter_script:v (which reads the filter from a file) to avoid command-line mangling.
  const systemFontDir = process.platform === "win32"
    ? (process.env.SYSTEMROOT || "C:\\Windows").replace(/\\/g, "/") + "/Fonts"
    : process.platform === "darwin"
      ? "/System/Library/Fonts"
      : "/usr/share/fonts/truetype/dejavu";
  const defaultFontFile = process.platform === "win32"
    ? "arial.ttf"
    : process.platform === "darwin"
      ? "Helvetica.ttc"
      : "DejaVuSans.ttf";
  // Escape colons for FFmpeg filter syntax (used inside -filter_script files)
  const defaultFont = (systemFontDir + "/" + defaultFontFile).replace(/:/g, "\\:");

  let filterScriptCounter = 0;
  function writeFilterScript(filter) {
    const p = join(OUTPUT_DIR, `_filter_${filterScriptCounter++}.txt`);
    writeFileSync(p, filter);
    return p;
  }

  const ctx = {
    width, height, fps, defaultBg: bg, defaultFont,
    buildFadeFilter, resolveClip, readClips, writeFilterScript,
    LIBRARY_DIR, execFileAsync, existsSync, join,
    rendererRegistry, OUTPUT_DIR, renderCached, broadcast,
  };

  broadcast({ type: "render-started", filename: req.params.filename });
  activeRender = { filename: req.params.filename, progress: 0, total: timeline.length };
  res.json({ ok: true, output: outputFile });

  try {
    for (let i = 0; i < timeline.length; i++) {
      const seg = timeline[i];
      const tempFile = join(OUTPUT_DIR, `_temp_seg_${i}.mp4`);
      tempFiles.push(tempFile);

      activeRender.progress = i;
      broadcast({
        type: "render-progress",
        segment: i,
        total: timeline.length,
        segmentType: seg.type,
      });

      try {
        const { hit } = await renderCached(seg, tempFile, ctx);
        broadcast({
          type: "render-progress",
          segment: i,
          total: timeline.length,
          segmentType: seg.type,
          cached: hit,
        });
      } catch (err) {
        errors.push(`Segment ${i} (${seg.type}): ${err.message}`);
      }
    }

    if (errors.length > 0) {
      broadcast({ type: "render-error", errors });
      return;
    }

    // --- Concatenate video (video-only, fast copy) ---
    broadcast({ type: "render-phase", phase: "Concatenating video..." });
    const concatList = join(OUTPUT_DIR, "_concat.txt");
    const concatContent = tempFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    writeFileSync(concatList, concatContent);

    const concatTmp = join(OUTPUT_DIR, "_concat_tmp.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat", "-safe", "0",
      "-i", concatList,
      "-c", "copy",
      "-movflags", "+faststart",
      concatTmp,
    ], { maxBuffer: 50 * 1024 * 1024 });

    // --- Global audio mix ---
    broadcast({ type: "render-phase", phase: "Mixing audio..." });
    // Probe each segment's duration to compute absolute start times.
    const segDurations = [];
    for (const f of tempFiles) {
      try {
        const { stdout } = await execFileAsync("ffprobe", [
          "-v", "quiet", "-print_format", "json", "-show_format", f,
        ]);
        segDurations.push(parseFloat(JSON.parse(stdout).format.duration) || 0);
      } catch { segDurations.push(0); }
    }
    const segStartTimes = [];
    let cumTime = 0;
    for (const d of segDurations) {
      segStartTimes.push(cumTime);
      cumTime += d;
    }
    const totalDuration = cumTime;

    // Collect all audio layers with absolute positioning.
    const audioItems = []; // { path, absoluteStart, volume, loop, temp }
    const templates = getMergedTemplates(project);
    const AUDIO_TYPES = new Set(["source", "tts", "file"]);
    const audioErrors = [];

    for (let i = 0; i < timeline.length; i++) {
      const seg = timeline[i];
      if (!seg.audio || seg.audio.length === 0) continue;

      for (const rawLayer of seg.audio) {
        // Resolve audio template: if type is not a built-in audio type, look up in templates
        let layer = rawLayer;
        if (rawLayer.type && !AUDIO_TYPES.has(rawLayer.type)) {
          const tmpl = templates[rawLayer.type];
          if (tmpl) {
            layer = { ...tmpl };
            for (const [k, v] of Object.entries(rawLayer)) {
              if (k !== "type" && v !== undefined) layer[k] = v;
            }
          }
        }

        if (layer.mute) continue;
        const delay = layer.delay || 0; // can be negative
        const absStart = Math.max(0, segStartTimes[i] + delay);

        try {
          if (layer.type === "source") {
            broadcast({ type: "render-phase", phase: `Extracting audio from ${seg.source || "clip"}` });
          } else if (layer.type === "file") {
            broadcast({ type: "render-phase", phase: `Loading audio: ${layer.source || "?"}` });
          }
          const resolved = await resolveAudioLayer(layer, seg, ctx);
          if (resolved) {
            if (layer.type === "tts") {
              const tag = resolved.ttsCached ? "[cached]" : "[generated]";
              broadcast({ type: "render-phase", phase: `TTS ${tag}: "${(layer.text || "").substring(0, 60)}" (${layer.voice || "?"})` });
            }
            audioItems.push({
              path: resolved.path,
              absoluteStart: absStart,
              volume: layer.volume != null ? layer.volume : 1,
              loop: resolved.loop || false,
              temp: resolved.temp || false,
            });
          }
        } catch (err) {
          audioErrors.push(err.message);
        }
      }
    }

    // Project-level background audio
    const bgAudio = outputSettings["background-audio"] || [];
    for (const layer of bgAudio) {
      try {
        let audioPath = null;
        if (layer.type === "file" && layer.source) {
          audioPath = join(LIBRARY_DIR, layer.source);
        } else if (layer.type === "tts" && layer.text && layer.voice) {
          const { path } = await synthesize({ text: layer.text, voice: layer.voice, rate: layer.rate, pitch: layer.pitch });
          audioPath = path;
        }
        if (audioPath && existsSync(audioPath)) {
          audioItems.push({
            path: audioPath,
            absoluteStart: 0,
            volume: layer.volume != null ? layer.volume : 1,
            loop: layer.loop || false,
            temp: false,
          });
        }
      } catch (err) {
        audioErrors.push(err.message);
      }
    }

    if (audioErrors.length > 0) {
      broadcast({ type: "audio-warning", errors: audioErrors });
    }

    // Build the final output: merge concatenated video with global audio mix.
    if (audioItems.length > 0) {
      const mixInputs = ["-i", concatTmp];
      const mixFilters = [];

      for (let ai = 0; ai < audioItems.length; ai++) {
        const item = audioItems[ai];
        if (item.loop) {
          mixInputs.push("-stream_loop", "-1", "-i", item.path);
        } else {
          mixInputs.push("-i", item.path);
        }

        const inputIdx = ai + 1; // 0 is the video
        const filters = [];
        // Convert absolute start to adelay in ms
        const delayMs = Math.round(item.absoluteStart * 1000);
        if (delayMs > 0) {
          filters.push(`adelay=${delayMs}|${delayMs}`);
        }
        if (item.volume !== 1) {
          filters.push(`volume=${item.volume}`);
        }
        if (filters.length > 0) {
          mixFilters.push(`[${inputIdx}:a]${filters.join(",")}[a${ai}]`);
        } else {
          mixFilters.push(`[${inputIdx}:a]anull[a${ai}]`);
        }
      }

      // Add a silent track spanning the full video duration so the mix
      // always covers the entire video (prevents truncation).
      mixFilters.push(`anullsrc=r=44100:cl=stereo,atrim=0:${totalDuration}[silence]`);
      const silenceIdx = audioItems.length;

      // Mix all audio streams + silence
      const labels = audioItems.map((_, i) => `[a${i}]`).join("") + `[silence]`;
      mixFilters.push(`${labels}amix=inputs=${audioItems.length + 1}:duration=longest:normalize=0[mixed]`);

      const mixFilterScript = writeFilterScript(mixFilters.join(";\n"));
      await execFileAsync("ffmpeg", [
        "-y",
        ...mixInputs,
        "-filter_complex_script", mixFilterScript,
        "-map", "0:v",
        "-map", "[mixed]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
        outputFile,
      ], { maxBuffer: 50 * 1024 * 1024 });

      if (existsSync(concatTmp)) unlinkSync(concatTmp);
    } else {
      // No audio at all — just use the concatenated video
      copyFileSync(concatTmp, outputFile);
      unlinkSync(concatTmp);
    }

    // Clean up temp audio files
    for (const item of audioItems) {
      if (item.temp) {
        try { if (existsSync(item.path)) unlinkSync(item.path); } catch {}
      }
    }

    // Clean up temp files
    for (const f of tempFiles) {
      if (existsSync(f)) unlinkSync(f);
    }
    if (existsSync(concatList)) unlinkSync(concatList);
    // Clean up filter script files
    for (let j = 0; j < filterScriptCounter; j++) {
      const p = join(OUTPUT_DIR, `_filter_${j}.txt`);
      if (existsSync(p)) unlinkSync(p);
    }

    broadcast({ type: "render-complete", output: outputFile, filename: outputFilename });
  } catch (err) {
    broadcast({ type: "render-error", errors: [err.message] });
  } finally {
    activeRender = null;
  }
});

app.get("/api/render/status", (req, res) => {
  res.json({ active: activeRender });
});

// --- Render cache management ---
app.get("/api/cache", (req, res) => {
  try {
    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith(".mp4"));
    const totalSize = files.reduce((sum, f) => sum + statSync(join(CACHE_DIR, f)).size, 0);
    res.json({ entries: files.length, totalSizeMB: (totalSize / 1024 / 1024).toFixed(1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/cache", (req, res) => {
  try {
    const files = readdirSync(CACHE_DIR).filter(f => f.endsWith(".mp4"));
    for (const f of files) unlinkSync(join(CACHE_DIR, f));
    res.json({ ok: true, cleared: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Templates API ---

// Load all external templates from the templates directory
function loadExternalTemplates() {
  const templates = {};
  try {
    const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const f of files) {
      try {
        const raw = readFileSync(join(TEMPLATES_DIR, f), "utf-8");
        const parsed = yaml.load(raw);
        const name = f.replace(/\.ya?ml$/, "");
        if (parsed && typeof parsed === "object") {
          templates[name] = parsed;
        }
      } catch {}
    }
  } catch {}
  return templates;
}

app.get("/api/templates", (req, res) => {
  try {
    const templates = loadExternalTemplates();
    const list = Object.entries(templates).map(([name, parsed]) => ({
      name,
      type: parsed.type || "unknown",
      parsed,
      modified: statSync(join(TEMPLATES_DIR, `${name}.yaml`)).mtime,
    }));
    res.json({ templates: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/template/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const filePath = join(TEMPLATES_DIR, `${name}.yaml`);
  if (!existsSync(filePath)) return res.status(404).json({ error: "Template not found" });
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = yaml.load(raw);
    res.json({ name, raw, parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/template/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return res.status(400).json({ error: "Invalid template name" });
  }
  const filePath = join(TEMPLATES_DIR, `${name}.yaml`);
  try {
    const content = req.body.raw || yaml.dump(req.body.parsed, { lineWidth: -1 });
    writeFileSync(filePath, content);
    broadcast({ type: "templates-updated" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/template/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const filePath = join(TEMPLATES_DIR, `${name}.yaml`);
  if (!existsSync(filePath)) return res.status(404).json({ error: "Template not found" });
  try {
    unlinkSync(filePath);
    broadcast({ type: "templates-updated" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TTS API ---
app.get("/api/tts/voices", async (req, res) => {
  try {
    const voices = await getVoices();
    res.json({ voices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const result = await synthesize(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Output management ---
app.get("/api/outputs", (req, res) => {
  try {
    const files = readdirSync(OUTPUT_DIR)
      .filter((f) => {
        const ext = extname(f).toLowerCase();
        return [".mp4", ".mov", ".mkv", ".webm"].includes(ext) && !f.startsWith("_temp_");
      })
      .map((f) => {
        const filePath = join(OUTPUT_DIR, f);
        const stat = statSync(filePath);
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/outputs/:filename", (req, res) => {
  const filePath = join(OUTPUT_DIR, req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  unlinkSync(filePath);
  broadcast({ type: "outputs-updated" });
  res.json({ ok: true });
});

// Serve rendered output files
app.use("/output", express.static(OUTPUT_DIR));

// WebSocket for live updates
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

// SPA fallback — serve index.html for any unmatched route
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "ui", "index.html"));
});

const PORT = process.env.PORT || 3344;
server.listen(PORT, () => {
  console.log(`SpliceRack is running at http://localhost:${PORT}`);
});
