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
import { buildFadeFilter } from "./types/_helpers.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_DIR = process.cwd();
const LIBRARY_DIR = join(PROJECT_DIR, "library");

// Ensure library directory exists
if (!existsSync(LIBRARY_DIR)) {
  mkdirSync(LIBRARY_DIR, { recursive: true });
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
        return [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);
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
  const json = JSON.stringify(seg, (key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      for (const k of Object.keys(value).sort()) sorted[k] = value[k];
      return sorted;
    }
    return value;
  });
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

function getCachePath(hash) {
  return join(CACHE_DIR, `${hash}.mp4`);
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

  // Cache the result
  try { copyFileSync(outFile, cached); } catch {}
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
function resolveTemplates(project) {
  const templates = project.templates || {};
  const timeline = project.timeline || [];
  return timeline.map((seg) => {
    if (BUILTIN_TYPES.has(seg.type)) return seg;
    const template = templates[seg.type];
    if (!template) return seg; // unknown type, leave as-is for error reporting
    return deepMerge(template, seg);
  });
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
    rendererRegistry, OUTPUT_DIR, renderCached,
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

    // Concatenate all segments
    const concatList = join(OUTPUT_DIR, "_concat.txt");
    const concatContent = tempFiles.map((f) => `file '${f}'`).join("\n");
    writeFileSync(concatList, concatContent);

    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatList,
      "-c", "copy",
      "-movflags", "+faststart",
      outputFile,
    ], { maxBuffer: 50 * 1024 * 1024 });

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

const PORT = process.env.PORT || 3344;
server.listen(PORT, () => {
  console.log(`SpliceRack is running at http://localhost:${PORT}`);
});
