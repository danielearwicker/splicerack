export function buildFadeFilter(seg, duration) {
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

// --- Keyframe animation ---

// Build a piecewise FFmpeg expression that interpolates between keyframe values.
// frames: array of frame numbers, values: array of property values, eases: array of easing types
function buildPiecewiseExpr(frames, values, eases, frameVar = "n") {
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

    let progress;
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
export function buildKeyframeFilter(keyframes, fps, srcW, srcH, outW, outH) {
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
