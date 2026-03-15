import type { KeyframeDef, Segment } from "../shared/types.ts";

export function buildTextAlignmentExpr(align: string, valign: string): { xExpr: string; yExpr: string } {
  const xExpr = align === "left" ? "50" : align === "right" ? "(w-text_w-50)" : "((w-text_w)/2)";
  const yExpr = valign === "top" ? "50" : valign === "bottom" ? "(h-text_h-50)" : "((h-text_h)/2)";
  return { xExpr, yExpr };
}

export function buildFadeFilter(seg: Segment, duration: number): string {
  const parts: string[] = [];
  if (seg["fade-in"]) {
    parts.push(`fade=t=in:st=0:d=${seg["fade-in"]}`);
  }
  if (seg["fade-out"]) {
    const fadeStart = duration - (seg["fade-out"] as number);
    parts.push(`fade=t=out:st=${fadeStart.toFixed(3)}:d=${seg["fade-out"]}`);
  }
  return parts.length ? "," + parts.join(",") : "";
}

// --- Keyframe animation ---

// Build a piecewise FFmpeg expression that interpolates between keyframe values.
// frames: array of frame numbers, values: array of property values, eases: array of easing types
function buildPiecewiseExpr(frames: number[], values: number[], eases: string[], frameVar: string = "n"): string {
  if (frames.length === 1) return String(values[0]);

  // Build from last segment backwards (nested if)
  let expr = String(values[values.length - 1]);

  for (let i = frames.length - 2; i >= 0; i--) {
    const f0 = frames[i], f1 = frames[i + 1];
    const v0 = values[i], v1 = values[i + 1];
    const ease = eases[i + 1] || "linear";
    const span = f1 - f0;
    if (span <= 0) continue;

    // Normalized progress t = (frameVar - f0) / span
    const t = `(${frameVar}-${f0})/${span}`;

    let progress: string;
    if (ease === "ease-in-out") {
      // smoothstep: 3t^2 - 2t^3
      progress = `(3*pow(${t},2)-2*pow(${t},3))`;
    } else {
      progress = t;
    }

    const delta = v1 - v0;
    const interp = delta === 0 ? String(v0) : `${v0}+${delta}*${progress}`;
    expr = `if(lt(${frameVar},${f1}),${interp},${expr})`;
  }

  return expr;
}

// Build a zoompan FFmpeg filter string for keyframe animation.
// keyframes: [{ time, scale, x, y, ease }], sorted by time
// Uses zoompan filter which is designed for dynamic zoom/pan (crop filter
// rejects expressions that evaluate to near-source dimensions).
export function buildKeyframeFilter(keyframes: KeyframeDef[], fps: number, srcW: number, srcH: number, outW: number, outH: number): string {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const frames = sorted.map((kf) => Math.round(kf.time * fps));
  const scales = sorted.map((kf) => kf.scale || 1);
  const xs = sorted.map((kf) => kf.x != null ? kf.x : 0.5);
  const ys = sorted.map((kf) => kf.y != null ? kf.y : 0.5);
  const eases = sorted.map((kf) => kf.ease || "linear");

  // zoompan uses 'on' (output frame number) instead of 'n'
  const scaleExpr = buildPiecewiseExpr(frames, scales, eases, "on");
  const xExpr = buildPiecewiseExpr(frames, xs, eases, "on");
  const yExpr = buildPiecewiseExpr(frames, ys, eases, "on");

  // zoompan z = zoom level, x/y = top-left corner of the viewport in source pixels
  // Focal point (0-1) maps to: pan position = (srcDim - srcDim/zoom) * focal
  const zExpr = `'${scaleExpr}'`;
  const panX = `'(iw-iw/zoom)*(${xExpr})'`;
  const panY = `'(ih-ih/zoom)*(${yExpr})'`;

  return `zoompan=z=${zExpr}:x=${panX}:y=${panY}:d=1:s=${outW}x${outH}:fps=${fps}`;
}
