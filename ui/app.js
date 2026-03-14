const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let currentFile = null;
let markIn = null;
let markOut = null;
let clips = [];
let currentProject = null;
let projectData = null;
let currentOutput = null;

// Elements
const dropZone = $("#drop-zone");
const fileInput = $("#file-input");
const libraryList = $("#library-list");
const video = $("#video-player");
const viewerTitle = $("#viewer-title");
const clipControls = $("#clip-controls");
const clipsSection = $("#clips-section");
const clipsList = $("#clips-list");
const scrubber = $("#scrubber");
const currentTimeDisplay = $("#current-time");
const durationDisplay = $("#duration");
const markInDisplay = $("#mark-in-display");
const markOutDisplay = $("#mark-out-display");
const clipNameInput = $("#clip-name-input");
const yamlEditor = $("#yaml-editor");
const projectSelect = $("#project-select");
const timelineTrack = $("#timeline-track");
const renderStatus = $("#render-status");
const renderProgressFill = $("#render-progress-fill");
const renderStatusText = $("#render-status-text");
const outputsList = $("#outputs-list");
const outputPlayer = $("#output-player");
const outputViewerTitle = $("#output-viewer-title");
const outputInfo = $("#output-info");
const outputFileSize = $("#output-file-size");

// Format time as M:SS.mmm
function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

// --- Tabs ---
function switchTab(tabId) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
  $$(".tab-content").forEach((c) => c.classList.toggle("active", c.id === tabId));
  if (tabId === "timeline-tab") loadProjects();
  if (tabId === "outputs-tab") loadOutputs();
}

for (const tab of $$(".tab")) {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
}

// --- File upload ---
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  uploadFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  uploadFiles(fileInput.files);
  fileInput.value = "";
});

async function uploadFiles(files) {
  const form = new FormData();
  for (const f of files) {
    form.append("files", f);
  }
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    console.log("Uploaded:", data.uploaded);
    loadLibrary();
  } catch (err) {
    console.error("Upload failed:", err);
  }
}

// --- Library ---
async function loadLibrary() {
  try {
    const res = await fetch("/api/library");
    const data = await res.json();
    renderLibrary(data.files);
  } catch (err) {
    console.error("Failed to load library:", err);
  }
}

function renderLibrary(files) {
  libraryList.innerHTML = "";
  for (const f of files) {
    const li = document.createElement("li");
    li.textContent = f.name;
    li.title = `${(f.size / 1024 / 1024).toFixed(1)} MB`;
    if (f.name === currentFile) li.classList.add("active");
    li.addEventListener("click", () => selectVideo(f.name));
    libraryList.appendChild(li);
  }
}

// --- Video selection & playback ---
function selectVideo(filename) {
  currentFile = filename;
  markIn = null;
  markOut = null;
  markInDisplay.textContent = "--:--.---";
  markOutDisplay.textContent = "--:--.---";
  clipNameInput.value = "";

  viewerTitle.textContent = filename;
  video.src = `/library/${encodeURIComponent(filename)}`;
  video.load();
  clipControls.style.display = "";
  clipsSection.style.display = "";

  for (const li of libraryList.children) {
    li.classList.toggle("active", li.textContent === filename);
  }

  loadClips();
}

video.addEventListener("loadedmetadata", () => {
  scrubber.max = Math.floor(video.duration * 1000);
  durationDisplay.textContent = formatTime(video.duration);
});

video.addEventListener("timeupdate", () => {
  if (!video.seeking) {
    scrubber.value = Math.floor(video.currentTime * 1000);
  }
  currentTimeDisplay.textContent = formatTime(video.currentTime);
});

scrubber.addEventListener("input", () => {
  video.currentTime = scrubber.value / 1000;
});

// --- Clip marking ---
$("#btn-mark-in").addEventListener("click", () => {
  markIn = video.currentTime;
  markInDisplay.textContent = formatTime(markIn);
});

$("#btn-mark-out").addEventListener("click", () => {
  markOut = video.currentTime;
  markOutDisplay.textContent = formatTime(markOut);
});

$("#btn-save-clip").addEventListener("click", () => {
  const name = clipNameInput.value.trim();
  if (!name) return alert("Enter a clip name");
  if (markIn == null) return alert("Set an in point first");
  if (markOut == null) return alert("Set an out point first");
  if (markOut <= markIn) return alert("Out point must be after in point");

  if (clips.some((c) => c.name === name)) {
    if (!confirm(`Clip "${name}" already exists. Overwrite?`)) return;
    clips = clips.filter((c) => c.name !== name);
  }

  clips.push({
    name,
    start: Math.round(markIn * 1000) / 1000,
    end: Math.round(markOut * 1000) / 1000,
  });

  saveClips();
  clipNameInput.value = "";
});

// --- Clips CRUD ---
async function loadClips() {
  if (!currentFile) return;
  try {
    const res = await fetch(`/api/clips/${encodeURIComponent(currentFile)}`);
    const data = await res.json();
    clips = data.clips || [];
    renderClips();
  } catch (err) {
    console.error("Failed to load clips:", err);
  }
}

async function saveClips() {
  if (!currentFile) return;
  try {
    await fetch(`/api/clips/${encodeURIComponent(currentFile)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips }),
    });
    renderClips();
  } catch (err) {
    console.error("Failed to save clips:", err);
  }
}

function renderClips() {
  clipsList.innerHTML = "";
  for (const clip of clips) {
    const li = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.className = "clip-name";
    nameSpan.textContent = clip.name;

    const timesSpan = document.createElement("span");
    timesSpan.className = "clip-times";
    timesSpan.textContent = `${formatTime(clip.start)} -> ${formatTime(clip.end)} (${formatTime(clip.end - clip.start)})`;

    const actions = document.createElement("span");
    actions.className = "clip-actions";

    const playBtn = document.createElement("button");
    playBtn.textContent = "Play";
    playBtn.addEventListener("click", () => {
      video.currentTime = clip.start;
      video.play();
      const checkEnd = () => {
        if (video.currentTime >= clip.end) {
          video.pause();
          video.removeEventListener("timeupdate", checkEnd);
        }
      };
      video.addEventListener("timeupdate", checkEnd);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (confirm(`Delete clip "${clip.name}"?`)) {
        clips = clips.filter((c) => c !== clip);
        saveClips();
      }
    });

    actions.appendChild(playBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(nameSpan);
    li.appendChild(timesSpan);
    li.appendChild(actions);
    clipsList.appendChild(li);
  }
}

// =====================================================
// TIMELINE / PROJECT
// =====================================================

// --- Projects ---
async function loadProjects() {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    projectSelect.innerHTML = '<option value="">-- Select project --</option>';
    for (const f of data.files) {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = f.name;
      if (f.name === currentProject) opt.selected = true;
      projectSelect.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load projects:", err);
  }
}

projectSelect.addEventListener("change", () => {
  const filename = projectSelect.value;
  if (filename) {
    loadProject(filename);
  } else {
    currentProject = null;
    projectData = null;
    yamlEditor.value = "";
    renderTimeline();
  }
});

$("#btn-new-project").addEventListener("click", () => {
  const name = prompt("Project filename (e.g. my-video.yaml):");
  if (!name) return;
  const filename = name.endsWith(".yaml") || name.endsWith(".yml") ? name : name + ".yaml";

  const template = `# vAIdeo Project
output:
  width: 1920
  height: 1080
  fps: 30
  background: "#1a1a2e"

timeline:
  - type: caption
    text: "Hello World"
    duration: 3
    style:
      font-size: 64
      color: "#ffffff"
      background: "#1a1a2e"
      align: center
      valign: middle
    fade-in: 0.5
    fade-out: 0.5
`;

  yamlEditor.value = template;
  currentProject = filename;
  saveYaml();
});

async function loadProject(filename) {
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(filename)}`);
    const data = await res.json();
    currentProject = filename;
    yamlEditor.value = data.raw;
    if (data.parsed) {
      projectData = data.parsed;
    } else {
      projectData = null;
    }
    renderTimeline();
  } catch (err) {
    console.error("Failed to load project:", err);
  }
}

$("#btn-save-yaml").addEventListener("click", saveYaml);

async function saveYaml() {
  if (!currentProject) return alert("No project selected");
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(currentProject)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: yamlEditor.value }),
    });
    const data = await res.json();
    if (data.ok) {
      // Re-parse to update timeline
      parseYamlAndRender();
      loadProjects();
    }
  } catch (err) {
    console.error("Failed to save:", err);
  }
}

function parseYamlAndRender() {
  try {
    // Simple YAML-like parsing for display purposes
    // The server does the real parsing - we just need to show the timeline
    const text = yamlEditor.value;
    // Fetch parsed version from server
    fetch(`/api/project/${encodeURIComponent(currentProject)}`)
      .then((r) => r.json())
      .then((data) => {
        projectData = data.parsed;
        renderTimeline();
      });
  } catch (err) {
    console.error("Parse error:", err);
  }
}

// --- Clip metadata cache (source -> clips array) ---
const clipCache = {};

async function getClipsForSource(source) {
  if (clipCache[source]) return clipCache[source];
  try {
    const res = await fetch(`/api/clips/${encodeURIComponent(source)}`);
    const data = await res.json();
    clipCache[source] = data.clips || [];
  } catch {
    clipCache[source] = [];
  }
  return clipCache[source];
}

function resolveClipTimes(seg, sourceClips) {
  if (seg.start != null && seg.end != null) {
    return { start: seg.start, end: seg.end };
  }
  if (seg.clip) {
    const found = sourceClips.find((c) => c.name === seg.clip);
    if (found) return { start: found.start, end: found.end };
  }
  return null;
}

// --- Template resolution (client-side, mirrors server logic) ---
const BUILTIN_TYPES = new Set(["caption", "clip", "image", "pause"]);

function resolveTemplate(seg, templates) {
  if (BUILTIN_TYPES.has(seg.type)) return seg;
  const template = templates[seg.type];
  if (!template) return seg;
  return deepMerge(template, seg);
}

function deepMerge(base, override) {
  const result = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(override)])) {
    const bVal = base[key];
    const oVal = override[key];
    if (key === "type") {
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

// --- Timeline rendering ---
async function renderTimeline() {
  timelineTrack.innerHTML = "";

  if (!projectData || !projectData.timeline || projectData.timeline.length === 0) {
    timelineTrack.innerHTML = '<div class="timeline-empty">No segments in timeline</div>';
    return;
  }

  const templates = projectData.templates || {};

  // Resolve templates for display
  const resolved = projectData.timeline.map((seg) => resolveTemplate(seg, templates));

  // Pre-fetch clip metadata for all sources referenced in timeline
  const sources = [...new Set(
    resolved
      .filter((s) => s.type === "clip" && s.source)
      .map((s) => s.source)
  )];
  await Promise.all(sources.map(getClipsForSource));

  let dragSrcIndex = null;

  resolved.forEach((seg, index) => {
    const rawSeg = projectData.timeline[index]; // original (may have template name)
    const templateName = BUILTIN_TYPES.has(rawSeg.type) ? null : rawSeg.type;

    const div = document.createElement("div");
    div.className = "timeline-segment";
    div.draggable = true;
    div.dataset.index = index;

    // Type badge
    const badge = document.createElement("div");
    badge.className = `seg-type-badge seg-type-${seg.type}`;
    badge.textContent = templateName || seg.type;

    // Thumbnail (for clips)
    let thumbnail = null;
    let clipTimes = null;
    if (seg.type === "clip" && seg.source) {
      const sourceClips = clipCache[seg.source] || [];
      clipTimes = resolveClipTimes(seg, sourceClips);
      if (clipTimes) {
        thumbnail = document.createElement("img");
        thumbnail.className = "seg-thumbnail";
        thumbnail.src = `/api/thumbnail/${encodeURIComponent(seg.source)}?time=${clipTimes.start}`;
        thumbnail.alt = seg.clip || "clip";
      }
    }

    // Info
    const info = document.createElement("div");
    info.className = "seg-info";

    const title = document.createElement("div");
    title.className = "seg-title";
    const detail = document.createElement("div");
    detail.className = "seg-detail";

    if (seg.type === "caption") {
      title.textContent = seg.text || "(empty caption)";
      detail.textContent = `${seg.duration || 3}s`;
    } else if (seg.type === "clip") {
      title.textContent = seg.clip || `${seg.source} [${seg.start}-${seg.end}]`;
      const parts = [seg.source || ""];
      if (clipTimes) {
        const dur = clipTimes.end - clipTimes.start;
        const speed = seg.speed || 1;
        parts.push(`${formatTime(dur / speed)}`);
      }
      if (seg.speed && seg.speed !== 1) parts.push(`@ ${seg.speed}x`);
      detail.textContent = parts.join("  ");
    } else if (seg.type === "image") {
      title.textContent = seg.source || "(no source)";
      detail.textContent = `${seg.duration || 5}s`;
      if (seg.animation) detail.textContent += ` [${seg.animation.type}]`;
    } else if (seg.type === "pause") {
      title.textContent = "Pause";
      detail.textContent = `${seg.duration || 1}s`;
    } else {
      title.textContent = seg.type;
    }

    info.appendChild(title);
    info.appendChild(detail);

    // Actions
    const actions = document.createElement("div");
    actions.className = "seg-actions";

    const moveUpBtn = document.createElement("button");
    moveUpBtn.textContent = "Up";
    moveUpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveSegment(index, index - 1);
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.textContent = "Down";
    moveDownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveSegment(index, index + 1);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "seg-delete";
    deleteBtn.textContent = "Del";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete segment ${index + 1} (${seg.type})?`)) {
        projectData.timeline.splice(index, 1);
        syncYamlFromData();
      }
    });

    if (index > 0) actions.appendChild(moveUpBtn);
    if (index < projectData.timeline.length - 1) actions.appendChild(moveDownBtn);
    actions.appendChild(deleteBtn);

    div.appendChild(badge);
    if (thumbnail) div.appendChild(thumbnail);
    div.appendChild(info);
    div.appendChild(actions);

    // Click to select corresponding YAML
    div.addEventListener("click", () => {
      $$(".timeline-segment.selected").forEach((s) => s.classList.remove("selected"));
      div.classList.add("selected");
      selectYamlSegment(index);
    });

    // Drag and drop reordering
    div.addEventListener("dragstart", (e) => {
      dragSrcIndex = index;
      div.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    div.addEventListener("dragend", () => {
      div.classList.remove("dragging");
      $$(".timeline-segment").forEach((s) => s.classList.remove("drag-over"));
    });

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      div.classList.add("drag-over");
    });

    div.addEventListener("dragleave", () => {
      div.classList.remove("drag-over");
    });

    div.addEventListener("drop", (e) => {
      e.preventDefault();
      div.classList.remove("drag-over");
      if (dragSrcIndex != null && dragSrcIndex !== index) {
        moveSegment(dragSrcIndex, index);
      }
      dragSrcIndex = null;
    });

    timelineTrack.appendChild(div);
  });
}

function selectYamlSegment(index) {
  const text = yamlEditor.value;
  // Find all "  - type:" occurrences which mark segment starts
  const pattern = /^[ \t]*- type:/gm;
  const starts = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    starts.push(match.index);
  }
  if (index >= starts.length) return;

  const selStart = starts[index];
  const selEnd = index + 1 < starts.length ? starts[index + 1] : text.length;

  // Trim trailing blank lines from selection
  const selected = text.slice(selStart, selEnd);
  const trimmed = selected.replace(/\n\s*$/, "\n");

  yamlEditor.focus();
  yamlEditor.selectionStart = selStart;
  yamlEditor.selectionEnd = selStart + trimmed.length;

  // Scroll the textarea so the selection is visible
  // Approximate: count newlines before selection to estimate scroll position
  const linesBefore = text.slice(0, selStart).split("\n").length - 1;
  const lineHeight = 18; // approximate
  yamlEditor.scrollTop = Math.max(0, linesBefore * lineHeight - 40);
}

function moveSegment(from, to) {
  if (to < 0 || to >= projectData.timeline.length) return;
  const [item] = projectData.timeline.splice(from, 1);
  projectData.timeline.splice(to, 0, item);
  syncYamlFromData();
}

// Update YAML text from the in-memory data and save
function syncYamlFromData() {
  // Build YAML manually for a nice readable format
  const lines = [];

  // Preserve output section from current YAML or use defaults
  const output = projectData.output || {};
  lines.push("output:");
  lines.push(`  width: ${output.width || 1920}`);
  lines.push(`  height: ${output.height || 1080}`);
  lines.push(`  fps: ${output.fps || 30}`);
  lines.push(`  background: "${output.background || "#1a1a2e"}"`);
  lines.push("");
  lines.push("timeline:");

  for (const seg of projectData.timeline) {
    lines.push(`  - type: ${seg.type}`);
    if (seg.type === "caption") {
      lines.push(`    text: "${(seg.text || "").replace(/"/g, '\\"')}"`);
      lines.push(`    duration: ${seg.duration || 3}`);
      if (seg.style) {
        lines.push("    style:");
        for (const [k, v] of Object.entries(seg.style)) {
          lines.push(`      ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
        }
      }
    } else if (seg.type === "clip") {
      lines.push(`    source: ${seg.source}`);
      if (seg.clip) lines.push(`    clip: ${seg.clip}`);
      if (seg.start != null) lines.push(`    start: ${seg.start}`);
      if (seg.end != null) lines.push(`    end: ${seg.end}`);
      if (seg.speed && seg.speed !== 1) lines.push(`    speed: ${seg.speed}`);
      if (seg.overlay) {
        lines.push("    overlay:");
        for (const ov of seg.overlay) {
          lines.push(`      - type: ${ov.type}`);
          if (ov.text) lines.push(`        text: "${ov.text.replace(/"/g, '\\"')}"`);
          if (ov.style) {
            lines.push("        style:");
            for (const [k, v] of Object.entries(ov.style)) {
              lines.push(`          ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
            }
          }
        }
      }
    } else if (seg.type === "image") {
      lines.push(`    source: ${seg.source}`);
      lines.push(`    duration: ${seg.duration || 5}`);
      if (seg.animation) {
        lines.push("    animation:");
        lines.push(`      type: ${seg.animation.type}`);
        if (seg.animation.from) {
          lines.push(`      from: { x: ${seg.animation.from.x || 0}, y: ${seg.animation.from.y || 0}, scale: ${seg.animation.from.scale || 1} }`);
        }
        if (seg.animation.to) {
          lines.push(`      to: { x: ${seg.animation.to.x || 0}, y: ${seg.animation.to.y || 0}, scale: ${seg.animation.to.scale || 1} }`);
        }
      }
    } else if (seg.type === "pause") {
      lines.push(`    duration: ${seg.duration || 1}`);
      if (seg.background) lines.push(`    background: "${seg.background}"`);
    }

    // Common properties
    if (seg["fade-in"]) lines.push(`    fade-in: ${seg["fade-in"]}`);
    if (seg["fade-out"]) lines.push(`    fade-out: ${seg["fade-out"]}`);

    lines.push("");
  }

  yamlEditor.value = lines.join("\n");
  saveYaml();
}

// --- Add segment buttons ---
$("#btn-add-caption").addEventListener("click", () => {
  if (!projectData) return alert("Open or create a project first");
  projectData.timeline.push({
    type: "caption",
    text: "New caption",
    duration: 3,
    style: {
      "font-size": 48,
      color: "#ffffff",
      background: "#1a1a2e",
      align: "center",
      valign: "middle",
    },
    "fade-in": 0.5,
    "fade-out": 0.5,
  });
  syncYamlFromData();
});

$("#btn-add-clip").addEventListener("click", async () => {
  if (!projectData) return alert("Open or create a project first");

  // Get available library files and their clips
  let libraryFiles;
  try {
    const res = await fetch("/api/library");
    libraryFiles = (await res.json()).files;
  } catch {
    return alert("Failed to load library");
  }

  if (libraryFiles.length === 0) return alert("No videos in library. Add some in the Library tab.");

  const source = prompt(
    "Source video file:\n" + libraryFiles.map((f) => `  ${f.name}`).join("\n")
  );
  if (!source) return;

  // Check for clips
  let clipName = null;
  try {
    const res = await fetch(`/api/clips/${encodeURIComponent(source)}`);
    const data = await res.json();
    if (data.clips && data.clips.length > 0) {
      clipName = prompt(
        "Clip name (or leave empty for manual start/end):\n" +
          data.clips.map((c) => `  ${c.name} (${formatTime(c.start)} -> ${formatTime(c.end)})`).join("\n")
      );
    }
  } catch {
    // No clips, that's fine
  }

  const seg = { type: "clip", source };
  if (clipName) {
    seg.clip = clipName;
  } else {
    const start = prompt("Start time (seconds):", "0");
    const end = prompt("End time (seconds):", "10");
    seg.start = parseFloat(start) || 0;
    seg.end = parseFloat(end) || 10;
  }

  projectData.timeline.push(seg);
  syncYamlFromData();
});

$("#btn-add-pause").addEventListener("click", () => {
  if (!projectData) return alert("Open or create a project first");
  projectData.timeline.push({
    type: "pause",
    duration: 1.5,
    background: "#1a1a2e",
  });
  syncYamlFromData();
});

$("#btn-add-image").addEventListener("click", () => {
  if (!projectData) return alert("Open or create a project first");
  const source = prompt("Image filename (must be in library/ folder):");
  if (!source) return;
  projectData.timeline.push({
    type: "image",
    source,
    duration: 5,
    "fade-in": 0.5,
    "fade-out": 0.5,
  });
  syncYamlFromData();
});

// --- Render ---
$("#btn-render").addEventListener("click", async () => {
  if (!currentProject) return alert("No project selected");

  // Save first
  await saveYaml();

  renderStatus.style.display = "";
  renderProgressFill.style.width = "0%";
  renderStatusText.textContent = "Starting render...";

  try {
    const res = await fetch(`/api/render/${encodeURIComponent(currentProject)}`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.error) {
      renderStatusText.textContent = `Error: ${data.error}`;
    }
  } catch (err) {
    renderStatusText.textContent = `Error: ${err.message}`;
  }
});

// =====================================================
// OUTPUTS
// =====================================================

async function loadOutputs() {
  try {
    const res = await fetch("/api/outputs");
    const data = await res.json();
    renderOutputsList(data.files);
  } catch (err) {
    console.error("Failed to load outputs:", err);
  }
}

function renderOutputsList(files) {
  outputsList.innerHTML = "";
  for (const f of files) {
    const li = document.createElement("li");
    const sizeMB = (f.size / 1024 / 1024).toFixed(1);
    li.textContent = f.name;
    li.title = `${sizeMB} MB - ${new Date(f.modified).toLocaleString()}`;
    if (f.name === currentOutput) li.classList.add("active");
    li.addEventListener("click", () => selectOutput(f.name));
    outputsList.appendChild(li);
  }
}

function selectOutput(filename) {
  currentOutput = filename;
  outputViewerTitle.textContent = filename;
  outputPlayer.src = `/output/${encodeURIComponent(filename)}`;
  outputPlayer.load();
  outputInfo.style.display = "";

  // Update active highlight
  for (const li of outputsList.children) {
    li.classList.toggle("active", li.textContent === filename);
  }

  // Fetch file size
  fetch("/api/outputs")
    .then((r) => r.json())
    .then((data) => {
      const f = data.files.find((x) => x.name === filename);
      if (f) {
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        outputFileSize.textContent = `${sizeMB} MB - ${new Date(f.modified).toLocaleString()}`;
      }
    });
}

$("#btn-delete-output").addEventListener("click", async () => {
  if (!currentOutput) return;
  if (!confirm(`Delete "${currentOutput}"? This cannot be undone.`)) return;
  try {
    await fetch(`/api/outputs/${encodeURIComponent(currentOutput)}`, { method: "DELETE" });
    currentOutput = null;
    outputPlayer.src = "";
    outputViewerTitle.textContent = "Select an output";
    outputInfo.style.display = "none";
    loadOutputs();
  } catch (err) {
    console.error("Failed to delete output:", err);
  }
});

// --- WebSocket for live updates ---
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}`);
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "library-updated") {
      loadLibrary();
    } else if (msg.type === "clips-updated") {
      delete clipCache[msg.filename];
      if (msg.filename === currentFile) loadClips();
      if (projectData) renderTimeline();
    } else if (msg.type === "project-updated") {
      loadProjects();
    } else if (msg.type === "render-started") {
      renderStatus.style.display = "";
      renderStatusText.textContent = "Rendering...";
    } else if (msg.type === "render-progress") {
      const pct = ((msg.segment + 1) / msg.total) * 100;
      renderProgressFill.style.width = `${pct}%`;
      renderStatusText.textContent = `Rendering segment ${msg.segment + 1}/${msg.total} (${msg.segmentType})...`;
    } else if (msg.type === "render-complete") {
      renderProgressFill.style.width = "100%";
      renderStatusText.textContent = "Render complete!";
      setTimeout(() => {
        renderStatus.style.display = "none";
      }, 3000);
      // Navigate to outputs tab and select the new file
      if (msg.filename) {
        switchTab("outputs-tab");
        loadOutputs().then(() => selectOutput(msg.filename));
      }
    } else if (msg.type === "outputs-updated") {
      loadOutputs();
    } else if (msg.type === "render-error") {
      renderStatusText.textContent = `Render failed: ${msg.errors.join("; ")}`;
    }
  });
  ws.addEventListener("close", () => {
    setTimeout(connectWS, 2000);
  });
}

// Handle tab in YAML editor (insert spaces instead of changing focus)
yamlEditor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = yamlEditor.selectionStart;
    const end = yamlEditor.selectionEnd;
    yamlEditor.value = yamlEditor.value.substring(0, start) + "  " + yamlEditor.value.substring(end);
    yamlEditor.selectionStart = yamlEditor.selectionEnd = start + 2;
  }
});

// --- Init ---
loadLibrary();
connectWS();
