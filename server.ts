import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import multer from "multer";
import { cpus } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, basename, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { copyFileSync } from "fs";
import yaml from "js-yaml";
import { loadTypes } from "./types/index.ts";
import { buildFadeFilter, buildKeyframeFilter } from "./types/_helpers.ts";
import { getVoices, synthesize } from "./services/tts.ts";
import { deterministicHash } from "./shared/hash.ts";
import { deepMerge } from "./shared/deep-merge.ts";
import { H264_ARGS, ALPHA_ARGS, FFMPEG_MAX_BUFFER, hexToFFmpeg, probeJson, spawnFFmpeg } from "./shared/ffmpeg.ts";
import { loadYamlFile, listFilesByExt } from "./shared/yaml-utils.ts";
import tsBlankSpace from "ts-blank-space";

const execFileAsync = promisify(execFile);

// Parallel task execution with concurrency limit
const PARALLEL_LIMIT = Math.max(2, Math.min(6, Math.floor(cpus().length / 2)));

// FFmpeg slot tracking for live stderr streaming
let nextSlotId = 0;
function allocSlot(): number { return nextSlotId++; }
function resetSlots() { nextSlotId = 0; }

async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = PARALLEL_LIMIT
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function stripTypes(src: string): string {
  return tsBlankSpace(src);
}

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

// Serve .ts UI files with type stripping (before static middleware)
app.get("/app.js", (req, res) => {
  const src = readFileSync(join(__dirname, "ui", "app.ts"), "utf-8");
  res.type("application/javascript").send(stripTypes(src));
});
app.get("/type-registry.js", (req, res) => {
  const src = readFileSync(join(__dirname, "ui", "type-registry.ts"), "utf-8");
  res.type("application/javascript").send(stripTypes(src));
});
app.get("/card-list.js", (req, res) => {
  const src = readFileSync(join(__dirname, "ui", "card-list.ts"), "utf-8");
  const body = stripTypes(src)
    .replace(/^export /gm, "")
    .replace(/^import .*/gm, "");
  res.type("application/javascript").send(body);
});

app.use(express.static(join(__dirname, "ui")));

// Serve bundled type UI scripts and styles
const TYPES_DIR = join(__dirname, "types");

function getTypeDirs() {
  return readdirSync(TYPES_DIR)
    .filter(f => !f.startsWith("_") && !f.startsWith(".") && !f.endsWith(".js"))
    .filter(f => statSync(join(TYPES_DIR, f)).isDirectory());
}

// --- TypeScript type stripping for browser-served files ---

// Serve shared utilities as browser-compatible JS
app.get("/api/shared.js", (req, res) => {
  const deepMergeSrc = readFileSync(join(__dirname, "shared", "deep-merge.ts"), "utf-8");
  const body = stripTypes(deepMergeSrc)
    .replace(/^export /gm, "")
    .replace(/^import .*/gm, "");
  res.type("application/javascript").send(`// Shared utilities\n${body}\nSpliceRack.deepMerge = deepMerge;\n`);
});

app.get("/api/types.js", (req, res) => {
  let bundle = "";
  for (const dir of getTypeDirs()) {
    // Prefer .ts, fall back to .js
    const tsPath = join(TYPES_DIR, dir, "ui.ts");
    const jsPath = join(TYPES_DIR, dir, "ui.js");
    if (existsSync(tsPath)) {
      bundle += stripTypes(readFileSync(tsPath, "utf-8")) + "\n";
    } else if (existsSync(jsPath)) {
      bundle += readFileSync(jsPath, "utf-8") + "\n";
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
  const uploaded = (req.files as Express.Multer.File[]).map((f: Express.Multer.File) => f.originalname);
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get video metadata using ffprobe
app.get("/api/probe/:filename", async (req, res) => {
  const filePath = join(LIBRARY_DIR, req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const info = await probeJson(execFileAsync, filePath);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Clips sidecar file management
function clipsPath(filename: string) {
  return join(LIBRARY_DIR, filename + ".clips.json");
}

function readClips(filename: string) {
  const p = clipsPath(filename);
  if (existsSync(p)) {
    return JSON.parse(readFileSync(p, "utf-8"));
  }
  return [];
}

function writeClips(filename: string, clips: any) {
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

// Content-addressable render cache: hash segment settings → cached .mov (alpha-capable)
function segmentHash(seg: any) {
  // Include modification times of referenced library files so edits invalidate cache.
  let fileMeta = "";
  for (const f of [seg.file, seg.source].filter(Boolean)) {
    try {
      const p = join(LIBRARY_DIR, f);
      if (existsSync(p)) fileMeta += `|${f}:${statSync(p).mtimeMs}`;
    } catch {}
  }
  return deterministicHash(seg, { excludeKeys: ["audio"], suffix: fileMeta });
}

function getCachePath(hash: string) {
  return join(CACHE_DIR, `${hash}.mov`);
}

// --- Audio mixer ---
// Resolve a single audio layer to a file path, generating if needed.
async function resolveAudioLayer(layer: any, seg: any, ctx: any) {
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
    ], FFMPEG_MAX_BUFFER);
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
async function renderCached(seg: any, outFile: string, ctx: any) {
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
      const info = await probeJson(execFileAsync, outFile, "streams");
      const video = info.streams.find((s: any) => s.codec_type === "video");
      if (video) { srcW = video.width; srcH = video.height; }
    } catch {}

    const kfFilter = buildKeyframeFilter(seg.keyframes, ctx.fps, srcW, srcH, ctx.width, ctx.height);
    const kfScript = ctx.writeFilterScript(kfFilter);
    const kfTmp = outFile.replace(".mov", "_kf.mov");
    await execFileAsync("ffmpeg", [
      "-y", "-i", outFile,
      "-filter_complex_script", kfScript,
      ...ALPHA_ARGS,
      "-an", kfTmp,
    ], FFMPEG_MAX_BUFFER);
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
  const { raw, parsed, error } = loadYamlFile(filePath);
  if (error) {
    res.json({ raw, error });
  } else {
    res.json({ raw, parsed });
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
function getMergedTemplates(project: any) {
  const external = loadExternalTemplates();
  const inline = project.templates || {};
  return { ...external, ...inline }; // inline overrides external
}

function resolveTemplates(project: any) {
  const templates = getMergedTemplates(project);
  const timeline = project.timeline || [];

  function resolveSeg(seg: any) {
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
      resolved.layers = (resolved.layers as any[]).map(resolveSeg);
    }
    return resolved;
  }

  return timeline.map(resolveSeg);
}

// deepMerge imported from shared/deep-merge.js

// Resolve a clip reference to start/end times
function resolveClip(segment: any) {
  if (segment.start != null && segment.end != null) {
    return { start: segment.start, end: segment.end };
  }
  if (segment.clip && segment.source) {
    const clips = readClips(segment.source);
    const found = clips.find((c: any) => c.name === segment.clip);
    if (!found) throw new Error(`Clip "${segment.clip}" not found in ${segment.source}`);
    return { start: found.start, end: found.end };
  }
  throw new Error("Clip segment must have clip+source or start+end");
}

// --- Render pipeline ---

// Extract a flat list of renderable elements from the resolved timeline.
// Each stack is expanded into its individual layers; non-stacks become single elements.
function extractElements(timeline: any[]): Array<{
  seg: any; segmentIndex: number; layerIndex: number;
  delay: number; opacity: number; crop: boolean;
}> {
  const elements: Array<{
    seg: any; segmentIndex: number; layerIndex: number;
    delay: number; opacity: number; crop: boolean;
  }> = [];

  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    if (seg.type === "stack" && seg.layers && seg.layers.length > 0) {
      const crop = seg.crop !== false; // default true
      for (let li = 0; li < seg.layers.length; li++) {
        const layer = seg.layers[li];
        const layerSeg = { ...layer } as any;
        const opacity = layerSeg.opacity != null ? layerSeg.opacity : 1;
        const delay = layerSeg.delay || 0;
        delete layerSeg.opacity;
        delete layerSeg.delay;
        elements.push({ seg: layerSeg, segmentIndex: i, layerIndex: li, delay, opacity, crop });
      }
    } else {
      // Non-stack: single element on layer 0
      elements.push({ seg, segmentIndex: i, layerIndex: 0, delay: 0, opacity: 1, crop: true });
    }
  }
  return elements;
}

// After rendering all elements and probing durations, build the compositing plan.
function buildCompositingPlan(
  timeline: any[],
  elements: Array<{ seg: any; segmentIndex: number; layerIndex: number; delay: number; opacity: number; crop: boolean }>,
  elementFiles: string[],
  elementDurations: number[]
): { plan: Array<{ file: string; absoluteStart: number; duration: number; layer: number; segmentIndex: number; layerIndex: number; opacity: number; contentHash: string }>;
     segStartTimes: number[]; totalDuration: number; segSlotDurations: number[] } {

  // First, compute each segment's slot duration
  const segSlotDurations: number[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    if (seg.type === "stack" && seg.layers && seg.layers.length > 0) {
      if (seg.duration && seg.duration > 0) {
        segSlotDurations.push(seg.duration);
      } else {
        // Auto: max of (delay + layer duration) across layers
        let maxEnd = 0;
        for (let j = 0; j < elements.length; j++) {
          if (elements[j].segmentIndex === i) {
            maxEnd = Math.max(maxEnd, elements[j].delay + elementDurations[j]);
          }
        }
        segSlotDurations.push(maxEnd || 3);
      }
    } else {
      // Non-stack: the element's probed duration
      const elemIdx = elements.findIndex(e => e.segmentIndex === i);
      segSlotDurations.push(elemIdx >= 0 ? elementDurations[elemIdx] : 3);
    }
  }

  // Compute cumulative segment start times
  const segStartTimes: number[] = [];
  let cumTime = 0;
  for (const d of segSlotDurations) {
    segStartTimes.push(cumTime);
    cumTime += d;
  }

  // Build plan entries
  const plan: Array<{ file: string; absoluteStart: number; duration: number; layer: number;
    segmentIndex: number; layerIndex: number; opacity: number; contentHash: string }> = [];

  for (let j = 0; j < elements.length; j++) {
    const elem = elements[j];
    const segStart = segStartTimes[elem.segmentIndex];
    const absStart = Math.max(0, segStart + elem.delay);
    let duration = elementDurations[j];

    // If cropping is on, clip duration to not exceed the segment slot
    if (elem.crop) {
      const maxDur = segSlotDurations[elem.segmentIndex] - elem.delay;
      if (maxDur > 0) duration = Math.min(duration, maxDur);
      else continue; // element starts after segment slot ends
    }

    plan.push({
      file: elementFiles[j],
      absoluteStart: absStart,
      duration,
      layer: elem.layerIndex,
      segmentIndex: elem.segmentIndex,
      layerIndex: elem.layerIndex,
      opacity: elem.opacity,
      contentHash: segmentHash(elem.seg),
    });
  }

  return { plan, segStartTimes, totalDuration: cumTime, segSlotDurations };
}

// Detect whether the fast concat path can be used (no overlaps, no multi-layer, no bleed)
function canUseFastPath(plan: Array<{ layer: number; absoluteStart: number; duration: number }>) {
  for (const elem of plan) {
    if (elem.layer !== 0) return false;
  }
  const sorted = [...plan].sort((a, b) => a.absoluteStart - b.absoluteStart);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].absoluteStart + sorted[i - 1].duration;
    if (sorted[i].absoluteStart < prevEnd - 0.01) return false;
  }
  return true;
}

// Build the FFmpeg filter_complex for global compositing
function buildGlobalCompositeFilter(
  plan: Array<{ file: string; absoluteStart: number; duration: number; layer: number; opacity: number }>,
  totalDuration: number,
  width: number, height: number, fps: number, bgColor: string
): string {
  // Sort by layer (ascending) then start time (ascending)
  const sorted = [...plan].sort((a, b) => a.layer - b.layer || a.absoluteStart - b.absoluteStart);
  const inputIndex = (elem: typeof sorted[0]) => plan.indexOf(elem);

  const lines: string[] = [];

  // Base canvas
  const bg = bgColor.replace("#", "");
  lines.push(`color=c=0x${bg}:s=${width}x${height}:d=${totalDuration}:r=${fps}[base]`);

  let lastLabel = "base";
  for (let i = 0; i < sorted.length; i++) {
    const elem = sorted[i];
    const idx = inputIndex(elem);
    const elemLabel = `e${i}`;
    const outLabel = `out${i}`;
    const start = elem.absoluteStart;
    const end = start + elem.duration;

    // Prepare the element: shift PTS so it starts at the right time,
    // and apply opacity if needed. No tpad — overlay with enable handles timing.
    const filters: string[] = [];
    filters.push(`setpts=PTS+${start.toFixed(3)}/TB`);
    if (elem.opacity < 1) {
      filters.push("format=yuva420p");
      filters.push(`colorchannelmixer=aa=${elem.opacity}`);
    }

    lines.push(`[${idx}:v]${filters.join(",")}[${elemLabel}]`);
    // overlay with enable: only composite during the element's time window
    lines.push(`[${lastLabel}][${elemLabel}]overlay=0:0:eof_action=pass:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[${outLabel}]`);
    lastLabel = outLabel;
  }

  lines.push(`[${lastLabel}]format=yuv420p[final]`);
  return lines.join(";\n");
}

let activeRender: { filename: string; progress: number; total: number } | null = null;

app.post("/api/render/:filename", async (req, res) => {
  if (activeRender) {
    return res.status(409).json({ error: "A render is already in progress" });
  }

  const filePath = join(PROJECT_DIR, req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const { parsed: project, error: yamlError } = loadYamlFile(filePath);
  if (yamlError || !project) {
    return res.status(400).json({ error: "Invalid YAML: " + (yamlError || "empty file") });
  }

  const outputSettings = project.output || {};
  const width = outputSettings.width || 1920;
  const height = outputSettings.height || 1080;
  const fps = outputSettings.fps || 30;
  const bg = outputSettings.background || "#1a1a2e";
  const timeline = resolveTemplates(project);

  if (timeline.length === 0) {
    return res.status(400).json({ error: "Sequence is empty" });
  }

  // Timestamp the output so each render is preserved
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const baseName = req.params.filename.replace(/\.ya?ml$/, "");
  const outputFilename = `${baseName}_${timestamp}.mp4`;
  const outputFile = join(OUTPUT_DIR, outputFilename);

  // Build FFmpeg filter complex
  // Strategy: render each segment to a temp file, then concatenate
  const tempFiles = [];
  const errors: string[] = [];

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
  function writeFilterScript(filter: string) {
    const p = join(OUTPUT_DIR, `_filter_${filterScriptCounter++}.txt`);
    writeFileSync(p, filter);
    return p;
  }

  // Wrap execFileAsync so FFmpeg calls stream their output to UI slots
  async function streamingExecFile(cmd: string, args: string[], opts?: any) {
    if (cmd === "ffmpeg") {
      const slot = allocSlot();
      const label = `Element (${args.find((a: string) => a.endsWith(".mov") || a.endsWith(".mp4")) || "ffmpeg"})`.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
      broadcast({ type: "ffmpeg-slot", slot, label, line: "Starting..." });
      try {
        await spawnFFmpeg(args, (line: string) => {
          broadcast({ type: "ffmpeg-slot", slot, label, line });
        });
        broadcast({ type: "ffmpeg-slot", slot, label, line: "Done", done: true });
        return { stdout: "", stderr: "" };
      } catch (err) {
        broadcast({ type: "ffmpeg-slot", slot, label, line: `Error: ${(err as Error).message}`, done: true });
        throw err;
      }
    }
    return execFileAsync(cmd, args, opts);
  }

  const ctx = {
    width, height, fps, defaultBg: bg, defaultFont,
    buildFadeFilter, resolveClip, readClips, writeFilterScript,
    LIBRARY_DIR, execFileAsync: streamingExecFile, existsSync, join,
    rendererRegistry, OUTPUT_DIR, renderCached, broadcast,
  };

  broadcast({ type: "render-started", filename: req.params.filename });
  activeRender = { filename: req.params.filename, progress: 0, total: timeline.length };
  res.json({ ok: true, output: outputFile });

  try {
    // --- Phase 1: Extract elements from timeline ---
    const elements = extractElements(timeline);

    // --- Phase 2: Render each element (parallel) ---
    resetSlots();
    broadcast({ type: "ffmpeg-slots", count: 0 });
    broadcast({ type: "render-phase", phase: `Rendering ${elements.length} elements (${PARALLEL_LIMIT} parallel)...` });
    const elementFiles: string[] = elements.map(
      (elem) => join(OUTPUT_DIR, `_temp_elem_${elem.segmentIndex}_${elem.layerIndex}.mov`)
    );
    tempFiles.push(...elementFiles);

    let completedCount = 0;
    await parallelMap(elements, async (elem, j) => {
      const tempFile = elementFiles[j];
      try {
        const { hit } = await renderCached(elem.seg, tempFile, ctx);
        completedCount++;
        broadcast({
          type: "render-progress",
          segment: completedCount,
          total: elements.length,
          segmentType: elem.seg.type,
          cached: hit,
        });
      } catch (err) {
        errors.push(`Element ${elem.segmentIndex}/${elem.layerIndex} (${elem.seg.type}): ${(err as Error).message}`);
      }
    });

    if (errors.length > 0) {
      broadcast({ type: "render-error", errors });
      return;
    }

    // --- Phase 3: Probe element durations and build compositing plan ---
    broadcast({ type: "render-phase", phase: "Building compositing plan..." });
    const elementDurations: number[] = [];
    for (const f of elementFiles) {
      try {
        const info = await probeJson(execFileAsync, f, "format");
        elementDurations.push(parseFloat(info.format.duration) || 3);
      } catch { elementDurations.push(3); }
    }

    const { plan, segStartTimes, totalDuration } = buildCompositingPlan(
      timeline, elements, elementFiles, elementDurations
    );

    // --- Phase 4: Region-based compositing ---
    // Split the timeline into regions: "simple" (single element, no overlap) or
    // "complex" (multiple elements overlapping in time). Composite complex regions
    // independently (cacheable), then concat all region outputs.
    broadcast({ type: "render-phase", phase: "Planning compositing regions..." });

    // Sort plan elements by start time
    const sortedPlan = [...plan].sort((a, b) => a.absoluteStart - b.absoluteStart);

    // Build regions: find time spans where elements overlap or use multiple layers
    type Region = { start: number; end: number; elements: typeof plan; simple: boolean };
    const regions: Region[] = [];
    let ri = 0;
    while (ri < sortedPlan.length) {
      const elem = sortedPlan[ri];
      const regionStart = elem.absoluteStart;
      let regionEnd = elem.absoluteStart + elem.duration;
      const regionElems = [elem];

      // Expand region to include any overlapping elements
      let rj = ri + 1;
      while (rj < sortedPlan.length) {
        const next = sortedPlan[rj];
        if (next.absoluteStart < regionEnd - 0.01) {
          // Overlaps — absorb into this region
          regionElems.push(next);
          regionEnd = Math.max(regionEnd, next.absoluteStart + next.duration);
          rj++;
        } else {
          break;
        }
      }

      const simple = regionElems.length === 1 && regionElems[0].layer === 0;
      regions.push({ start: regionStart, end: regionEnd, elements: regionElems, simple });
      ri = rj;
    }

    const simpleCount = regions.filter(r => r.simple).length;
    const complexCount = regions.filter(r => !r.simple).length;
    broadcast({ type: "render-phase", phase: `${regions.length} regions (${simpleCount} simple, ${complexCount} complex)` });

    // Render each region (parallel)
    broadcast({ type: "render-phase", phase: `Rendering ${regions.length} regions (${simpleCount} simple, ${complexCount} complex, ${PARALLEL_LIMIT} parallel)...` });
    resetSlots();
    broadcast({ type: "ffmpeg-slots", count: 0 }); // clear slots
    const regionFiles: string[] = new Array(regions.length);

    await parallelMap(regions, async (region, rIdx) => {
      const regionFile = join(OUTPUT_DIR, `_region_${rIdx}.mp4`);
      tempFiles.push(regionFile);
      const slot = allocSlot();

      if (region.simple) {
        const elem = region.elements[0];
        const h264Hash = `h264_${elem.contentHash}`;
        const h264Cache = join(CACHE_DIR, `${h264Hash}.mp4`);

        if (existsSync(h264Cache)) {
          copyFileSync(h264Cache, regionFile);
        } else {
          broadcast({ type: "ffmpeg-slot", slot, label: `Region ${rIdx + 1} (H.264)`, line: "Starting..." });
          await spawnFFmpeg([
            "-y", "-i", elem.file,
            ...H264_ARGS,
            "-movflags", "+faststart",
            regionFile,
          ], (line: string) => broadcast({ type: "ffmpeg-slot", slot, label: `Region ${rIdx + 1}`, line }));
          broadcast({ type: "ffmpeg-slot", slot, label: `Region ${rIdx + 1}`, line: "Done", done: true });
          try { copyFileSync(regionFile, h264Cache); } catch {}
        }
      } else {
        const regionHash = deterministicHash({
          elements: region.elements.map(e => ({
            contentHash: e.contentHash, start: e.absoluteStart - region.start,
            duration: e.duration, layer: e.layer, opacity: e.opacity,
          })),
          width, height, fps, bg,
        });
        const regionCache = join(CACHE_DIR, `region_${regionHash}.mp4`);

        if (existsSync(regionCache)) {
          broadcast({ type: "render-phase", phase: `Region ${rIdx + 1}: [cached]` });
          copyFileSync(regionCache, regionFile);
        } else {
          broadcast({ type: "ffmpeg-slot", slot, label: `Region ${rIdx + 1} (composite)`, line: `${region.elements.length} elements, ${(region.end - region.start).toFixed(1)}s` });
          const localPlan = region.elements.map(e => ({
            ...e,
            absoluteStart: e.absoluteStart - region.start,
          }));
          const regionDuration = region.end - region.start;
          const filter = buildGlobalCompositeFilter(localPlan, regionDuration, width, height, fps, bg);
          const filterScript = writeFilterScript(filter);
          const inputs: string[] = [];
          for (const elem of localPlan) {
            inputs.push("-i", elem.file);
          }
          await spawnFFmpeg([
            "-y", ...inputs,
            "-filter_complex_script", filterScript,
            "-map", "[final]",
            ...H264_ARGS,
            "-movflags", "+faststart",
            "-t", String(regionDuration),
            regionFile,
          ], (line: string) => broadcast({ type: "ffmpeg-slot", slot, label: `Region ${rIdx + 1}`, line }));
          broadcast({ type: "ffmpeg-slot", slot, label: `Region ${rIdx + 1}`, line: "Done", done: true });
          try {
            if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
            copyFileSync(regionFile, regionCache);
          } catch {}
        }
      }
      regionFiles[rIdx] = regionFile;
    });

    // Concat all region files
    broadcast({ type: "render-phase", phase: "Concatenating regions..." });
    const concatTmp = join(OUTPUT_DIR, "_concat_tmp.mp4");
    const concatList = join(OUTPUT_DIR, "_concat.txt");
    const concatContent = regionFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    writeFileSync(concatList, concatContent);
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", concatList, "-c", "copy",
      "-movflags", "+faststart", concatTmp,
    ], FFMPEG_MAX_BUFFER);
    if (existsSync(concatList)) unlinkSync(concatList);

    // --- Phase 5: Audio mix ---
    broadcast({ type: "render-phase", phase: "Mixing audio..." });

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
          audioErrors.push((err as Error).message);
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
        audioErrors.push((err as Error).message);
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
      ], FFMPEG_MAX_BUFFER);

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
    // concatList cleaned up inside the fast-path block
    // Clean up filter script files
    for (let j = 0; j < filterScriptCounter; j++) {
      const p = join(OUTPUT_DIR, `_filter_${j}.txt`);
      if (existsSync(p)) unlinkSync(p);
    }

    broadcast({ type: "render-complete", output: outputFile, filename: outputFilename });
  } catch (err) {
    broadcast({ type: "render-error", errors: [(err as Error).message] });
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
    const files = listFilesByExt(CACHE_DIR, [".mov", ".mp4"]);
    const totalSize = files.reduce((sum, f) => sum + statSync(join(CACHE_DIR, f)).size, 0);
    res.json({ entries: files.length, totalSizeMB: (totalSize / 1024 / 1024).toFixed(1) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete("/api/cache", (req, res) => {
  try {
    const files = listFilesByExt(CACHE_DIR, [".mov", ".mp4"]);
    for (const f of files) unlinkSync(join(CACHE_DIR, f));
    res.json({ ok: true, cleared: files.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Templates API ---

// Load all external templates from the templates directory
function loadExternalTemplates() {
  const templates: Record<string, any> = {};
  try {
    const files = listFilesByExt(TEMPLATES_DIR, [".yaml", ".yml"]);
    for (const f of files) {
      try {
        const { parsed } = loadYamlFile(join(TEMPLATES_DIR, f));
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
    const list = Object.entries(templates).map(([name, parsed]: [string, any]) => ({
      name,
      type: parsed.type || "unknown",
      parsed,
      modified: statSync(join(TEMPLATES_DIR, `${name}.yaml`)).mtime,
    }));
    res.json({ templates: list });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/template/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const filePath = join(TEMPLATES_DIR, `${name}.yaml`);
  if (!existsSync(filePath)) return res.status(404).json({ error: "Template not found" });
  try {
    const { raw, parsed, error } = loadYamlFile(filePath);
    if (error) return res.status(500).json({ error });
    res.json({ name, raw, parsed });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- TTS API ---
app.get("/api/tts/voices", async (req, res) => {
  try {
    const voices = await getVoices();
    res.json({ voices });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const result = await synthesize(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
function broadcast(msg: object) {
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
