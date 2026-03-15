// --- Output / Project settings ---
export interface OutputSettings {
  width?: number;
  height?: number;
  fps?: number;
  background?: string;
  "background-audio"?: AudioLayerDef[];
}

// --- Segments ---
export interface BaseSegment {
  type: string;
  duration?: number;
  "fade-in"?: number;
  "fade-out"?: number;
  audio?: AudioLayerDef[];
  keyframes?: KeyframeDef[];
  [key: string]: unknown;
}

export interface CaptionStyle {
  "font-size"?: number;
  color?: string;
  background?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
}

export type Segment = BaseSegment;

// --- Audio ---
export interface AudioLayerDef {
  type: string;
  mute?: boolean;
  delay?: number;
  volume?: number;
  text?: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  source?: string;
  loop?: boolean;
}

export interface ResolvedAudioItem {
  path: string;
  absoluteStart: number;
  volume: number;
  loop: boolean;
  temp: boolean;
  ttsCached?: boolean;
}

// --- Keyframes ---
export interface KeyframeDef {
  time: number;
  scale?: number;
  x?: number;
  y?: number;
  ease?: "linear" | "ease-in-out";
}

// --- Clips ---
export interface ClipDef {
  name: string;
  start: number;
  end: number;
}

// --- Render context ---
export interface RenderContext {
  width: number;
  height: number;
  fps: number;
  defaultBg: string;
  defaultFont: string;
  buildFadeFilter: (seg: BaseSegment, duration: number) => string;
  resolveClip: (seg: Segment) => { start: number; end: number };
  readClips: (filename: string) => ClipDef[];
  writeFilterScript: (filter: string) => string;
  LIBRARY_DIR: string;
  OUTPUT_DIR: string;
  execFileAsync: Function;
  existsSync: (path: string) => boolean;
  join: (...paths: string[]) => string;
  rendererRegistry: Map<string, SegmentRenderer>;
  renderCached: (seg: Segment, outFile: string, ctx: RenderContext) => Promise<{ hit: boolean }>;
  broadcast: (msg: object) => void;
}

// --- Segment renderer (server-side plugin) ---
export interface SegmentRenderer {
  type: string;
  render: (seg: Segment, outFile: string, ctx: RenderContext) => Promise<void>;
}

// --- Client-side type definition ---
export interface PropertySchema {
  key: string;
  label: string;
  type: "string" | "number" | "color" | "dropdown" | "file" | "clip-dropdown" | "voice-dropdown" | "audio-file" | "layers";
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  group?: string;
  accept?: string[];
  condition?: (seg: Segment) => boolean;
  _sourceClips?: ClipDef[];
}

export interface TypeDefinition {
  schema: PropertySchema[];
  badgeColor?: { bg: string; fg: string };
  defaults: () => Segment;
  timelineDisplay: (seg: Segment, clipTimes?: { start: number; end: number }) => { title: string; detail: string };
}

// --- Project ---
export interface Project {
  output?: OutputSettings;
  templates?: Record<string, Partial<Segment>>;
  timeline?: Segment[];
}

// --- TTS ---
export interface Voice {
  name: string;
  displayName: string;
  locale: string;
  gender: string;
  localeName: string;
}

export interface SynthesizeParams {
  text: string;
  voice: string;
  rate?: string;
  pitch?: string;
  volume?: number;
}

export interface SynthesizeResult {
  path: string;
  cached: boolean;
}
