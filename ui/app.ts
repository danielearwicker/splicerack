const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => document.querySelectorAll(sel);

// --- DOM helpers ---
function createOption(value: string, text: string, selected?: boolean): HTMLOptionElement {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = text;
  if (selected) opt.selected = true;
  return opt;
}

function createOptgroup(label: string, options: Array<{ value: string; text: string; selected?: boolean }>): HTMLOptGroupElement {
  const group = document.createElement("optgroup");
  group.label = label;
  for (const o of options) group.appendChild(createOption(o.value, o.text, o.selected));
  return group;
}

// State
let currentFile: string | null = null;
let markIn: number | null = null;
let markOut: number | null = null;
let clips: any[] = [];
let currentProject: string | null = null;
let projectData: any = null;
let currentOutput: string | null = null;
let externalTemplatesCache: Record<string, any> = {};
let currentTemplateName: string | null = null;
let currentTemplateData: any = null;

// Undo/Redo
const undoStack: string[] = [];
const redoStack: string[] = [];
const MAX_UNDO = 50;
let undoInProgress = false;

function pushUndo() {
  if (undoInProgress || !projectData) return;
  undoStack.push(JSON.stringify(projectData));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // clear redo on new change
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("btn-undo") as HTMLButtonElement | null;
  const redoBtn = document.getElementById("btn-redo") as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// Elements
const dropZone = $("#drop-zone")!;
const fileInput = $("#file-input") as HTMLInputElement;
const libraryList = $("#library-list")!;
const video = $("#video-player") as HTMLVideoElement;
const viewerTitle = $("#viewer-title")!;
const clipControls = $("#clip-controls")!;
const clipsSection = $("#clips-section")!;
const clipsList = $("#clips-list")!;
const scrubber = $("#scrubber") as HTMLInputElement;
const currentTimeDisplay = $("#current-time")!;
const durationDisplay = $("#duration")!;
const markInDisplay = $("#mark-in-display")!;
const markOutDisplay = $("#mark-out-display")!;
const clipNameInput = $("#clip-name-input") as HTMLInputElement;
const yamlEditor = $("#yaml-editor") as HTMLTextAreaElement;
const projectSelect = $("#project-select") as HTMLSelectElement;
const sequenceTrack = $("#sequence-track")!;
const renderStatus = $("#render-status")!;
const renderProgressFill = $("#render-progress-fill")!;
const renderStatusText = $("#render-status-text")!;
const outputsList = $("#outputs-list")!;
const outputPlayer = $("#output-player") as HTMLVideoElement;
const outputViewerTitle = $("#output-viewer-title")!;
const outputInfo = $("#output-info")!;
const outputFileSize = $("#output-file-size")!;

// --- Async cache factory ---
function createAsyncCache(fetchFn: () => Promise<any>) {
  let cache: any = null;
  return {
    async get() { if (!cache) { try { cache = await fetchFn(); } catch { cache = []; } } return cache; },
    clear() { cache = null; },
  };
}

const libraryStore = createAsyncCache(() => fetch("/api/library?type=all").then(r => r.json()).then(d => d.files || []));
const voicesStore = createAsyncCache(() => fetch("/api/tts/voices").then(r => r.json()).then(d => d.voices || []));
const audioFilesStore = createAsyncCache(() => fetch("/api/library?type=audio").then(r => r.json()).then(d => d.files || []));

async function getLibraryFiles(accept?: string[]) {
  const files = await libraryStore.get();
  if (accept && accept.length > 0) {
    const exts = accept.map((e: string) => e.toLowerCase());
    return files.filter((f: any) => exts.some((ext: string) => f.name.toLowerCase().endsWith(ext)));
  }
  return files;
}
const getVoicesList = () => voicesStore.get();
const getAudioFiles = () => audioFilesStore.get();

// --- Logs ---
const logsContainer = $("#logs-container")!;
const logsProgress = $("#logs-progress")!;
const logsProgressFill = $("#logs-progress-fill")!;
const logsProgressText = $("#logs-progress-text")!;
$("#btn-clear-logs")!.addEventListener("click", () => { logsContainer.innerHTML = ""; });

function addLog(level: string, message: string) {
  const entry = document.createElement("div");
  entry.className = `log-entry log-${level}`;
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  logsContainer.appendChild(entry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function escapeHtml(str: string) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Format time as M:SS.mmm
function formatTime(seconds: number) {
  if (seconds == null || isNaN(seconds)) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

// --- Tabs ---
// --- Routing ---
const TAB_ROUTES: Record<string, string> = {
  "library-tab": "/library",
  "sequence-tab": "/sequence",
  "templates-tab": "/templates",
  "outputs-tab": "/outputs",
  "logs-tab": "/logs",
};
const ROUTE_TABS = Object.fromEntries(Object.entries(TAB_ROUTES).map(([k, v]) => [v, k]));

function switchTab(tabId: string, { pushState = true } = {}) {
  $$(".tab").forEach((t) => t.classList.toggle("active", (t as HTMLElement).dataset.tab === tabId));
  $$(".tab-content").forEach((c) => c.classList.toggle("active", c.id === tabId));
  if (tabId === "sequence-tab") loadProjects();
  if (tabId === "templates-tab") loadTemplatesList();
  if (tabId === "outputs-tab") loadOutputs();

  if (pushState) {
    const basePath = TAB_ROUTES[tabId] || "/";
    let fullPath = basePath;
    if (tabId === "sequence-tab" && currentProject) {
      fullPath = `${basePath}/${encodeURIComponent(currentProject)}`;
    } else if (tabId === "templates-tab" && currentTemplateName) {
      fullPath = `${basePath}/${encodeURIComponent(currentTemplateName)}`;
    } else if (tabId === "outputs-tab" && currentOutput) {
      fullPath = `${basePath}/${encodeURIComponent(currentOutput)}`;
    }
    if (location.pathname !== fullPath) {
      history.pushState(null, "", fullPath);
    }
  }
}

function updateRoute() {
  const basePath = TAB_ROUTES[getActiveTab()] || "/";
  let fullPath = basePath;
  if (getActiveTab() === "sequence-tab" && currentProject) {
    fullPath = `${basePath}/${encodeURIComponent(currentProject)}`;
  } else if (getActiveTab() === "templates-tab" && currentTemplateName) {
    fullPath = `${basePath}/${encodeURIComponent(currentTemplateName)}`;
  } else if (getActiveTab() === "outputs-tab" && currentOutput) {
    fullPath = `${basePath}/${encodeURIComponent(currentOutput)}`;
  }
  if (location.pathname !== fullPath) {
    history.pushState(null, "", fullPath);
  }
}

function getActiveTab() {
  for (const c of $$(".tab-content")) {
    if (c.classList.contains("active")) return c.id;
  }
  return "library-tab";
}

function navigateFromUrl() {
  const path = decodeURIComponent(location.pathname);
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] || "library";
  const param = parts.slice(1).join("/");
  const tabId = ROUTE_TABS[`/${section}`];
  if (!tabId) {
    // Unknown route or root — go to library
    switchTab("library-tab", { pushState: false });
    history.replaceState(null, "", "/library");
    return;
  }

  switchTab(tabId, { pushState: false });

  if (tabId === "sequence-tab" && param) {
    loadProjects().then(() => {
      projectSelect.value = param;
      loadProject(param);
    });
  } else if (tabId === "templates-tab" && param) {
    loadTemplatesList().then(() => selectTemplate(param));
  } else if (tabId === "outputs-tab" && param) {
    loadOutputs().then(() => selectOutput(param));
  }
}

window.addEventListener("popstate", () => navigateFromUrl());

for (const tab of $$(".tab")) {
  tab.addEventListener("click", () => switchTab((tab as HTMLElement).dataset.tab!));
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
  uploadFiles((e as DragEvent).dataTransfer!.files);
});

fileInput.addEventListener("change", () => {
  uploadFiles(fileInput.files!);
  fileInput.value = "";
});

async function uploadFiles(files: FileList) {
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

function renderLibrary(files: any[]) {
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
function selectVideo(filename: string) {
  currentFile = filename;
  markIn = null;
  markOut = null;
  markInDisplay.textContent = "--:--.---";
  markOutDisplay.textContent = "--:--.---";
  clipNameInput.value = "";
  updateScrubberMarks();

  viewerTitle.textContent = filename;
  video.src = `/library/${encodeURIComponent(filename)}`;
  video.load();
  clipControls.style.display = "";
  clipsSection.style.display = "";

  // Probe video metadata and display info
  const videoInfoEl = $("#video-info")!;
  const useFormatBtn = $("#btn-use-format") as HTMLElement;
  videoInfoEl.textContent = "";
  useFormatBtn.style.display = "none";
  (window as any)._currentVideoMeta = null;

  fetch(`/api/probe/${encodeURIComponent(filename)}`)
    .then(r => r.json())
    .then(data => {
      const vs = data.streams?.find((s: any) => s.codec_type === "video");
      if (vs) {
        const w = vs.width;
        const h = vs.height;
        const fpsRaw = vs.r_frame_rate || vs.avg_frame_rate || "";
        const fpsParts = fpsRaw.split("/");
        const fps = fpsParts.length === 2 ? Math.round(parseInt(fpsParts[0]) / parseInt(fpsParts[1])) : parseInt(fpsRaw) || 0;
        videoInfoEl.textContent = `${w}x${h} @ ${fps}fps`;
        (window as any)._currentVideoMeta = { width: w, height: h, fps };
        useFormatBtn.style.display = "";
      }
    })
    .catch(() => {});

  for (const li of libraryList.children) {
    li.classList.toggle("active", li.textContent === filename);
  }

  loadClips();
}

video.addEventListener("loadedmetadata", () => {
  scrubber.max = String(Math.floor(video.duration * 1000));
  durationDisplay.textContent = formatTime(video.duration);
});

video.addEventListener("timeupdate", () => {
  if (!video.seeking) {
    scrubber.value = String(Math.floor(video.currentTime * 1000));
  }
  currentTimeDisplay.textContent = formatTime(video.currentTime);
});

scrubber.addEventListener("input", () => {
  video.currentTime = Number(scrubber.value) / 1000;
});

// --- Step buttons ---
for (const btn of $$(".step-btn")) {
  btn.addEventListener("click", () => {
    const step = parseFloat((btn as HTMLElement).dataset.step || "0");
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + step));
  });
}

// --- Use video format for output ---
$("#btn-use-format")!.addEventListener("click", () => {
  const meta = (window as any)._currentVideoMeta;
  if (!meta) return;
  if (!projectData) return alert("Open a project first (in the Sequence tab)");
  if (!projectData.output) projectData.output = {};
  projectData.output.width = meta.width;
  projectData.output.height = meta.height;
  projectData.output.fps = meta.fps;
  syncYamlFromData();
  addLog("info", `Output format set to ${meta.width}x${meta.height} @ ${meta.fps}fps`);
  alert(`Output set to ${meta.width}x${meta.height} @ ${meta.fps}fps`);
});

// --- Clip marking ---
const scrubberRegion = $("#scrubber-region") as HTMLElement;
const scrubberMarkIn = $("#scrubber-mark-in") as HTMLElement;
const scrubberMarkOut = $("#scrubber-mark-out") as HTMLElement;

function updateScrubberMarks() {
  const dur = video.duration || 1;
  const wrap = $(".scrubber-wrap") as HTMLElement;
  const wrapWidth = wrap.offsetWidth;

  if (markIn != null) {
    const pct = (markIn / dur) * 100;
    scrubberMarkIn.style.display = "";
    scrubberMarkIn.style.left = `${pct}%`;
  } else {
    scrubberMarkIn.style.display = "none";
  }

  if (markOut != null) {
    const pct = (markOut / dur) * 100;
    scrubberMarkOut.style.display = "";
    scrubberMarkOut.style.left = `${pct}%`;
  } else {
    scrubberMarkOut.style.display = "none";
  }

  if (markIn != null && markOut != null && markOut > markIn) {
    const leftPct = (markIn / dur) * 100;
    const widthPct = ((markOut - markIn) / dur) * 100;
    scrubberRegion.style.display = "";
    scrubberRegion.style.left = `${leftPct}%`;
    scrubberRegion.style.width = `${widthPct}%`;
  } else {
    scrubberRegion.style.display = "none";
  }
}

function setMarkIn(time: number) {
  markIn = time;
  markInDisplay.textContent = formatTime(markIn);
  updateScrubberMarks();
}

function setMarkOut(time: number) {
  markOut = time;
  markOutDisplay.textContent = formatTime(markOut);
  updateScrubberMarks();
}

$("#btn-mark-in")!.addEventListener("click", () => setMarkIn(video.currentTime));
$("#btn-mark-out")!.addEventListener("click", () => setMarkOut(video.currentTime));

$("#btn-save-clip")!.addEventListener("click", () => {
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
    // Click the row to load clip times into the editor
    li.style.cursor = "pointer";
    li.addEventListener("click", (e: Event) => {
      // Don't trigger when clicking buttons
      if ((e.target as HTMLElement).tagName === "BUTTON") return;
      setMarkIn(clip.start);
      setMarkOut(clip.end);
      clipNameInput.value = clip.name;
      video.currentTime = clip.start;
      // Highlight the active clip
      for (const child of clipsList.children) {
        (child as HTMLElement).classList.remove("active");
      }
      li.classList.add("active");
    });

    li.appendChild(nameSpan);
    li.appendChild(timesSpan);
    li.appendChild(actions);
    clipsList.appendChild(li);
  }
}

// =====================================================
// SEQUENCE / PROJECT
// =====================================================

// --- Projects ---
async function loadProjects() {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    projectSelect.innerHTML = '';
    projectSelect.appendChild(createOption("", "-- Select project --"));
    for (const f of data.files) {
      projectSelect.appendChild(createOption(f.name, f.name, f.name === currentProject));
    }
  } catch (err) {
    console.error("Failed to load projects:", err);
  }
}

projectSelect.addEventListener("change", () => {
  const filename = projectSelect.value;
  closeEditor();
  if (filename) {
    loadProject(filename);
  } else {
    currentProject = null;
    projectData = null;
    yamlEditor.value = "";
    renderSequence();
  }
});

$("#btn-new-project")!.addEventListener("click", () => {
  const name = prompt("Project filename (e.g. my-video.yaml):");
  if (!name) return;
  const filename = name.endsWith(".yaml") || name.endsWith(".yml") ? name : name + ".yaml";

  const template = `# SpliceRack Project
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

async function loadProject(filename: string) {
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
    renderSequence();
    updateRoute();
  } catch (err) {
    console.error("Failed to load project:", err);
  }
}

// Auto-save on typing with 500ms debounce
let yamlDebounceTimer: ReturnType<typeof setTimeout> | null = null;
yamlEditor.addEventListener("input", () => {
  if (yamlDebounceTimer) clearTimeout(yamlDebounceTimer);
  yamlDebounceTimer = setTimeout(() => {
    if (currentProject) saveYaml();
  }, 500);
});

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
      // Re-parse to update sequence
      parseYamlAndRender();
      loadProjects();
    }
  } catch (err) {
    console.error("Failed to save:", err);
  }
}

// Save to server without re-parsing — used by syncYamlFromData where
// our in-memory projectData is the source of truth.
async function saveYamlQuiet() {
  if (!currentProject) return;
  try {
    await fetch(`/api/project/${encodeURIComponent(currentProject)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: yamlEditor.value }),
    });
  } catch (err) {
    console.error("Failed to save:", err);
  }
}

function parseYamlAndRender() {
  try {
    // Simple YAML-like parsing for display purposes
    // The server does the real parsing - we just need to show the sequence
    const text = yamlEditor.value;
    // Fetch parsed version from server
    fetch(`/api/project/${encodeURIComponent(currentProject!)}`)
      .then((r) => r.json())
      .then((data) => {
        projectData = data.parsed;
        renderSequence();
      });
  } catch (err) {
    console.error("Parse error:", err);
  }
}

// --- Clip metadata cache (source -> clips array) ---
const clipCache: Record<string, any[]> = {};

async function getClipsForSource(source: string) {
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

function resolveClipTimes(seg: any, sourceClips: any[]) {
  if (seg.start != null && seg.end != null) {
    return { start: seg.start, end: seg.end };
  }
  if (seg.clip) {
    const found = sourceClips.find((c: any) => c.name === seg.clip);
    if (found) return { start: found.start, end: found.end };
  }
  return null;
}

// Expose formatTime for type ui.js files
SpliceRack.formatTime = formatTime;

// Helper to check if a type is a known registered type (vs. a template name)
function isKnownType(t: string) {
  return !!SpliceRack.types[t];
}

// Dot-path helpers
function getNestedValue(obj: any, path: string) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNestedValue(obj: any, path: string, value: any) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteNestedValue(obj: any, path: string) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== "object") return;
    cur = cur[parts[i]];
  }
  if (cur != null && typeof cur === "object") {
    delete cur[parts[parts.length - 1]];
  }
}

// --- Shared property field renderer ---
// Factory that creates a DOM element for any schema property type.
// onChange(newValue) is called when the user changes the value.
function renderPropertyField(prop: any, displayValue: any, onChange: (val: any) => void) {
  if (prop.type === "string") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = displayValue != null ? String(displayValue) : "";
    input.addEventListener("change", () => onChange(input.value));
    return input;

  } else if (prop.type === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.value = displayValue != null ? displayValue : "";
    if (prop.min != null) input.min = prop.min;
    if (prop.max != null) input.max = prop.max;
    if (prop.step != null) input.step = prop.step;
    input.addEventListener("change", () => onChange(parseFloat(input.value)));
    return input;

  } else if (prop.type === "color") {
    const pair = document.createElement("div");
    pair.className = "prop-color-pair";
    const cInput = document.createElement("input");
    cInput.type = "color";
    cInput.value = displayValue || "#000000";
    const tInput = document.createElement("input");
    tInput.type = "text";
    tInput.value = displayValue || "";
    cInput.addEventListener("input", () => { tInput.value = cInput.value; onChange(cInput.value); });
    tInput.addEventListener("change", () => { cInput.value = tInput.value; onChange(tInput.value); });
    pair.appendChild(cInput);
    pair.appendChild(tInput);
    return pair;

  } else if (prop.type === "dropdown") {
    const sel = document.createElement("select");
    for (const o of prop.options) {
      sel.appendChild(createOption(o, o, String(displayValue) === o));
    }
    sel.addEventListener("change", () => {
      const v = sel.value === "true" ? true : sel.value === "false" ? false : sel.value;
      onChange(v);
    });
    return sel;

  } else if (prop.type === "file") {
    const sel = document.createElement("select");
    sel.appendChild(createOption("", "-- select file --"));
    getLibraryFiles(prop.accept).then((files) => {
      for (const f of files) {
        sel.appendChild(createOption(f.name, f.name, displayValue === f.name));
      }
    });
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;

  } else if (prop.type === "clip-dropdown") {
    const sel = document.createElement("select");
    sel.appendChild(createOption("", "-- manual start/end --"));
    if (prop._sourceClips) {
      for (const c of prop._sourceClips) {
        sel.appendChild(createOption(c.name, `${c.name} (${formatTime(c.start)} - ${formatTime(c.end)})`, displayValue === c.name));
      }
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;

  } else if (prop.type === "voice-dropdown") {
    const sel = document.createElement("select");
    sel.appendChild(createOption(displayValue || "", displayValue || "Loading voices..."));
    getVoicesList().then((voices) => {
      sel.innerHTML = "";
      sel.appendChild(createOption("", "-- select voice --"));
      for (const v of voices) {
        sel.appendChild(createOption(v.name, `${v.name} (${v.gender}, ${v.localeName})`, displayValue === v.name));
      }
    });
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;

  } else if (prop.type === "audio-file") {
    const sel = document.createElement("select");
    sel.appendChild(createOption("", "-- select audio --"));
    getAudioFiles().then((files) => {
      for (const f of files) {
        sel.appendChild(createOption(f.name, f.name, displayValue === f.name));
      }
    });
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }

  // Fallback for unknown types
  const span = document.createElement("span");
  span.textContent = String(displayValue || "");
  span.style.color = "#808090";
  return span;
}

// --- Template resolution (client-side, mirrors server logic) ---

function resolveTemplate(seg: any, templates: Record<string, any>) {
  if (isKnownType(seg.type)) return seg;
  const template = templates[seg.type];
  if (!template) return seg;
  return deepMerge(template, seg);
}

// deepMerge is provided globally by /api/shared.js

// --- Segment property editor ---
let selectedSegmentIndex: number | null = null;
// libraryFilesCache moved to libraryStore (async cache factory)

const segmentEditor = $("#segment-editor")!;
const editorTypeSelect = $("#editor-type-select") as HTMLSelectElement;
const editorTemplateInfo = $("#editor-template-info")!;
const editorFields = $("#editor-fields")!;

$("#btn-close-editor")!.addEventListener("click", closeEditor);

// Undo/Redo handlers
$("#btn-undo")!.addEventListener("click", () => {
  if (undoStack.length === 0 || !projectData) return;
  undoInProgress = true;
  redoStack.push(JSON.stringify(projectData));
  projectData = JSON.parse(undoStack.pop()!);
  syncAfterUndoRedo();
  undoInProgress = false;
  updateUndoRedoButtons();
});

$("#btn-redo")!.addEventListener("click", () => {
  if (redoStack.length === 0 || !projectData) return;
  undoInProgress = true;
  undoStack.push(JSON.stringify(projectData));
  projectData = JSON.parse(redoStack.pop()!);
  syncAfterUndoRedo();
  undoInProgress = false;
  updateUndoRedoButtons();
});

function syncAfterUndoRedo() {
  // Rebuild YAML from restored projectData without pushing to undo stack
  // (undoInProgress is already true when this is called)
  syncYamlFromData();
  if (selectedSegmentIndex != null) {
    if (selectedSegmentIndex < (projectData.timeline || []).length) {
      renderEditorPanel(selectedSegmentIndex);
    } else {
      closeEditor();
    }
  }
}

// Keyboard shortcuts for undo/redo
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    // Only handle if not typing in an input/textarea
    if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
    e.preventDefault();
    ($("#btn-undo") as HTMLElement).click();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
    if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
    e.preventDefault();
    ($("#btn-redo") as HTMLElement).click();
  }
});

function closeEditor() {
  segmentEditor.style.display = "none";
  selectedSegmentIndex = null;
  $$(".sequence-segment.selected").forEach((s: Element) => s.classList.remove("selected"));
}

// Segment toolbar actions
$("#btn-seg-up")!.addEventListener("click", () => {
  if (selectedSegmentIndex == null || selectedSegmentIndex <= 0) return;
  moveSegment(selectedSegmentIndex, selectedSegmentIndex - 1);
  selectedSegmentIndex--;
  renderEditorPanel(selectedSegmentIndex);
});

$("#btn-seg-down")!.addEventListener("click", () => {
  if (selectedSegmentIndex == null || !projectData) return;
  if (selectedSegmentIndex >= projectData.timeline.length - 1) return;
  moveSegment(selectedSegmentIndex, selectedSegmentIndex + 1);
  selectedSegmentIndex++;
  renderEditorPanel(selectedSegmentIndex);
});

$("#btn-seg-stack")!.addEventListener("click", () => {
  if (selectedSegmentIndex == null || !projectData) return;
  const seg = projectData.timeline[selectedSegmentIndex];
  if (seg.type === "stack") return; // already a stack
  const layer = { ...seg, opacity: 1, delay: 0 };
  const stack = {
    type: "stack",
    background: (projectData.output && projectData.output.background) || "#1a1a2e",
    layers: [layer],
  };
  projectData.timeline[selectedSegmentIndex] = stack;
  syncYamlFromData();
  renderEditorPanel(selectedSegmentIndex);
});

$("#btn-seg-unstack")!.addEventListener("click", () => {
  if (selectedSegmentIndex == null || !projectData) return;
  const seg = projectData.timeline[selectedSegmentIndex];
  const layers = seg.layers || [];
  if (layers.length === 0) return;

  if (layers.length === 1) {
    // Single layer — replace stack with the layer
    const layerSeg = { ...layers[0] };
    delete layerSeg.opacity;
    delete layerSeg.delay;
    projectData.timeline[selectedSegmentIndex] = layerSeg;
  } else {
    // Multiple layers — replace stack with all layers as separate segments
    const newSegs = layers.map((l: any) => {
      const s = { ...l };
      delete s.opacity;
      delete s.delay;
      return s;
    });
    projectData.timeline.splice(selectedSegmentIndex, 1, ...newSegs);
  }
  syncYamlFromData();
  renderEditorPanel(selectedSegmentIndex);
});

$("#btn-seg-delete")!.addEventListener("click", () => {
  if (selectedSegmentIndex == null || !projectData) return;
  const seg = projectData.timeline[selectedSegmentIndex];
  if (!confirm(`Delete segment ${selectedSegmentIndex + 1} (${seg.type})?`)) return;
  projectData.timeline.splice(selectedSegmentIndex, 1);
  syncYamlFromData();
  closeEditor();
});

editorTypeSelect.addEventListener("change", () => {
  if (selectedSegmentIndex == null || !projectData) return;
  const newType = editorTypeSelect.value;
  const seg = projectData.timeline[selectedSegmentIndex];
  const oldResolvedType = isKnownType(seg.type) ? seg.type : (getMergedTemplates()[seg.type] || {}).type || seg.type;

  // Build a fresh segment with defaults for the new resolved type
  const resolvedType = isKnownType(newType) ? newType : (getMergedTemplates()[newType] || {}).type || newType;
  const schema = (SpliceRack.types[resolvedType] || {}).schema;

  if (isKnownType(newType)) {
    // Switching to a built-in type: populate with defaults
    const newSeg = { type: newType };
    if (schema) {
      for (const prop of schema) {
        if (prop.default !== "" && prop.default !== undefined) {
          setNestedValue(newSeg, prop.key, prop.default);
        }
      }
    }
    projectData.timeline[selectedSegmentIndex] = newSeg;
  } else {
    // Switching to a template: just set the type, template provides defaults
    projectData.timeline[selectedSegmentIndex] = { type: newType };
  }

  syncYamlFromData();
  renderEditorPanel(selectedSegmentIndex);
});

// getLibraryFiles moved to async cache factory at top of file

async function renderEditorPanel(index: number) {
  if (!projectData || !projectData.timeline || index >= projectData.timeline.length) {
    closeEditor();
    return;
  }

  selectedSegmentIndex = index;
  segmentEditor.style.display = "";

  // Update toolbar button states
  ($("#btn-seg-up") as HTMLButtonElement).disabled = index <= 0;
  ($("#btn-seg-down") as HTMLButtonElement).disabled = index >= projectData.timeline.length - 1;
  const segTypeForToolbar = isKnownType(projectData.timeline[index].type)
    ? projectData.timeline[index].type
    : (getMergedTemplates()[projectData.timeline[index].type] || {}).type || projectData.timeline[index].type;
  $("#btn-seg-stack")!.style.display = segTypeForToolbar === "stack" ? "none" : "";
  // Show Unstack button only for stacks with layers
  const unstackBtn = $("#btn-seg-unstack")!;
  if (segTypeForToolbar === "stack") {
    const layers = projectData.timeline[index].layers || [];
    if (layers.length > 0) {
      unstackBtn.style.display = "";
      unstackBtn.textContent = layers.length === 1 ? "Unstack" : "Unstack All";
      unstackBtn.title = layers.length === 1
        ? "Replace stack with its single layer"
        : "Replace stack with all layers as separate segments";
    } else {
      unstackBtn.style.display = "none";
    }
  } else {
    unstackBtn.style.display = "none";
  }

  const rawSeg = projectData.timeline[index];
  const templates = getMergedTemplates();
  const isTemplate = !isKnownType(rawSeg.type);
  const resolvedSeg = resolveTemplate(rawSeg, templates);
  const resolvedType = resolvedSeg.type;
  const schema = (SpliceRack.types[resolvedType] || {}).schema;

  if (!schema) {
    editorFields.innerHTML = '<div style="padding:12px;color:#808090;font-size:12px">Unknown segment type</div>';
    return;
  }

  // Populate type dropdown
  editorTypeSelect.innerHTML = "";
  editorTypeSelect.appendChild(createOptgroup("Built-in",
    Object.keys(SpliceRack.types).map(t => ({ value: t, text: t, selected: rawSeg.type === t }))
  ));

  const templateNames = Object.keys(templates);
  if (templateNames.length > 0) {
    editorTypeSelect.appendChild(createOptgroup("Templates",
      templateNames.map(name => ({ value: name, text: `${name} (${templates[name].type || "?"})`, selected: rawSeg.type === name }))
    ));
  }

  // Template info banner
  if (isTemplate && templates[rawSeg.type]) {
    editorTemplateInfo.style.display = "";
    editorTemplateInfo.textContent = `Template: ${rawSeg.type} (${templates[rawSeg.type].type || "?"})`;
  } else {
    editorTemplateInfo.style.display = "none";
  }

  // Pre-fetch data needed for dropdowns
  const libFiles = await getLibraryFiles();
  let sourceClips = [];
  const sourceValue = getNestedValue(resolvedSeg, "source");
  if (sourceValue) {
    sourceClips = await getClipsForSource(sourceValue);
  }

  // Render property fields
  editorFields.innerHTML = "";
  let lastGroup = null;

  for (const prop of schema) {
    // Check condition
    if (prop.condition && !prop.condition(resolvedSeg)) continue;

    // Group header
    if (prop.group && prop.group !== lastGroup) {
      lastGroup = prop.group;
      const header = document.createElement("div");
      header.className = "prop-group-header";
      header.textContent = prop.group;
      editorFields.appendChild(header);
    } else if (!prop.group && lastGroup) {
      lastGroup = null;
    }

    const row = document.createElement("div");
    row.className = "prop-row";

    const currentValue = getNestedValue(resolvedSeg, prop.key);
    const rawValue = getNestedValue(rawSeg, prop.key);
    const templateValue = isTemplate ? getNestedValue(templates[rawSeg.type] || {}, prop.key) : undefined;

    // Determine inheritance state
    let isInherited = false;
    let inheritLabel = "";
    if (isTemplate && rawValue === undefined && templateValue !== undefined) {
      isInherited = true;
      inheritLabel = "template";
    } else if (!isTemplate && (rawValue === undefined || rawValue === prop.default) && currentValue === prop.default) {
      isInherited = true;
      inheritLabel = "default";
    }

    if (isInherited) row.classList.add("prop-inherited");

    // Label
    const label = document.createElement("label");
    label.textContent = prop.label;
    row.appendChild(label);

    // Input control
    const displayValue = currentValue != null ? currentValue : prop.default;

    if (prop.type !== "layers" && prop.type !== "clip-dropdown" && prop.type !== "file") {
      // Generic property types — use shared renderer
      const el = renderPropertyField(prop, displayValue, (val: any) => {
        updateSegmentProperty(index, prop.key, val);
      });
      row.appendChild(el);
    } else if (prop.type === "clip-dropdown") {
      // Special: clip-dropdown needs sourceClips and has custom change logic
      const clipProp = { ...prop, _sourceClips: sourceClips };
      const el = renderPropertyField(clipProp, displayValue, (val: any) => {
        if (val) {
          updateSegmentProperty(index, "clip", val);
          deleteNestedValue(projectData.timeline[index], "start");
          deleteNestedValue(projectData.timeline[index], "end");
        } else {
          deleteNestedValue(projectData.timeline[index], "clip");
          setNestedValue(projectData.timeline[index], "start", 0);
          setNestedValue(projectData.timeline[index], "end", 10);
        }
        syncYamlFromData();
        renderEditorPanel(index);
      });
      row.appendChild(el);
    } else if (prop.type === "file") {
      // Special: file changes should re-render editor (for clip dropdown update)
      const el = renderPropertyField(prop, displayValue, (val: any) => {
        updateSegmentProperty(index, prop.key, val);
        renderEditorPanel(index);
      });
      row.appendChild(el);
    } else if (prop.type === "layers") {
      // Layers editor — uses shared card list builder
      const layersValue = getNestedValue(resolvedSeg, prop.key) || [];
      const onChanged = () => { syncYamlFromData(); renderEditorPanel(index); };

      editorFields.appendChild(buildCardList({
        items: layersValue,
        addButtonText: "+ Add Layer",
        onChanged,
        renderItemHeader: (layer: any, li: number, header: HTMLElement) => {
          const typeSelect = document.createElement("select");
          typeSelect.appendChild(createOptgroup("Built-in",
            Object.keys(SpliceRack.types).filter(t => t !== "stack")
              .map(t => ({ value: t, text: t, selected: layer.type === t }))
          ));
          const layerTemplates = Object.entries(getMergedTemplates())
            .filter(([, v]) => (v as any).type && SpliceRack.types[(v as any).type] && (v as any).type !== "stack");
          if (layerTemplates.length > 0) {
            typeSelect.appendChild(createOptgroup("Templates",
              (layerTemplates as [string, any][]).map(([name, tmpl]) => ({ value: name, text: `${name} (${tmpl.type})`, selected: layer.type === name }))
            ));
          }
          typeSelect.addEventListener("change", () => {
            const val = typeSelect.value;
            const typeDef = SpliceRack.types[val];
            let newLayer: any;
            if (typeDef) {
              newLayer = typeDef.defaults();
            } else {
              newLayer = { type: val };
            }
            newLayer.opacity = layer.opacity != null ? layer.opacity : 1;
            newLayer.delay = layer.delay || 0;
            layersValue[li] = newLayer;
            onChanged();
          });
          header.appendChild(typeSelect);
        },
        renderItemBody: (layer: any, li: number, card: HTMLElement) => {
          // Stack-specific per-layer props: opacity and delay
          const stackProps = document.createElement("div");
          stackProps.className = "layer-stack-props";

          const opLabel = document.createElement("label");
          opLabel.textContent = "Opacity";
          const opInput = document.createElement("input");
          opInput.type = "number";
          opInput.min = "0";
          opInput.max = "1";
          opInput.step = "0.1";
          opInput.value = layer.opacity != null ? layer.opacity : 1;
          opInput.addEventListener("change", () => {
            layer.opacity = parseFloat(opInput.value);
            syncYamlFromData();
          });
          stackProps.appendChild(opLabel);
          stackProps.appendChild(opInput);

          const delayLabel = document.createElement("label");
          delayLabel.textContent = "Delay";
          const delayInput = document.createElement("input");
          delayInput.type = "number";
          delayInput.step = "0.1";
          delayInput.value = layer.delay || 0;
          delayInput.addEventListener("change", () => {
            layer.delay = parseFloat(delayInput.value);
            syncYamlFromData();
          });
          stackProps.appendChild(delayLabel);
          stackProps.appendChild(delayInput);
          card.appendChild(stackProps);

          // Sub-properties from the layer's type schema (resolve templates)
          const layerIsTemplate = !SpliceRack.types[layer.type] && getMergedTemplates()[layer.type];
          const resolvedLayer = layerIsTemplate
            ? resolveTemplate(layer, getMergedTemplates())
            : layer;
          const resolvedLayerType = resolvedLayer.type;
          const layerTypeDef = SpliceRack.types[resolvedLayerType];
          if (layerTypeDef && layerTypeDef.schema) {
            const subProps = document.createElement("div");
            subProps.className = "layer-subprops";

            for (const sp of layerTypeDef.schema) {
              if (sp.condition && !sp.condition(resolvedLayer)) continue;
              const subRow = document.createElement("div");
              subRow.className = "prop-row";

              const subLabel = document.createElement("label");
              subLabel.textContent = sp.label;
              subRow.appendChild(subLabel);

              const val = getNestedValue(resolvedLayer, sp.key);
              const displayVal = val != null ? val : sp.default;

              if (sp.type === "clip-dropdown") {
                const clipProp = { ...sp, _sourceClips: clipCache[getNestedValue(layer, "source") as string] || [] };
                const el = renderPropertyField(clipProp, displayVal, (val: any) => {
                  if (val) { layer.clip = val; delete layer.start; delete layer.end; }
                  else { delete layer.clip; layer.start = 0; layer.end = 10; }
                  onChanged();
                });
                subRow.appendChild(el);
              } else {
                const el = renderPropertyField(sp, displayVal, (val: any) => {
                  setNestedValue(layer, sp.key, val);
                  syncYamlFromData();
                  if (sp.type === "file" || sp.type === "dropdown") renderEditorPanel(index);
                });
                subRow.appendChild(el);
              }

              subProps.appendChild(subRow);
            }
            card.appendChild(subProps);
          }
        },
        extraItemActions: (layer: any, li: number) => {
          const unstackBtn = document.createElement("button");
          unstackBtn.textContent = "Unstack";
          unstackBtn.title = "Replace the stack with this layer";
          unstackBtn.addEventListener("click", () => {
            const layerSeg = { ...layersValue[li] };
            delete layerSeg.opacity;
            delete layerSeg.delay;
            projectData.timeline[index] = layerSeg;
            onChanged();
          });
          return [unstackBtn];
        },
        onAdd: () => {
          const defaultType = "caption";
          const newLayer = SpliceRack.types[defaultType].defaults();
          newLayer.opacity = 1;
          newLayer.delay = 0;
          layersValue.push(newLayer);
          setNestedValue(projectData.timeline[index], prop.key, layersValue);
          onChanged();
        },
      }));
      // Layers take the full width — skip the normal row layout
      continue;
    }

    // Inherit label or revert button
    if (isInherited) {
      const lbl = document.createElement("span");
      lbl.className = "prop-inherit-label";
      lbl.textContent = inheritLabel;
      row.appendChild(lbl);
    } else if (isTemplate || (rawValue !== undefined && rawValue !== prop.default)) {
      const revertBtn = document.createElement("button");
      revertBtn.className = "prop-revert";
      revertBtn.textContent = "\u21A9";
      revertBtn.title = isTemplate ? "Revert to template value" : "Revert to default";
      revertBtn.addEventListener("click", () => {
        if (isTemplate) {
          deleteNestedValue(projectData.timeline[index], prop.key);
        } else {
          setNestedValue(projectData.timeline[index], prop.key, prop.default);
        }
        syncYamlFromData();
        renderEditorPanel(index);
      });
      row.appendChild(revertBtn);
    }

    editorFields.appendChild(row);
  }

  // --- Audio Layers Section (universal, all segment types) ---
  if (resolvedType !== "stack") { // stack has its own layer system
    editorFields.appendChild(buildAudioLayersEditor(index, rawSeg));
  }

  // --- Keyframes Section (universal, all segment types) ---
  editorFields.appendChild(buildKeyframesEditor(index, rawSeg));
}

function buildKeyframesEditor(segIndex: number, rawSeg: any) {
  const keyframes = rawSeg.keyframes || [];
  const onChanged = () => { syncYamlFromData(); renderEditorPanel(segIndex); };

  // Shared between renderItemHeader and renderItemBody so body can update header labels
  const timeLabels: HTMLElement[] = [];

  return buildCardList({
    headerText: "Keyframes",
    items: keyframes,
    addButtonText: "+ Add Keyframe",
    onChanged,
    onDelete: (items, ki) => {
      items.splice(ki, 1);
      if (items.length === 0) delete rawSeg.keyframes;
    },
    renderItemHeader: (kf: any, ki: number, header: HTMLElement) => {
      const timeLabel = document.createElement("span");
      timeLabel.style.cssText = "font-size:11px;color:#a0a0b0";
      timeLabel.textContent = `t=${kf.time || 0}s  scale=${kf.scale || 1}x`;
      timeLabels[ki] = timeLabel;
      header.appendChild(timeLabel);
    },
    renderItemBody: (kf: any, ki: number, card: HTMLElement) => {
      const fields = [
        { key: "time", label: "Time (s)", step: 0.1, min: 0 },
        { key: "scale", label: "Scale", step: 0.1, min: 0.1, max: 20 },
        { key: "x", label: "X (0-1)", step: 0.01, min: 0, max: 1 },
        { key: "y", label: "Y (0-1)", step: 0.01, min: 0, max: 1 },
      ];

      const subProps = document.createElement("div");
      subProps.className = "layer-subprops";

      for (const f of fields) {
        const row = document.createElement("div");
        row.className = "prop-row";
        const label = document.createElement("label");
        label.textContent = f.label;
        row.appendChild(label);

        const input = document.createElement("input");
        input.type = "number";
        input.value = kf[f.key] != null ? kf[f.key] : (f.key === "scale" ? 1 : f.key === "x" || f.key === "y" ? 0.5 : 0);
        if (f.step != null) input.step = String(f.step);
        if (f.min != null) input.min = String(f.min);
        if (f.max != null) input.max = String(f.max);
        input.addEventListener("change", () => {
          kf[f.key] = parseFloat(input.value);
          const tl = timeLabels[ki];
          if (tl) tl.textContent = `t=${kf.time || 0}s  scale=${kf.scale || 1}x`;
          syncYamlFromData();
        });
        row.appendChild(input);
        subProps.appendChild(row);
      }

      // Ease dropdown
      const easeRow = document.createElement("div");
      easeRow.className = "prop-row";
      const easeLabel = document.createElement("label");
      easeLabel.textContent = "Ease";
      easeRow.appendChild(easeLabel);
      const easeSel = document.createElement("select");
      for (const e of ["linear", "ease-in-out"]) {
        easeSel.appendChild(createOption(e, e, (kf.ease || "linear") === e));
      }
      easeSel.addEventListener("change", () => {
        kf.ease = easeSel.value;
        syncYamlFromData();
      });
      easeRow.appendChild(easeSel);
      subProps.appendChild(easeRow);

      card.appendChild(subProps);
    },
    onAdd: () => {
      if (!rawSeg.keyframes) rawSeg.keyframes = [];
      const lastTime = rawSeg.keyframes.length > 0 ? rawSeg.keyframes[rawSeg.keyframes.length - 1].time || 0 : 0;
      rawSeg.keyframes.push({ time: lastTime + 2, scale: 1, x: 0.5, y: 0.5 });
      onChanged();
    },
  });
}

// Audio layer type schemas
const AUDIO_LAYER_SCHEMAS: Record<string, any[]> = {
  source: [
    { key: "volume", label: "Volume", type: "number", default: 1, min: 0, max: 2, step: 0.1 },
    { key: "mute", label: "Mute", type: "dropdown", default: "false", options: ["false", "true"] },
  ],
  tts: [
    { key: "text", label: "Text", type: "string", default: "" },
    { key: "voice", label: "Voice", type: "voice-dropdown", default: "" },
    { key: "volume", label: "Volume", type: "number", default: 1, min: 0, max: 2, step: 0.1 },
    { key: "delay", label: "Delay (s)", type: "number", default: 0, step: 0.1 },
  ],
  file: [
    { key: "source", label: "File", type: "audio-file", default: "" },
    { key: "volume", label: "Volume", type: "number", default: 1, min: 0, max: 2, step: 0.1 },
    { key: "delay", label: "Delay (s)", type: "number", default: 0, step: 0.1 },
    { key: "start", label: "Start (s)", type: "number", default: 0, min: 0, step: 0.1 },
    { key: "loop", label: "Loop", type: "dropdown", default: "false", options: ["false", "true"] },
  ],
};

// Voice list cache
// voicesCache and audioFilesCache moved to async cache factory at top of file

function buildAudioLayersEditor(segIndex: number, rawSeg: any) {
  const audioLayers = rawSeg.audio || [];
  const onChanged = () => { syncYamlFromData(); renderEditorPanel(segIndex); };
  const AUDIO_BUILTIN = new Set(["source", "tts", "file"]);
  const allTemplates = projectData.templates || {};

  return buildCardList({
    headerText: "Audio",
    items: audioLayers,
    addButtonText: "+ Add Audio Layer",
    canReorder: false,
    onChanged,
    onDelete: (items, ai) => {
      items.splice(ai, 1);
      if (items.length === 0) delete rawSeg.audio;
    },
    renderItemHeader: (layer: any, ai: number, header: HTMLElement) => {
      const typeSelect = document.createElement("select");
      const audioTypes = ["source", "tts", "file"];

      const segType = rawSeg.type;
      const resolvedSegType = isKnownType(segType) ? segType :
        (getMergedTemplates()[segType] || {}).type || segType;

      for (const t of audioTypes) {
        if (t === "source" && resolvedSegType !== "clip") continue;
        typeSelect.appendChild(createOption(t, t, (layer.type || "") === t));
      }

      const audioTemplateNames = Object.keys(allTemplates).filter(
        (name) => AUDIO_BUILTIN.has(allTemplates[name].type)
      );
      if (audioTemplateNames.length > 0) {
        typeSelect.appendChild(createOptgroup("Templates",
          audioTemplateNames.map(name => ({ value: name, text: `${name} (${allTemplates[name].type})`, selected: layer.type === name }))
        ));
      }

      typeSelect.addEventListener("change", () => {
        const val = typeSelect.value;
        if (!AUDIO_BUILTIN.has(val) && allTemplates[val]) {
          audioLayers[ai] = { type: val };
        } else {
          const newLayer: any = { type: val };
          if (val === "source") { newLayer.volume = 1; }
          else if (val === "tts") { newLayer.text = ""; newLayer.voice = ""; newLayer.volume = 1; }
          else if (val === "file") { newLayer.source = ""; newLayer.volume = 1; }
          audioLayers[ai] = newLayer;
        }
        if (!rawSeg.audio) rawSeg.audio = audioLayers;
        onChanged();
      });
      header.appendChild(typeSelect);
    },
    renderItemBody: (layer: any, ai: number, card: HTMLElement) => {
      const isAudioTemplate = layer.type && !AUDIO_BUILTIN.has(layer.type) && allTemplates[layer.type];
      const resolvedLayer = isAudioTemplate
        ? { ...allTemplates[layer.type], ...layer, type: allTemplates[layer.type].type }
        : layer;
      const layerType = resolvedLayer.type;
      const schema = AUDIO_LAYER_SCHEMAS[layerType];

      if (isAudioTemplate) {
        const tmplInfo = document.createElement("div");
        tmplInfo.className = "editor-template-info";
        tmplInfo.style.margin = "2px 0";
        tmplInfo.style.borderRadius = "3px";
        tmplInfo.textContent = `Template: ${layer.type}`;
        card.appendChild(tmplInfo);
      }

      if (schema) {
        const subProps = document.createElement("div");
        subProps.className = "layer-subprops";

        for (const sp of schema) {
          const subRow = document.createElement("div");
          subRow.className = "prop-row";

          const subLabel = document.createElement("label");
          subLabel.textContent = sp.label;
          subRow.appendChild(subLabel);

          const val = resolvedLayer[sp.key];
          const displayVal = val != null ? val : sp.default;
          const isInherited = isAudioTemplate && layer[sp.key] === undefined;
          if (isInherited) subRow.classList.add("prop-inherited");

          const el = renderPropertyField(sp, displayVal, (val: any) => {
            layer[sp.key] = val;
            syncYamlFromData();
          });
          subRow.appendChild(el);

          if (isAudioTemplate && layer[sp.key] !== undefined) {
            const revertBtn = document.createElement("button");
            revertBtn.className = "prop-revert";
            revertBtn.textContent = "\u21A9";
            revertBtn.title = "Revert to template value";
            revertBtn.addEventListener("click", () => {
              delete layer[sp.key];
              onChanged();
            });
            subRow.appendChild(revertBtn);
          } else if (isInherited) {
            const lbl = document.createElement("span");
            lbl.className = "prop-inherit-label";
            lbl.textContent = "template";
            subRow.appendChild(lbl);
          }

          subProps.appendChild(subRow);
        }
        card.appendChild(subProps);
      }
    },
    onAdd: () => {
      if (!rawSeg.audio) rawSeg.audio = [];
      rawSeg.audio.push({ type: "tts", text: "", voice: "", volume: 1 });
      onChanged();
    },
  });
}

function updateSegmentProperty(index: number, key: string, value: any) {
  if (!projectData || !projectData.timeline[index]) return;
  setNestedValue(projectData.timeline[index], key, value);
  syncYamlFromData();
}

// --- Sequence rendering ---
let renderSequenceGen = 0;
async function renderSequence() {
  const gen = ++renderSequenceGen;
  sequenceTrack.innerHTML = "";

  if (!projectData || !projectData.timeline || projectData.timeline.length === 0) {
    sequenceTrack.innerHTML = '<div class="sequence-empty">No segments in sequence</div>';
    return;
  }

  const templates = getMergedTemplates();

  // Resolve templates for display
  const resolved = projectData.timeline.map((seg: any) => resolveTemplate(seg, templates));

  // Pre-fetch clip metadata for all sources referenced in sequence
  const sources = [...new Set<string>(
    resolved
      .filter((s: any) => s.type === "clip" && s.source)
      .map((s: any) => s.source as string)
  )];
  await Promise.all(sources.map((s: string) => getClipsForSource(s)));

  // If another renderSequence call started while we were awaiting, bail out
  if (gen !== renderSequenceGen) return;

  let dragSrcIndex: number | null = null;

  resolved.forEach((seg: any, index: number) => {
    const rawSeg = projectData.timeline[index]; // original (may have template name)
    const templateName = isKnownType(rawSeg.type) ? null : rawSeg.type;

    const div = document.createElement("div");
    div.className = "sequence-segment";
    div.draggable = true;
    div.dataset.index = String(index);

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

    const typeDef = SpliceRack.types[seg.type];
    if (typeDef && typeDef.sequenceDisplay) {
      const display = typeDef.sequenceDisplay(seg, clipTimes ?? undefined);
      title.textContent = display.title;
      detail.textContent = display.detail;
    } else {
      title.textContent = seg.type;
    }

    info.appendChild(title);
    info.appendChild(detail);

    div.appendChild(badge);
    if (thumbnail) div.appendChild(thumbnail);
    div.appendChild(info);

    // Click to select and open editor
    div.addEventListener("click", () => {
      $$(".sequence-segment.selected").forEach((s: Element) => s.classList.remove("selected"));
      div.classList.add("selected");
      // Sync timeline selection
      $$(".tl-seg.selected").forEach((s: Element) => s.classList.remove("selected"));
      timelineCanvas.querySelectorAll(`.tl-seg[data-seg-index="${index}"]`).forEach((s: Element) => {
        s.classList.add("selected");
        s.scrollIntoView({ inline: "nearest", block: "nearest" });
      });
      selectYamlSegment(index);
      renderEditorPanel(index);
    });

    // Drag and drop reordering
    div.addEventListener("dragstart", (e) => {
      dragSrcIndex = index;
      div.classList.add("dragging");
      e.dataTransfer!.effectAllowed = "move";
    });

    div.addEventListener("dragend", () => {
      div.classList.remove("dragging");
      $$(".sequence-segment").forEach((s: Element) => s.classList.remove("drag-over"));
    });

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
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

    sequenceTrack.appendChild(div);
  });

  renderTimelinePane();
}

// =====================================================
// TIMELINE PANE (horizontal time-based view)
// =====================================================

let pixelsPerSecond = 20;
const TRACK_HEIGHT = 30;
const TRACK_PAD = 2;

const timelineCanvas = $("#timeline-canvas")!;
const timelineViewport = $("#timeline-viewport")!;
const timelineZoom = $("#timeline-zoom") as HTMLInputElement;
const timelineZoomValue = $("#timeline-zoom-value")!;
const timelinePane = $("#timeline-pane")!;

// Get the duration of a resolved segment for timeline layout
function getSegmentDuration(seg: any): number {
  if (seg.type === "clip") {
    const source = seg.source;
    const clips = clipCache[source] || [];
    if (seg.clip) {
      const found = clips.find((c: any) => c.name === seg.clip);
      if (found) return ((found.end - found.start) / (seg.speed || 1));
    }
    if (seg.start != null && seg.end != null) return ((seg.end - seg.start) / (seg.speed || 1));
    return seg.duration || 5;
  }
  if (seg.type === "stack") {
    if (seg.duration && seg.duration > 0) return seg.duration;
    const layers = seg.layers || [];
    if (layers.length === 0) return 3;
    let maxEnd = 0;
    const templates = getMergedTemplates();
    for (const layer of layers) {
      const resolved = resolveTemplate(layer, templates);
      const dur = getSegmentDuration(resolved);
      maxEnd = Math.max(maxEnd, dur + (layer.delay || 0));
    }
    return maxEnd || 3;
  }
  if (seg.duration != null && seg.duration > 0) return seg.duration;
  const typeDef = SpliceRack.types[seg.type];
  if (typeDef) {
    const durSchema = typeDef.schema.find((s: any) => s.key === "duration");
    if (durSchema && durSchema.default) return durSchema.default as number;
  }
  return 3;
}

function renderTimelinePane() {
  timelineCanvas.innerHTML = "";

  if (!projectData || !projectData.timeline || projectData.timeline.length === 0) {
    timelineCanvas.style.width = "0px";
    timelineCanvas.style.height = "0px";
    return;
  }

  const templates = getMergedTemplates();
  const resolved = projectData.timeline.map((seg: any) => resolveTemplate(seg, templates));

  // Build boxes with compositing layer, then resolve tracks from overlaps
  const boxes: Array<{
    segIndex: number; x: number; width: number; track: number;
    compositeLayer: number; // intended layer for compositing
    bg: string; fg: string; title: string; duration: number;
    isStackBg?: boolean;
  }> = [];
  let cumTime = 0;

  for (let i = 0; i < resolved.length; i++) {
    const seg = resolved[i];
    const segDur = getSegmentDuration(seg);
    const xPx = cumTime * pixelsPerSecond;
    const wPx = segDur * pixelsPerSecond;

    if (seg.type === "stack") {
      const layers = seg.layers || [];
      if (layers.length === 0) {
        const td = SpliceRack.types["stack"];
        boxes.push({
          segIndex: i, x: xPx, width: wPx, track: 0, compositeLayer: 0,
          bg: td?.badgeColor?.bg || "#4a3a6a", fg: td?.badgeColor?.fg || "#c8a0f0",
          title: "Stack (empty)", duration: segDur,
        });
      } else {
        // Add a faint background bar spanning all tracks for the stack's full duration
        for (let t = 0; t < layers.length; t++) {
          boxes.push({
            segIndex: i, x: xPx, width: wPx, track: t, compositeLayer: t,
            bg: "rgba(74, 58, 106, 0.2)", fg: "transparent",
            title: "", duration: segDur, isStackBg: true,
          });
        }
        // Add layer boxes, clamped to the stack's total duration
        for (let li = 0; li < layers.length; li++) {
          const layer = resolveTemplate(layers[li], templates);
          const layerDelay = layers[li].delay || 0;
          const layerDur = getSegmentDuration(layer);
          const crop = seg.crop !== false; // default true
          const effectiveDur = crop ? Math.min(layerDur, segDur - layerDelay) : layerDur;
          if (crop && effectiveDur <= 0) continue;
          const layerX = xPx + layerDelay * pixelsPerSecond; // can be negative (bleeds left)
          const layerW = effectiveDur * pixelsPerSecond;
          const td = SpliceRack.types[layer.type];
          const display = td?.sequenceDisplay?.(layer);
          boxes.push({
            segIndex: i, x: layerX, width: layerW, track: li, compositeLayer: li,
            bg: td?.badgeColor?.bg || "#333", fg: td?.badgeColor?.fg || "#ccc",
            title: display?.title || layer.type, duration: effectiveDur,
          });
        }
      }
    } else {
      const td = SpliceRack.types[seg.type];
      const clipTimes = seg.type === "clip" ? (() => {
        const clips = clipCache[seg.source] || [];
        if (seg.clip) { const f = clips.find((c: any) => c.name === seg.clip); if (f) return f; }
        if (seg.start != null && seg.end != null) return { start: seg.start, end: seg.end };
        return null;
      })() : null;
      const display = td?.sequenceDisplay?.(seg, clipTimes ?? undefined);
      boxes.push({
        segIndex: i, x: xPx, width: wPx, track: 0, compositeLayer: 0,
        bg: td?.badgeColor?.bg || "#333", fg: td?.badgeColor?.fg || "#ccc",
        title: display?.title || seg.type, duration: segDur,
      });
    }

    cumTime += segDur;
  }

  // Resolve track assignments: same composite layer + time overlap = bump to higher track.
  // Non-background boxes sorted by composite layer then x position.
  // Later segments (higher segIndex) get priority (higher track) on overlap.
  const contentBoxes = boxes.filter(b => !b.isStackBg);
  contentBoxes.sort((a, b) => a.compositeLayer - b.compositeLayer || a.x - b.x);

  // For each composite layer, pack into visual tracks avoiding overlaps
  const trackOccupancy: Array<Array<{ start: number; end: number }>> = [];

  // Track which track each segment+layer was assigned to, so higher layers
  // in the same segment stay above lower layers.
  const segLayerTracks: Record<string, number> = {};

  for (const box of contentBoxes) {
    const boxEnd = box.x + box.width;
    // Minimum track: must be above any lower composite layer in the same segment
    let minTrack = 0;
    for (let cl = 0; cl < box.compositeLayer; cl++) {
      const key = `${box.segIndex}:${cl}`;
      if (segLayerTracks[key] != null) {
        minTrack = Math.max(minTrack, segLayerTracks[key] + 1);
      }
    }
    // Find the lowest track >= minTrack where this box doesn't overlap
    let track = minTrack;
    while (true) {
      if (!trackOccupancy[track]) trackOccupancy[track] = [];
      // Check for actual time-range intersection (not just "starts before something ends")
      const hasOverlap = trackOccupancy[track].some(occ => box.x < occ.end - 1 && boxEnd > occ.start + 1);
      if (!hasOverlap) break;
      track++;
    }
    trackOccupancy[track] = trackOccupancy[track] || [];
    trackOccupancy[track].push({ start: box.x, end: boxEnd });
    box.track = track;
    segLayerTracks[`${box.segIndex}:${box.compositeLayer}`] = track;
  }

  // Update background boxes to match their content's track range
  for (const bg of boxes.filter(b => b.isStackBg)) {
    // Find the max track used by content in the same segment at the same compositeLayer
    const maxContentTrack = contentBoxes
      .filter(b => b.segIndex === bg.segIndex && b.compositeLayer === bg.compositeLayer)
      .reduce((max, b) => Math.max(max, b.track), bg.compositeLayer);
    bg.track = maxContentTrack;
  }

  // Compute maxTrack from resolved tracks
  let maxTrack = 0;
  for (const box of boxes) {
    maxTrack = Math.max(maxTrack, box.track);
  }

  // Set canvas dimensions
  const totalWidth = Math.max(cumTime * pixelsPerSecond, 100);
  const numTracks = maxTrack + 1;
  const canvasHeight = numTracks * TRACK_HEIGHT;
  timelineCanvas.style.width = totalWidth + "px";
  timelineCanvas.style.height = canvasHeight + "px";

  // Draw time ruler ticks
  const tickInterval = pixelsPerSecond >= 30 ? 1 : pixelsPerSecond >= 10 ? 5 : 10;
  for (let t = 0; t <= cumTime; t += tickInterval) {
    const xPx = t * pixelsPerSecond;
    const tick = document.createElement("div");
    tick.className = "tl-tick";
    tick.style.left = xPx + "px";
    timelineCanvas.appendChild(tick);

    const label = document.createElement("div");
    label.className = "tl-tick-label";
    label.style.left = (xPx + 2) + "px";
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    label.textContent = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;
    timelineCanvas.appendChild(label);
  }

  // Render segment boxes
  for (const box of boxes) {
    const el = document.createElement("div");

    // Track 0 = bottom row
    const topPx = (maxTrack - box.track) * TRACK_HEIGHT + TRACK_PAD;
    el.style.left = box.x + "px";
    el.style.top = topPx + "px";
    el.style.width = Math.max(box.width, 3) + "px";
    el.style.height = (TRACK_HEIGHT - TRACK_PAD * 2) + "px";
    el.style.background = box.bg;
    el.dataset.segIndex = String(box.segIndex);

    if (box.isStackBg) {
      // Background extent bar — non-interactive, no border
      el.className = "tl-stack-bg";
      el.style.position = "absolute";
      el.style.borderRadius = "3px";
      el.style.pointerEvents = "none";
      el.style.boxSizing = "border-box";
      timelineCanvas.appendChild(el);
      continue;
    }

    el.className = "tl-seg";
    el.style.color = box.fg;
    if (box.segIndex === selectedSegmentIndex) el.classList.add("selected");

    const titleSpan = document.createElement("span");
    titleSpan.className = "tl-title";
    titleSpan.textContent = box.title;
    el.appendChild(titleSpan);

    if (box.width > 50) {
      const durSpan = document.createElement("span");
      durSpan.className = "tl-dur";
      durSpan.textContent = box.duration.toFixed(1) + "s";
      el.appendChild(durSpan);
    }

    el.addEventListener("click", () => {
      // Sync selection to sequence list
      $$(".sequence-segment.selected").forEach((s: Element) => s.classList.remove("selected"));
      const seqSegs = $$(".sequence-segment");
      if (seqSegs[box.segIndex]) {
        seqSegs[box.segIndex].classList.add("selected");
        seqSegs[box.segIndex].scrollIntoView({ block: "nearest" });
      }
      // Sync timeline selection
      $$(".tl-seg.selected").forEach((s: Element) => s.classList.remove("selected"));
      timelineCanvas.querySelectorAll(`.tl-seg[data-seg-index="${box.segIndex}"]`).forEach(
        (s: Element) => s.classList.add("selected")
      );
      selectYamlSegment(box.segIndex);
      renderEditorPanel(box.segIndex);
    });

    timelineCanvas.appendChild(el);
  }
}

// Zoom control
timelineZoom.addEventListener("input", () => {
  pixelsPerSecond = parseInt(timelineZoom.value);
  timelineZoomValue.textContent = pixelsPerSecond + " px/s";
  renderTimelinePane();
});

timelineViewport.addEventListener("wheel", (e: WheelEvent) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    pixelsPerSecond = Math.max(3, Math.min(150, pixelsPerSecond + (e.deltaY < 0 ? 2 : -2)));
    timelineZoom.value = String(pixelsPerSecond);
    timelineZoomValue.textContent = pixelsPerSecond + " px/s";
    renderTimelinePane();
  }
}, { passive: false });

// Resize handle
{
  const resizeHandle = $(".timeline-resize-handle")!;
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  resizeHandle.addEventListener("mousedown", (e: Event) => {
    isResizing = true;
    startY = (e as MouseEvent).clientY;
    startHeight = timelinePane.offsetHeight;
    document.body.style.cursor = "ns-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isResizing) return;
    const delta = startY - e.clientY;
    (timelinePane as HTMLElement).style.height = Math.max(60, startHeight + delta) + "px";
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
    }
  });
}

function selectYamlSegment(index: number) {
  const text = yamlEditor.value;
  // Find top-level sequence segment starts: exactly "  - type:" (2-space indent)
  // Not deeper-nested ones inside layers/audio arrays
  const pattern = /^  - type:/gm;
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

function moveSegment(from: number, to: number) {
  if (to < 0 || to >= projectData.timeline.length) return;
  const [item] = projectData.timeline.splice(from, 1);
  projectData.timeline.splice(to, 0, item);
  syncYamlFromData();
}

// Serialize a value for YAML output
function yamlValue(v: any, indent: string): string {
  if (v == null) return "null";
  if (typeof v === "string") return `"${v.replace(/"/g, '\\"')}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    const lines = [];
    for (const item of v) {
      if (typeof item === "object" && item !== null) {
        const entries = serializeObject(item, indent + "    ");
        lines.push(`${indent}  - ${entries[0].trimStart()}`);
        for (let i = 1; i < entries.length; i++) lines.push(entries[i]);
      } else {
        lines.push(`${indent}  - ${yamlValue(item, indent + "  ")}`);
      }
    }
    return "\n" + lines.join("\n");
  }
  if (typeof v === "object") {
    const entries = serializeObject(v, indent + "  ");
    return "\n" + entries.join("\n");
  }
  return String(v);
}

function serializeObject(obj: any, indent: string): string[] {
  const lines = [];
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    const rendered = yamlValue(val, indent);
    if (rendered.startsWith("\n")) {
      lines.push(`${indent}${k}:${rendered}`);
    } else {
      lines.push(`${indent}${k}: ${rendered}`);
    }
  }
  return lines;
}

// Update YAML text from the in-memory data and save
function syncYamlFromData() {
  pushUndo();
  const lines = [];

  // Output section
  const output = projectData.output || {};
  lines.push("output:");
  lines.push(`  width: ${output.width || 1920}`);
  lines.push(`  height: ${output.height || 1080}`);
  lines.push(`  fps: ${output.fps || 30}`);
  lines.push(`  background: "${output.background || "#1a1a2e"}"`);
  lines.push("");

  // Templates section (preserve existing templates)
  const templates = projectData.templates;
  if (templates && Object.keys(templates).length > 0) {
    lines.push("templates:");
    for (const [name, tmpl] of Object.entries(templates)) {
      lines.push(`  ${name}:`);
      for (const line of serializeObject(tmpl, "    ")) {
        lines.push(line);
      }
      lines.push("");
    }
  }

  lines.push("timeline:");

  for (const seg of projectData.timeline) {
    lines.push(`  - type: ${seg.type}`);

    // Generic serialization for all segments (audio and keyframes handled below)
    for (const [k, v] of Object.entries(seg)) {
      if (k === "type" || k === "audio" || k === "keyframes") continue;
      if (v === undefined) continue;
      const rendered = yamlValue(v, "    ");
      if (rendered.startsWith("\n")) {
        lines.push(`    ${k}:${rendered}`);
      } else {
        lines.push(`    ${k}: ${rendered}`);
      }
    }

    // Serialize audio layers (universal, all segment types)
    if (seg.audio && seg.audio.length > 0) {
      lines.push("    audio:");
      for (const a of seg.audio) {
        lines.push(`      - type: ${a.type}`);
        for (const [k, v] of Object.entries(a)) {
          if (k === "type") continue;
          if (v === undefined) continue;
          if (typeof v === "string") {
            lines.push(`        ${k}: "${v.replace(/"/g, '\\"')}"`);
          } else {
            lines.push(`        ${k}: ${v}`);
          }
        }
      }
    }

    // Serialize keyframes (universal, all segment types)
    if (seg.keyframes && seg.keyframes.length > 0) {
      lines.push("    keyframes:");
      for (const kf of seg.keyframes) {
        lines.push(`      - time: ${kf.time}`);
        if (kf.scale != null) lines.push(`        scale: ${kf.scale}`);
        if (kf.x != null) lines.push(`        x: ${kf.x}`);
        if (kf.y != null) lines.push(`        y: ${kf.y}`);
        if (kf.ease && kf.ease !== "linear") lines.push(`        ease: ${kf.ease}`);
      }
    }

    lines.push("");
  }

  yamlEditor.value = lines.join("\n");
  // Save without re-parsing — our in-memory projectData is the source of truth.
  // Re-render the sequence directly from the in-memory data.
  saveYamlQuiet();
  renderSequence();
}

// --- Add segment ---
// Populate the add-segment type dropdown from the registry
const addSegmentType = $("#add-segment-type") as HTMLSelectElement;

function refreshAddSegmentDropdown() {
  addSegmentType.innerHTML = "";
  addSegmentType.appendChild(createOptgroup("Built-in",
    Object.keys(SpliceRack.types).map(t => ({ value: t, text: t }))
  ));
  const merged = getMergedTemplates();
  const segTemplates = Object.entries(merged).filter(([, v]) => SpliceRack.types[(v as any).type]);
  if (segTemplates.length > 0) {
    addSegmentType.appendChild(createOptgroup("Templates",
      (segTemplates as [string, any][]).map(([name, tmpl]) => ({ value: name, text: `${name} (${tmpl.type})` }))
    ));
  }
}
refreshAddSegmentDropdown();

$("#btn-add-segment")!.addEventListener("click", () => {
  if (!projectData) return alert("Open or create a project first");
  const typeName = addSegmentType.value;
  const typeDef = SpliceRack.types[typeName];
  if (typeDef) {
    projectData.timeline.push(typeDef.defaults());
  } else {
    // Template — create a segment referencing it by name
    projectData.timeline.push({ type: typeName });
  }
  syncYamlFromData();
  const newIndex = projectData.timeline.length - 1;
  renderEditorPanel(newIndex);
});

// --- Render ---
$("#btn-render")!.addEventListener("click", async () => {
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
    renderStatusText.textContent = `Error: ${(err as Error).message}`;
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

function renderOutputsList(files: any[]) {
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

function selectOutput(filename: string) {
  currentOutput = filename;
  updateRoute();
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
      const f = data.files.find((x: any) => x.name === filename);
      if (f) {
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        outputFileSize.textContent = `${sizeMB} MB - ${new Date(f.modified).toLocaleString()}`;
      }
    });
}

$("#btn-delete-output")!.addEventListener("click", async () => {
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
      libraryStore.clear();
      audioFilesStore.clear();
      loadLibrary();
    } else if (msg.type === "clips-updated") {
      delete clipCache[msg.filename];
      if (msg.filename === currentFile) loadClips();
      if (projectData) renderSequence();
    } else if (msg.type === "project-updated") {
      loadProjects();
    } else if (msg.type === "project-file-changed") {
      loadProjects();
      if (msg.filename === currentProject) {
        loadProject(msg.filename);
      }
    } else if (msg.type === "render-started") {
      renderStatus.style.display = "";
      renderStatusText.textContent = "Rendering...";
      logsProgress.style.display = "";
      logsProgressFill.style.width = "0%";
      logsProgressText.textContent = "Rendering...";
      switchTab("logs-tab");
      addLog("info", `Render started: ${msg.filename}`);
    } else if (msg.type === "render-progress") {
      const pct = ((msg.segment + 1) / msg.total) * 100;
      renderProgressFill.style.width = `${pct}%`;
      logsProgressFill.style.width = `${pct}%`;
      const cacheNote = msg.cached ? " [cached]" : "";
      const text = `Segment ${msg.segment + 1}/${msg.total} (${msg.segmentType})${cacheNote}`;
      renderStatusText.textContent = `Rendering ${text}...`;
      logsProgressText.textContent = `Rendering ${text}...`;
      addLog("progress", text);
    } else if (msg.type === "render-complete") {
      renderProgressFill.style.width = "100%";
      renderStatusText.textContent = "Render complete!";
      logsProgressFill.style.width = "100%";
      logsProgressText.textContent = "Render complete!";
      addLog("success", `Render complete: ${msg.filename}`);
      setTimeout(() => {
        renderStatus.style.display = "none";
        logsProgress.style.display = "none";
      }, 3000);
      // Navigate to outputs tab and select the new file
      if (msg.filename) {
        switchTab("outputs-tab");
        loadOutputs().then(() => selectOutput(msg.filename));
      }
    } else if (msg.type === "outputs-updated") {
      loadOutputs();
    } else if (msg.type === "templates-updated") {
      loadExternalTemplates().then(() => {
        refreshAddSegmentDropdown();
        if (getActiveTab() === "templates-tab") loadTemplatesList();
        if (projectData) renderSequence();
      });
    } else if (msg.type === "render-phase") {
      logsProgressText.textContent = msg.phase;
      renderStatusText.textContent = msg.phase;
      addLog("info", msg.phase);
    } else if (msg.type === "audio-warning") {
      for (const err of msg.errors) addLog("warning", `Audio: ${err}`);
      renderStatusText.textContent = `Audio warning: ${msg.errors.join("; ")}`;
    } else if (msg.type === "ffmpeg-slots") {
      // Clear all FFmpeg slot panes
      const container = $("#ffmpeg-slots-container")!;
      container.innerHTML = "";
    } else if (msg.type === "ffmpeg-slot") {
      // Update or create an FFmpeg slot pane
      const container = $("#ffmpeg-slots-container")!;
      let slotEl = container.querySelector(`[data-slot="${msg.slot}"]`) as HTMLElement | null;
      if (!slotEl) {
        slotEl = document.createElement("div");
        slotEl.className = "ffmpeg-slot";
        slotEl.dataset.slot = String(msg.slot);
        const header = document.createElement("div");
        header.className = "ffmpeg-slot-header";
        header.textContent = msg.label || `Slot ${msg.slot}`;
        slotEl.appendChild(header);
        const output = document.createElement("div");
        output.className = "ffmpeg-slot-output";
        slotEl.appendChild(output);
        container.appendChild(slotEl);
      }
      const header = slotEl.querySelector(".ffmpeg-slot-header") as HTMLElement;
      if (msg.label) header.textContent = msg.label;
      const output = slotEl.querySelector(".ffmpeg-slot-output") as HTMLElement;
      output.textContent = msg.line || "";
      if (msg.done) {
        slotEl.classList.add("done");
        setTimeout(() => { if (slotEl && slotEl.parentNode) slotEl.parentNode.removeChild(slotEl); }, 1000);
      }
    } else if (msg.type === "render-error") {
      for (const err of msg.errors) addLog("error", err);
      renderStatusText.textContent = `Render failed: ${msg.errors.join("; ")}`;
    }
  });
  ws.addEventListener("close", () => {
    setTimeout(connectWS, 2000);
  });
}

// Handle tab in YAML editor (insert spaces instead of changing focus)
(yamlEditor as HTMLTextAreaElement).addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const ta = yamlEditor as HTMLTextAreaElement;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + "  " + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 2;
  }
});

// --- External Templates ---
// (state variables moved to top of file)

async function loadExternalTemplates() {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    externalTemplatesCache = {};
    for (const t of (data.templates || []) as any[]) {
      externalTemplatesCache[t.name] = t.parsed;
    }
  } catch {
    externalTemplatesCache = {};
  }
  return externalTemplatesCache;
}

function getMergedTemplates() {
  const inline = (projectData && projectData.templates) || {};
  return { ...externalTemplatesCache, ...inline };
}

const templatesList = $("#templates-list")!;
const templateEditorTitle = $("#template-editor-title")!;
const templateEditorFields = $("#template-editor-fields")!;
const templateTypeSelect = $("#template-type-select") as HTMLSelectElement;
const templateTypeRow = $(".template-type-row")!;

const templatesFilter = $("#templates-filter") as HTMLInputElement;
templatesFilter.addEventListener("input", () => renderFilteredTemplatesList());

async function loadTemplatesList() {
  await loadExternalTemplates();
  renderFilteredTemplatesList();
}

function renderFilteredTemplatesList() {
  const filter = (templatesFilter.value || "").toLowerCase();
  templatesList.innerHTML = "";

  const AUDIO_TYPES = new Set(["tts", "file", "source"]);
  const entries = Object.entries(externalTemplatesCache)
    .filter(([name]) => !filter || name.toLowerCase().includes(filter))
    .sort(([a], [b]) => a.localeCompare(b));

  // Split into video and audio
  const videoTemplates = entries.filter(([, t]) => !AUDIO_TYPES.has((t as any).type));
  const audioTemplates = entries.filter(([, t]) => AUDIO_TYPES.has((t as any).type));

  function renderGroup(label: string, items: [string, any][]) {
    if (items.length === 0) return;
    // Group by base type
    const byType: Record<string, [string, any][]> = {};
    for (const [name, tmpl] of items) {
      const t = tmpl.type || "unknown";
      if (!byType[t]) byType[t] = [];
      byType[t].push([name, tmpl]);
    }

    const groupHeader = document.createElement("li");
    groupHeader.className = "templates-group-header";
    groupHeader.textContent = label;
    templatesList.appendChild(groupHeader);

    for (const [type, group] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
      const subHeader = document.createElement("li");
      subHeader.className = "templates-group-header seg-type-${type}";
      subHeader.classList.add(`seg-type-${type}`);
      subHeader.textContent = type;
      templatesList.appendChild(subHeader);

      for (const [name] of group) {
        const li = document.createElement("li");
        li.className = currentTemplateName === name ? "active" : "";
        li.textContent = name;
        li.addEventListener("click", () => selectTemplate(name));
        templatesList.appendChild(li);
      }
    }
  }

  renderGroup("Video", videoTemplates);
  renderGroup("Audio", audioTemplates);
}

async function selectTemplate(name: string) {
  try {
    const res = await fetch(`/api/template/${encodeURIComponent(name)}`);
    const data = await res.json();
    currentTemplateName = name;
    currentTemplateData = data.parsed;
    updateRoute();
    renderTemplateEditor();
    // Highlight in list
    for (const li of templatesList.children) {
      li.classList.toggle("active", li.textContent.trim().endsWith(name));
    }
  } catch (err) {
    console.error("Failed to load template:", err);
  }
}

function renderTemplateEditor() {
  const yamlPreview = $("#template-yaml-preview") as HTMLElement;
  const yamlTextarea = $("#template-yaml") as HTMLTextAreaElement;

  if (!currentTemplateData || !currentTemplateName) {
    templateEditorTitle.textContent = "Select a template";
    templateEditorFields.innerHTML = "";
    templateTypeRow.style.display = "none";
    $("#btn-delete-template")!.style.display = "none";
    yamlPreview.style.display = "none";
    return;
  }

  templateEditorTitle.textContent = currentTemplateName;
  templateTypeRow.style.display = "";
  $("#btn-delete-template")!.style.display = "";

  // Populate type dropdown
  templateTypeSelect.innerHTML = "";
  for (const t of Object.keys(SpliceRack.types)) {
    templateTypeSelect.appendChild(createOption(t, t, currentTemplateData.type === t));
  }
  for (const t of ["tts", "file", "source"]) {
    if (!SpliceRack.types[t]) {
      templateTypeSelect.appendChild(createOption(t, `${t} (audio)`, currentTemplateData.type === t));
    }
  }

  renderTemplateFields();
  yamlPreview.style.display = "";
  updateTemplateYamlPreview();
}

// Strip properties that match the type's schema defaults.
// Always keeps "type". For nested objects (like style), strips matching sub-keys.
function stripDefaults(data: Record<string, any>): Record<string, any> {
  const typeName = data.type;
  const typeDef = SpliceRack.types[typeName];
  const schema = typeDef ? typeDef.schema : AUDIO_LAYER_SCHEMAS[typeName];
  if (!schema) return data;

  // Build a map of key -> default value from the schema
  const defaults: Record<string, any> = {};
  for (const prop of schema) {
    if (prop.default !== undefined) defaults[prop.key] = prop.default;
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "type") { result[k] = v; continue; }
    if (v === undefined) continue;

    // Check if this is a nested key (e.g. "style.align" -> nested in style object)
    // Schema keys use dot notation but data uses nested objects
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      // For nested objects, check each sub-key against schema defaults
      const cleaned: Record<string, any> = {};
      for (const [sk, sv] of Object.entries(v)) {
        const schemaKey = `${k}.${sk}`;
        if (defaults[schemaKey] !== undefined && JSON.stringify(sv) === JSON.stringify(defaults[schemaKey])) continue;
        cleaned[sk] = sv;
      }
      if (Object.keys(cleaned).length > 0) result[k] = cleaned;
    } else {
      // Flat key — check against schema default
      if (defaults[k] !== undefined && JSON.stringify(v) === JSON.stringify(defaults[k])) continue;
      result[k] = v;
    }
  }
  return result;
}

function updateTemplateYamlPreview() {
  const yamlTextarea = $("#template-yaml") as HTMLTextAreaElement;
  if (!currentTemplateData) { yamlTextarea.value = ""; return; }
  const cleaned = stripDefaults(currentTemplateData);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(cleaned)) {
    if (v === undefined) continue;
    const rendered = yamlValue(v as any, "");
    if (rendered.startsWith("\n")) {
      lines.push(`${k}:${rendered}`);
    } else {
      lines.push(`${k}: ${rendered}`);
    }
  }
  yamlTextarea.value = lines.join("\n");
}

function renderTemplateFields() {
  templateEditorFields.innerHTML = "";
  const tmpl = currentTemplateData;
  const typeName = tmpl.type;
  const typeDef = SpliceRack.types[typeName];
  const schema = typeDef ? typeDef.schema : AUDIO_LAYER_SCHEMAS[typeName];
  if (!schema) {
    templateEditorFields.innerHTML = '<div style="padding:12px;color:#808090;font-size:12px">Unknown type</div>';
    return;
  }

  for (const prop of schema) {
    if (prop.condition && !prop.condition(tmpl)) continue;

    const row = document.createElement("div");
    row.className = "prop-row";

    const label = document.createElement("label");
    label.textContent = prop.label;
    row.appendChild(label);

    const val = getNestedValue(tmpl, prop.key);
    const displayVal = val != null ? val : prop.default;

    if (prop.type === "clip-dropdown") {
      // Special: clip-dropdown needs async clips and custom logic
      const src = getNestedValue(tmpl, "source");
      const clipProp = { ...prop, _sourceClips: [] };
      const el = renderPropertyField(clipProp, displayVal, (val: any) => {
        if (val) { tmpl.clip = val; delete tmpl.start; delete tmpl.end; }
        else { delete tmpl.clip; }
        autoSaveTemplate();
      });
      // Populate clips async
      if (src) {
        getClipsForSource(src).then(() => {
          const clips = clipCache[src] || [];
          for (const c of clips) {
            el.appendChild(createOption(c.name, `${c.name} (${formatTime(c.start)} - ${formatTime(c.end)})`, displayVal === c.name));
          }
        });
      }
      row.appendChild(el);
    } else {
      const el = renderPropertyField(prop, displayVal, (val: any) => {
        setNestedValue(tmpl, prop.key, val);
        autoSaveTemplate();
        if (prop.type === "file") renderTemplateFields();
      });
      row.appendChild(el);
    }

    templateEditorFields.appendChild(row);
  }
}

let templateSaveTimer: ReturnType<typeof setTimeout> | null = null;
function autoSaveTemplate() {
  updateTemplateYamlPreview();
  if (templateSaveTimer) clearTimeout(templateSaveTimer);
  templateSaveTimer = setTimeout(async () => {
    if (!currentTemplateName || !currentTemplateData) return;
    try {
      await fetch(`/api/template/${encodeURIComponent(currentTemplateName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed: stripDefaults(currentTemplateData) }),
      });
    } catch (err) {
      console.error("Failed to save template:", err);
    }
  }, 500);
}

templateTypeSelect.addEventListener("change", () => {
  if (!currentTemplateData) return;
  currentTemplateData.type = templateTypeSelect.value;
  // Reset properties for new type, keeping the type
  const newData = { type: templateTypeSelect.value };
  const typeDef = SpliceRack.types[templateTypeSelect.value];
  if (typeDef) {
    const defaults = typeDef.defaults() as any;
    delete defaults.type; // keep our type name
    Object.assign(newData, defaults);
  }
  currentTemplateData = newData;
  autoSaveTemplate();
  renderTemplateFields();
});

$("#btn-new-template")!.addEventListener("click", async () => {
  const name = prompt("Template name:");
  if (!name) return;
  try {
    await fetch(`/api/template/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsed: { type: "caption", duration: 3 } }),
    });
    await loadTemplatesList();
    selectTemplate(name);
  } catch (err) {
    console.error("Failed to create template:", err);
  }
});

$("#btn-delete-template")!.addEventListener("click", async () => {
  if (!currentTemplateName) return;
  if (!confirm(`Delete template "${currentTemplateName}"?`)) return;
  try {
    await fetch(`/api/template/${encodeURIComponent(currentTemplateName)}`, { method: "DELETE" });
    currentTemplateName = null;
    currentTemplateData = null;
    renderTemplateEditor();
    await loadTemplatesList();
  } catch (err) {
    console.error("Failed to delete template:", err);
  }
});

// --- Init ---
loadLibrary();
connectWS();
loadExternalTemplates().then(() => {
  refreshAddSegmentDropdown();
  navigateFromUrl();
});
