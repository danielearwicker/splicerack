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

// --- Logs ---
const logsContainer = $("#logs-container");
const logsProgress = $("#logs-progress");
const logsProgressFill = $("#logs-progress-fill");
const logsProgressText = $("#logs-progress-text");
$("#btn-clear-logs").addEventListener("click", () => { logsContainer.innerHTML = ""; });

function addLog(level, message) {
  const entry = document.createElement("div");
  entry.className = `log-entry log-${level}`;
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  logsContainer.appendChild(entry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

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
  closeEditor();
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

// Auto-save on typing with 500ms debounce
let yamlDebounceTimer = null;
yamlEditor.addEventListener("input", () => {
  clearTimeout(yamlDebounceTimer);
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
      // Re-parse to update timeline
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

// Expose formatTime for type ui.js files
SpliceRack.formatTime = formatTime;

// Helper to check if a type is a known registered type (vs. a template name)
function isKnownType(t) {
  return !!SpliceRack.types[t];
}

// Dot-path helpers
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNestedValue(obj, path, value) {
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

function deleteNestedValue(obj, path) {
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

// --- Template resolution (client-side, mirrors server logic) ---

function resolveTemplate(seg, templates) {
  if (isKnownType(seg.type)) return seg;
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

// --- Segment property editor ---
let selectedSegmentIndex = null;
let libraryFilesCache = null;

const segmentEditor = $("#segment-editor");
const editorTypeSelect = $("#editor-type-select");
const editorTemplateInfo = $("#editor-template-info");
const editorFields = $("#editor-fields");

$("#btn-close-editor").addEventListener("click", closeEditor);

function closeEditor() {
  segmentEditor.style.display = "none";
  selectedSegmentIndex = null;
  $$(".timeline-segment.selected").forEach((s) => s.classList.remove("selected"));
}

editorTypeSelect.addEventListener("change", () => {
  if (selectedSegmentIndex == null || !projectData) return;
  const newType = editorTypeSelect.value;
  const seg = projectData.timeline[selectedSegmentIndex];
  const oldResolvedType = isKnownType(seg.type) ? seg.type : ((projectData.templates || {})[seg.type] || {}).type || seg.type;

  // Build a fresh segment with defaults for the new resolved type
  const resolvedType = isKnownType(newType) ? newType : ((projectData.templates || {})[newType] || {}).type || newType;
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

async function getLibraryFiles() {
  if (libraryFilesCache) return libraryFilesCache;
  try {
    const res = await fetch("/api/library");
    const data = await res.json();
    libraryFilesCache = data.files || [];
  } catch {
    libraryFilesCache = [];
  }
  return libraryFilesCache;
}

async function renderEditorPanel(index) {
  if (!projectData || !projectData.timeline || index >= projectData.timeline.length) {
    closeEditor();
    return;
  }

  selectedSegmentIndex = index;
  segmentEditor.style.display = "";

  const rawSeg = projectData.timeline[index];
  const templates = projectData.templates || {};
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
  const builtinGroup = document.createElement("optgroup");
  builtinGroup.label = "Built-in";
  for (const t of Object.keys(SpliceRack.types)) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    if (rawSeg.type === t) opt.selected = true;
    builtinGroup.appendChild(opt);
  }
  editorTypeSelect.appendChild(builtinGroup);

  const templateNames = Object.keys(templates);
  if (templateNames.length > 0) {
    const templateGroup = document.createElement("optgroup");
    templateGroup.label = "Templates";
    for (const name of templateNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = `${name} (${templates[name].type || "?"})`;
      if (rawSeg.type === name) opt.selected = true;
      templateGroup.appendChild(opt);
    }
    editorTypeSelect.appendChild(templateGroup);
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

    if (prop.type === "string") {
      const input = document.createElement("input");
      input.type = "text";
      input.value = displayValue != null ? String(displayValue) : "";
      input.addEventListener("change", () => {
        updateSegmentProperty(index, prop.key, input.value);
      });
      row.appendChild(input);

    } else if (prop.type === "number") {
      const input = document.createElement("input");
      input.type = "number";
      input.value = displayValue != null ? displayValue : "";
      if (prop.min != null) input.min = prop.min;
      if (prop.max != null) input.max = prop.max;
      if (prop.step != null) input.step = prop.step;
      input.addEventListener("change", () => {
        updateSegmentProperty(index, prop.key, parseFloat(input.value));
      });
      row.appendChild(input);

    } else if (prop.type === "color") {
      const pair = document.createElement("div");
      pair.className = "prop-color-pair";
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = displayValue || "#000000";
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.value = displayValue || "";
      colorInput.addEventListener("input", () => {
        textInput.value = colorInput.value;
        updateSegmentProperty(index, prop.key, colorInput.value);
      });
      textInput.addEventListener("change", () => {
        colorInput.value = textInput.value;
        updateSegmentProperty(index, prop.key, textInput.value);
      });
      pair.appendChild(colorInput);
      pair.appendChild(textInput);
      row.appendChild(pair);

    } else if (prop.type === "dropdown") {
      const select = document.createElement("select");
      for (const opt of prop.options) {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        if (String(displayValue) === opt) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        updateSegmentProperty(index, prop.key, select.value);
      });
      row.appendChild(select);

    } else if (prop.type === "file") {
      const select = document.createElement("select");
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "-- select file --";
      select.appendChild(emptyOpt);
      for (const f of libFiles) {
        const option = document.createElement("option");
        option.value = f.name;
        option.textContent = f.name;
        if (displayValue === f.name) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        updateSegmentProperty(index, prop.key, select.value);
        // Re-render editor to update clip dropdown
        renderEditorPanel(index);
      });
      row.appendChild(select);

    } else if (prop.type === "clip-dropdown") {
      const select = document.createElement("select");
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "-- manual start/end --";
      select.appendChild(emptyOpt);
      for (const c of sourceClips) {
        const option = document.createElement("option");
        option.value = c.name;
        option.textContent = `${c.name} (${formatTime(c.start)} - ${formatTime(c.end)})`;
        if (displayValue === c.name) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        if (select.value) {
          updateSegmentProperty(index, "clip", select.value);
          // Remove manual start/end when selecting a clip
          deleteNestedValue(projectData.timeline[index], "start");
          deleteNestedValue(projectData.timeline[index], "end");
        } else {
          deleteNestedValue(projectData.timeline[index], "clip");
          // Set default start/end
          setNestedValue(projectData.timeline[index], "start", 0);
          setNestedValue(projectData.timeline[index], "end", 10);
        }
        syncYamlFromData();
        renderEditorPanel(index);
      });
      row.appendChild(select);

    } else if (prop.type === "layers") {
      // Layers editor — renders as a list of layer cards
      const layersContainer = document.createElement("div");
      layersContainer.style.padding = "0 12px 4px";

      const layersValue = getNestedValue(resolvedSeg, prop.key) || [];

      for (let li = 0; li < layersValue.length; li++) {
        const layer = layersValue[li];
        const card = document.createElement("div");
        card.className = "layer-card";

        // Header: layer number, type dropdown, move/delete buttons
        const header = document.createElement("div");
        header.className = "layer-card-header";

        const num = document.createElement("span");
        num.className = "layer-num";
        num.textContent = `${li + 1}`;
        header.appendChild(num);

        const typeSelect = document.createElement("select");
        for (const t of Object.keys(SpliceRack.types)) {
          if (t === "stack") continue; // prevent recursive stacks
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          if (layer.type === t) opt.selected = true;
          typeSelect.appendChild(opt);
        }
        typeSelect.addEventListener("change", () => {
          const newTypeDef = SpliceRack.types[typeSelect.value];
          if (!newTypeDef) return;
          const newLayer = newTypeDef.defaults();
          newLayer.opacity = layer.opacity != null ? layer.opacity : 1;
          newLayer.delay = layer.delay || 0;
          layersValue[li] = newLayer;
          syncYamlFromData();
          renderEditorPanel(index);
        });
        header.appendChild(typeSelect);

        const actions = document.createElement("span");
        actions.className = "layer-actions";
        if (li > 0) {
          const upBtn = document.createElement("button");
          upBtn.textContent = "\u2191";
          upBtn.addEventListener("click", () => {
            [layersValue[li - 1], layersValue[li]] = [layersValue[li], layersValue[li - 1]];
            syncYamlFromData();
            renderEditorPanel(index);
          });
          actions.appendChild(upBtn);
        }
        if (li < layersValue.length - 1) {
          const downBtn = document.createElement("button");
          downBtn.textContent = "\u2193";
          downBtn.addEventListener("click", () => {
            [layersValue[li], layersValue[li + 1]] = [layersValue[li + 1], layersValue[li]];
            syncYamlFromData();
            renderEditorPanel(index);
          });
          actions.appendChild(downBtn);
        }
        const delBtn = document.createElement("button");
        delBtn.className = "layer-delete";
        delBtn.textContent = "\u00D7";
        delBtn.addEventListener("click", () => {
          layersValue.splice(li, 1);
          syncYamlFromData();
          renderEditorPanel(index);
        });
        actions.appendChild(delBtn);
        header.appendChild(actions);
        card.appendChild(header);

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
        delayInput.min = "0";
        delayInput.step = "0.1";
        delayInput.value = layer.delay || 0;
        delayInput.addEventListener("change", () => {
          layer.delay = parseFloat(delayInput.value);
          syncYamlFromData();
        });
        stackProps.appendChild(delayLabel);
        stackProps.appendChild(delayInput);

        card.appendChild(stackProps);

        // Sub-properties from the layer's type schema
        const layerTypeDef = SpliceRack.types[layer.type];
        if (layerTypeDef && layerTypeDef.schema) {
          const subProps = document.createElement("div");
          subProps.className = "layer-subprops";

          for (const sp of layerTypeDef.schema) {
            if (sp.condition && !sp.condition(layer)) continue;
            const subRow = document.createElement("div");
            subRow.className = "prop-row";

            const subLabel = document.createElement("label");
            subLabel.textContent = sp.label;
            subRow.appendChild(subLabel);

            const val = getNestedValue(layer, sp.key);
            const displayVal = val != null ? val : sp.default;

            if (sp.type === "string") {
              const input = document.createElement("input");
              input.type = "text";
              input.value = displayVal != null ? String(displayVal) : "";
              input.addEventListener("change", () => {
                setNestedValue(layer, sp.key, input.value);
                syncYamlFromData();
              });
              subRow.appendChild(input);
            } else if (sp.type === "number") {
              const input = document.createElement("input");
              input.type = "number";
              input.value = displayVal != null ? displayVal : "";
              if (sp.min != null) input.min = sp.min;
              if (sp.max != null) input.max = sp.max;
              if (sp.step != null) input.step = sp.step;
              input.addEventListener("change", () => {
                setNestedValue(layer, sp.key, parseFloat(input.value));
                syncYamlFromData();
              });
              subRow.appendChild(input);
            } else if (sp.type === "color") {
              const pair = document.createElement("div");
              pair.className = "prop-color-pair";
              const cInput = document.createElement("input");
              cInput.type = "color";
              cInput.value = displayVal || "#000000";
              const tInput = document.createElement("input");
              tInput.type = "text";
              tInput.value = displayVal || "";
              cInput.addEventListener("input", () => {
                tInput.value = cInput.value;
                setNestedValue(layer, sp.key, cInput.value);
                syncYamlFromData();
              });
              tInput.addEventListener("change", () => {
                cInput.value = tInput.value;
                setNestedValue(layer, sp.key, tInput.value);
                syncYamlFromData();
              });
              pair.appendChild(cInput);
              pair.appendChild(tInput);
              subRow.appendChild(pair);
            } else if (sp.type === "dropdown") {
              const sel = document.createElement("select");
              for (const o of sp.options) {
                const opt = document.createElement("option");
                opt.value = o;
                opt.textContent = o;
                if (String(displayVal) === o) opt.selected = true;
                sel.appendChild(opt);
              }
              sel.addEventListener("change", () => {
                setNestedValue(layer, sp.key, sel.value);
                syncYamlFromData();
                renderEditorPanel(index);
              });
              subRow.appendChild(sel);
            } else if (sp.type === "file") {
              const sel = document.createElement("select");
              const eo = document.createElement("option");
              eo.value = "";
              eo.textContent = "-- select file --";
              sel.appendChild(eo);
              for (const f of libFiles) {
                const opt = document.createElement("option");
                opt.value = f.name;
                opt.textContent = f.name;
                if (displayVal === f.name) opt.selected = true;
                sel.appendChild(opt);
              }
              sel.addEventListener("change", () => {
                setNestedValue(layer, sp.key, sel.value);
                syncYamlFromData();
                renderEditorPanel(index);
              });
              subRow.appendChild(sel);
            } else if (sp.type === "clip-dropdown") {
              const sel = document.createElement("select");
              const eo = document.createElement("option");
              eo.value = "";
              eo.textContent = "-- manual start/end --";
              sel.appendChild(eo);
              const layerSource = getNestedValue(layer, "source");
              const layerClips = layerSource ? (clipCache[layerSource] || []) : [];
              for (const c of layerClips) {
                const opt = document.createElement("option");
                opt.value = c.name;
                opt.textContent = `${c.name} (${formatTime(c.start)} - ${formatTime(c.end)})`;
                if (displayVal === c.name) opt.selected = true;
                sel.appendChild(opt);
              }
              sel.addEventListener("change", () => {
                if (sel.value) {
                  layer.clip = sel.value;
                  delete layer.start;
                  delete layer.end;
                } else {
                  delete layer.clip;
                  layer.start = 0;
                  layer.end = 10;
                }
                syncYamlFromData();
                renderEditorPanel(index);
              });
              subRow.appendChild(sel);
            }

            subProps.appendChild(subRow);
          }
          card.appendChild(subProps);
        }

        layersContainer.appendChild(card);
      }

      // Add layer button
      const addBtn = document.createElement("button");
      addBtn.className = "layers-add-btn";
      addBtn.textContent = "+ Add Layer";
      addBtn.addEventListener("click", () => {
        const defaultType = "caption";
        const newLayer = SpliceRack.types[defaultType].defaults();
        newLayer.opacity = 1;
        newLayer.delay = 0;
        layersValue.push(newLayer);
        setNestedValue(projectData.timeline[index], prop.key, layersValue);
        syncYamlFromData();
        renderEditorPanel(index);
      });
      layersContainer.appendChild(addBtn);

      // Layers take the full width — skip the normal row layout
      editorFields.appendChild(layersContainer);
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
}

// Audio layer type schemas
const AUDIO_LAYER_SCHEMAS = {
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
    { key: "loop", label: "Loop", type: "dropdown", default: "false", options: ["false", "true"] },
  ],
};

// Voice list cache
let voicesCache = null;
async function getVoicesList() {
  if (voicesCache) return voicesCache;
  try {
    const res = await fetch("/api/tts/voices");
    const data = await res.json();
    voicesCache = data.voices || [];
  } catch {
    voicesCache = [];
  }
  return voicesCache;
}

// Audio file list cache
let audioFilesCache = null;
async function getAudioFiles() {
  if (audioFilesCache) return audioFilesCache;
  try {
    const res = await fetch("/api/library?type=audio");
    const data = await res.json();
    audioFilesCache = data.files || [];
  } catch {
    audioFilesCache = [];
  }
  return audioFilesCache;
}

function buildAudioLayersEditor(segIndex, rawSeg) {
  const container = document.createElement("div");
  container.style.padding = "0 12px 8px";

  const header = document.createElement("div");
  header.className = "prop-group-header";
  header.textContent = "Audio";
  container.appendChild(header);

  const audioLayers = rawSeg.audio || [];

  for (let ai = 0; ai < audioLayers.length; ai++) {
    const layer = audioLayers[ai];
    const card = document.createElement("div");
    card.className = "layer-card";

    // Header row
    const cardHeader = document.createElement("div");
    cardHeader.className = "layer-card-header";

    const num = document.createElement("span");
    num.className = "layer-num";
    num.textContent = `${ai + 1}`;
    cardHeader.appendChild(num);

    // Type dropdown (source/tts/file + audio templates)
    const typeSelect = document.createElement("select");
    const audioTypes = ["source", "tts", "file"];

    // Only show "source" for clip segments
    const segType = rawSeg.type;
    const resolvedSegType = isKnownType(segType) ? segType :
      ((projectData.templates || {})[segType] || {}).type || segType;

    for (const t of audioTypes) {
      if (t === "source" && resolvedSegType !== "clip") continue;
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if ((layer.type || "") === t) opt.selected = true;
      typeSelect.appendChild(opt);
    }

    // Audio templates
    const audioTemplates = projectData["audio-templates"] || {};
    const templateNames = Object.keys(audioTemplates);
    if (templateNames.length > 0) {
      const tGroup = document.createElement("optgroup");
      tGroup.label = "Templates";
      for (const name of templateNames) {
        const opt = document.createElement("option");
        opt.value = `template:${name}`;
        opt.textContent = `${name} (${audioTemplates[name].type || "?"})`;
        if (layer.template === name) opt.selected = true;
        tGroup.appendChild(opt);
      }
      typeSelect.appendChild(tGroup);
    }

    typeSelect.addEventListener("change", () => {
      const val = typeSelect.value;
      if (val.startsWith("template:")) {
        const tmplName = val.slice(9);
        audioLayers[ai] = { template: tmplName };
      } else {
        const newLayer = { type: val };
        if (val === "source") { newLayer.volume = 1; }
        else if (val === "tts") { newLayer.text = ""; newLayer.voice = ""; newLayer.volume = 1; }
        else if (val === "file") { newLayer.source = ""; newLayer.volume = 1; }
        audioLayers[ai] = newLayer;
      }
      if (!rawSeg.audio) rawSeg.audio = audioLayers;
      syncYamlFromData();
      renderEditorPanel(segIndex);
    });
    cardHeader.appendChild(typeSelect);

    // Delete button
    const actions = document.createElement("span");
    actions.className = "layer-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "layer-delete";
    delBtn.textContent = "\u00D7";
    delBtn.addEventListener("click", () => {
      audioLayers.splice(ai, 1);
      if (audioLayers.length === 0) delete rawSeg.audio;
      syncYamlFromData();
      renderEditorPanel(segIndex);
    });
    actions.appendChild(delBtn);
    cardHeader.appendChild(actions);
    card.appendChild(cardHeader);

    // Resolve template if needed
    const resolvedLayer = layer.template
      ? { ...audioTemplates[layer.template], ...layer }
      : layer;
    const layerType = resolvedLayer.type;
    const schema = AUDIO_LAYER_SCHEMAS[layerType];

    if (layer.template) {
      const tmplInfo = document.createElement("div");
      tmplInfo.className = "editor-template-info";
      tmplInfo.style.margin = "2px 0";
      tmplInfo.style.borderRadius = "3px";
      tmplInfo.textContent = `Template: ${layer.template}`;
      card.appendChild(tmplInfo);
    }

    // Render schema fields for this audio layer type
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
        const isInherited = layer.template && layer[sp.key] === undefined;
        if (isInherited) subRow.classList.add("prop-inherited");

        if (sp.type === "string") {
          const input = document.createElement("input");
          input.type = "text";
          input.value = displayVal || "";
          input.addEventListener("change", () => {
            layer[sp.key] = input.value;
            syncYamlFromData();
          });
          subRow.appendChild(input);

        } else if (sp.type === "number") {
          const input = document.createElement("input");
          input.type = "number";
          input.value = displayVal != null ? displayVal : "";
          if (sp.min != null) input.min = sp.min;
          if (sp.max != null) input.max = sp.max;
          if (sp.step != null) input.step = sp.step;
          input.addEventListener("change", () => {
            layer[sp.key] = parseFloat(input.value);
            syncYamlFromData();
          });
          subRow.appendChild(input);

        } else if (sp.type === "dropdown") {
          const sel = document.createElement("select");
          for (const o of sp.options) {
            const opt = document.createElement("option");
            opt.value = o;
            opt.textContent = o;
            if (String(displayVal) === o) opt.selected = true;
            sel.appendChild(opt);
          }
          sel.addEventListener("change", () => {
            layer[sp.key] = sel.value === "true" ? true : sel.value === "false" ? false : sel.value;
            syncYamlFromData();
          });
          subRow.appendChild(sel);

        } else if (sp.type === "voice-dropdown") {
          const sel = document.createElement("select");
          const loading = document.createElement("option");
          loading.value = displayVal || "";
          loading.textContent = displayVal || "Loading voices...";
          sel.appendChild(loading);
          // Populate async
          getVoicesList().then((voices) => {
            sel.innerHTML = "";
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "-- select voice --";
            sel.appendChild(empty);
            for (const v of voices) {
              const opt = document.createElement("option");
              opt.value = v.name;
              opt.textContent = `${v.name} (${v.gender}, ${v.localeName})`;
              if (displayVal === v.name) opt.selected = true;
              sel.appendChild(opt);
            }
          });
          sel.addEventListener("change", () => {
            layer[sp.key] = sel.value;
            syncYamlFromData();
          });
          subRow.appendChild(sel);

        } else if (sp.type === "audio-file") {
          const sel = document.createElement("select");
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "-- select audio --";
          sel.appendChild(empty);
          // Populate async
          getAudioFiles().then((files) => {
            for (const f of files) {
              const opt = document.createElement("option");
              opt.value = f.name;
              opt.textContent = f.name;
              if (displayVal === f.name) opt.selected = true;
              sel.appendChild(opt);
            }
          });
          sel.addEventListener("change", () => {
            layer[sp.key] = sel.value;
            syncYamlFromData();
          });
          subRow.appendChild(sel);
        }

        // Revert button for template overrides
        if (layer.template && layer[sp.key] !== undefined) {
          const revertBtn = document.createElement("button");
          revertBtn.className = "prop-revert";
          revertBtn.textContent = "\u21A9";
          revertBtn.title = "Revert to template value";
          revertBtn.addEventListener("click", () => {
            delete layer[sp.key];
            syncYamlFromData();
            renderEditorPanel(segIndex);
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

    container.appendChild(card);
  }

  // Add audio layer button
  const addBtn = document.createElement("button");
  addBtn.className = "layers-add-btn";
  addBtn.textContent = "+ Add Audio Layer";
  addBtn.addEventListener("click", () => {
    if (!rawSeg.audio) rawSeg.audio = [];
    rawSeg.audio.push({ type: "tts", text: "", voice: "", volume: 1 });
    syncYamlFromData();
    renderEditorPanel(segIndex);
  });
  container.appendChild(addBtn);

  return container;
}

function updateSegmentProperty(index, key, value) {
  if (!projectData || !projectData.timeline[index]) return;
  setNestedValue(projectData.timeline[index], key, value);
  syncYamlFromData();
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
    const templateName = isKnownType(rawSeg.type) ? null : rawSeg.type;

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

    const typeDef = SpliceRack.types[seg.type];
    if (typeDef && typeDef.timelineDisplay) {
      const display = typeDef.timelineDisplay(seg, clipTimes);
      title.textContent = display.title;
      detail.textContent = display.detail;
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

    // Click to select and open editor
    div.addEventListener("click", () => {
      $$(".timeline-segment.selected").forEach((s) => s.classList.remove("selected"));
      div.classList.add("selected");
      selectYamlSegment(index);
      renderEditorPanel(index);
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

// Serialize a value for YAML output
function yamlValue(v, indent) {
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

function serializeObject(obj, indent) {
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

  // Audio templates section
  const audioTemplates = projectData["audio-templates"];
  if (audioTemplates && Object.keys(audioTemplates).length > 0) {
    lines.push("audio-templates:");
    for (const [name, tmpl] of Object.entries(audioTemplates)) {
      lines.push(`  ${name}:`);
      for (const line of serializeObject(tmpl, "    ")) {
        lines.push(line);
      }
      lines.push("");
    }
  }

  lines.push("timeline:");

  for (const seg of projectData.timeline) {
    const isTemplate = !isKnownType(seg.type);
    lines.push(`  - type: ${seg.type}`);

    if (isTemplate) {
      // For template segments, only serialize overridden properties
      for (const [k, v] of Object.entries(seg)) {
        if (k === "type") continue;
        if (v === undefined) continue;
        const rendered = yamlValue(v, "    ");
        if (rendered.startsWith("\n")) {
          lines.push(`    ${k}:${rendered}`);
        } else {
          lines.push(`    ${k}: ${rendered}`);
        }
      }
    } else {
      const typeDef = SpliceRack.types[seg.type];
      if (typeDef && typeDef.serialize) {
        typeDef.serialize(seg, lines);
      }
    }

    // Serialize audio layers (universal, all segment types)
    if (seg.audio && seg.audio.length > 0) {
      lines.push("    audio:");
      for (const a of seg.audio) {
        const firstKey = a.template ? "template" : "type";
        const firstVal = a.template || a.type;
        lines.push(`      - ${firstKey}: ${firstVal}`);
        for (const [k, v] of Object.entries(a)) {
          if (k === "type" || k === "template") continue;
          if (v === undefined) continue;
          if (typeof v === "string") {
            lines.push(`        ${k}: "${v.replace(/"/g, '\\"')}"`);
          } else {
            lines.push(`        ${k}: ${v}`);
          }
        }
      }
    }

    lines.push("");
  }

  yamlEditor.value = lines.join("\n");
  // Save without re-parsing — our in-memory projectData is the source of truth.
  // Re-render the timeline directly from the in-memory data.
  saveYamlQuiet();
  renderTimeline();
}

// --- Add segment ---
// Populate the add-segment type dropdown from the registry
const addSegmentType = $("#add-segment-type");
for (const t of Object.keys(SpliceRack.types)) {
  const opt = document.createElement("option");
  opt.value = t;
  opt.textContent = t;
  addSegmentType.appendChild(opt);
}

$("#btn-add-segment").addEventListener("click", () => {
  if (!projectData) return alert("Open or create a project first");
  const typeName = addSegmentType.value;
  const typeDef = SpliceRack.types[typeName];
  if (!typeDef) return;
  const newSeg = typeDef.defaults();
  projectData.timeline.push(newSeg);
  syncYamlFromData();
  // Open editor for the new segment
  const newIndex = projectData.timeline.length - 1;
  renderEditorPanel(newIndex);
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
      libraryFilesCache = null;
      audioFilesCache = null;
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
    } else if (msg.type === "render-phase") {
      logsProgressText.textContent = msg.phase;
      renderStatusText.textContent = msg.phase;
      addLog("info", msg.phase);
    } else if (msg.type === "audio-warning") {
      for (const err of msg.errors) addLog("warning", `Audio: ${err}`);
      renderStatusText.textContent = `Audio warning: ${msg.errors.join("; ")}`;
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
