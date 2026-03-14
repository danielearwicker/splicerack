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
import yaml from "js-yaml";

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

// Built-in segment types
const BUILTIN_TYPES = new Set(["caption", "clip", "image", "pause"]);

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
        if (seg.type === "caption") {
          await renderCaption(seg, tempFile, width, height, fps, bg);
        } else if (seg.type === "clip") {
          await renderClipSegment(seg, tempFile, width, height, fps);
        } else if (seg.type === "image") {
          await renderImage(seg, tempFile, width, height, fps);
        } else if (seg.type === "pause") {
          await renderPause(seg, tempFile, width, height, fps, bg);
        } else {
          errors.push(`Unknown segment type: ${seg.type}`);
        }
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

// --- Segment renderers ---

async function renderCaption(seg, outFile, width, height, fps, defaultBg) {
  const duration = seg.duration || 3;
  const style = seg.style || {};
  const fontSize = style["font-size"] || 48;
  const color = (style.color || "#ffffff").replace("#", "");
  const bgColor = (style.background || defaultBg).replace("#", "");
  const align = style.align || "center";
  const valign = style.valign || "middle";

  // Map align/valign to FFmpeg drawtext x/y expressions
  const xExpr =
    align === "left" ? "50" : align === "right" ? "(w-text_w-50)" : "((w-text_w)/2)";
  const yExpr =
    valign === "top" ? "50" : valign === "bottom" ? "(h-text_h-50)" : "((h-text_h)/2)";

  // Escape text for FFmpeg drawtext
  const escapedText = seg.text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%");

  const fadeFilter = buildFadeFilter(seg, duration);

  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${bgColor}:s=${width}x${height}:d=${duration}:r=${fps}`,
    "-vf",
    `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xExpr}:y=${yExpr}${fadeFilter}`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-t", String(duration),
    outFile,
  ], { maxBuffer: 50 * 1024 * 1024 });
}

async function renderClipSegment(seg, outFile, width, height, fps) {
  const { start, end } = resolveClip(seg);
  const duration = end - start;
  const speed = seg.speed || 1.0;
  const sourcePath = join(LIBRARY_DIR, seg.source);

  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${seg.source}`);
  }

  const fadeFilter = buildFadeFilter(seg, duration / speed);

  // Build overlay filters if present
  let overlayFilters = "";
  if (seg.overlay && seg.overlay.length > 0) {
    for (const ov of seg.overlay) {
      if (ov.type === "caption") {
        const style = ov.style || {};
        const fontSize = style["font-size"] || 36;
        const color = (style.color || "#ffffff").replace("#", "");
        const ovAlign = style.align || "center";
        const ovValign = style.valign || "bottom";
        const xExpr =
          ovAlign === "left" ? "50" : ovAlign === "right" ? "(w-text_w-50)" : "((w-text_w)/2)";
        const yExpr =
          ovValign === "top" ? "50" : ovValign === "bottom" ? "(h-text_h-50)" : "((h-text_h)/2)";
        const escapedText = ov.text
          .replace(/\\/g, "\\\\\\\\")
          .replace(/'/g, "\u2019")
          .replace(/:/g, "\\:")
          .replace(/%/g, "%%");
        overlayFilters += `,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xExpr}:y=${yExpr}`;
      }
    }
  }

  const vfParts = [];
  vfParts.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);
  if (speed !== 1.0) {
    vfParts.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
  }
  if (overlayFilters) {
    vfParts.push(overlayFilters.slice(1)); // remove leading comma
  }
  if (fadeFilter) {
    vfParts.push(fadeFilter.slice(1)); // remove leading comma
  }

  const args = [
    "-y",
    "-ss", String(start),
    "-to", String(end),
    "-i", sourcePath,
    "-vf", vfParts.join(","),
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-an",
    "-r", String(fps),
    outFile,
  ];

  // If there's audio and no speed change, include it
  if (speed === 1.0 && !seg.audio) {
    args.splice(args.indexOf("-an"), 1);
    args.splice(args.indexOf(outFile), 0, "-c:a", "aac", "-b:a", "128k");
  }

  await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
}

async function renderImage(seg, outFile, width, height, fps) {
  const duration = seg.duration || 5;
  const sourcePath = join(LIBRARY_DIR, seg.source);

  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${seg.source}`);
  }

  const fadeFilter = buildFadeFilter(seg, duration);

  // Basic: scale and pad image, loop for duration
  // Animation support for pan/zoom
  let vf;
  if (seg.animation) {
    const anim = seg.animation;
    if (anim.type === "ken-burns" || anim.type === "zoom" || anim.type === "pan") {
      const from = anim.from || { x: 0, y: 0, scale: 1.0 };
      const to = anim.to || { x: 0, y: 0, scale: 1.2 };
      // Use zoompan filter
      const zStart = from.scale || 1.0;
      const zEnd = to.scale || 1.2;
      const totalFrames = duration * fps;
      const xStart = from.x || 0;
      const xEnd = to.x || 0;
      const yStart = from.y || 0;
      const yEnd = to.y || 0;
      vf = `zoompan=z='${zStart}+(${zEnd}-${zStart})*on/${totalFrames}':x='${xStart}+(${xEnd}-${xStart})*on/${totalFrames}':y='${yStart}+(${yEnd}-${yStart})*on/${totalFrames}':d=${totalFrames}:s=${width}x${height}:fps=${fps}${fadeFilter}`;
    } else {
      vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2${fadeFilter}`;
    }
  } else {
    vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2${fadeFilter}`;
  }

  await execFileAsync("ffmpeg", [
    "-y",
    "-loop", "1",
    "-i", sourcePath,
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-t", String(duration),
    "-r", String(fps),
    outFile,
  ], { maxBuffer: 50 * 1024 * 1024 });
}

async function renderPause(seg, outFile, width, height, fps, defaultBg) {
  const duration = seg.duration || 1;
  const bgColor = (seg.background || defaultBg).replace("#", "");

  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${bgColor}:s=${width}x${height}:d=${duration}:r=${fps}`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-t", String(duration),
    outFile,
  ], { maxBuffer: 50 * 1024 * 1024 });
}

function buildFadeFilter(seg, duration) {
  const parts = [];
  if (seg["fade-in"]) {
    parts.push(`fade=t=in:st=0:d=${seg["fade-in"]}`);
  }
  if (seg["fade-out"]) {
    const fadeStart = duration - seg["fade-out"];
    parts.push(`fade=t=out:st=${fadeStart.toFixed(3)}:d=${seg["fade-out"]}`);
  }
  return parts.length ? "," + parts.join(",") : "";
}

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
  console.log(`vAIdeo is running at http://localhost:${PORT}`);
});
