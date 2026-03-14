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
