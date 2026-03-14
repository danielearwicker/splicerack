SpliceRack.registerType("clip", {
  schema: [
    { key: "source", label: "Source", type: "file", default: "" },
    { key: "clip", label: "Clip", type: "clip-dropdown", default: "" },
    { key: "start", label: "Start", type: "number", default: 0, min: 0, step: 0.001, condition: (seg) => !seg.clip },
    { key: "end", label: "End", type: "number", default: 10, min: 0, step: 0.001, condition: (seg) => !seg.clip },
    { key: "speed", label: "Speed", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
    { key: "fade-in", label: "Fade In", type: "number", default: 0, min: 0, max: 10, step: 0.1, group: "Transitions" },
    { key: "fade-out", label: "Fade Out", type: "number", default: 0, min: 0, max: 10, step: 0.1, group: "Transitions" },
  ],

  badgeColor: { bg: "#1a5c3a", fg: "#81c995" },

  defaults() {
    return {
      type: "clip",
      source: "",
      start: 0,
      end: 10,
    };
  },

  timelineDisplay(seg, clipTimes) {
    const title = seg.clip || (seg.source ? `${seg.source} [${seg.start}-${seg.end}]` : "(no source)");
    const parts = [seg.source || ""];
    if (clipTimes) {
      const dur = clipTimes.end - clipTimes.start;
      const speed = seg.speed || 1;
      parts.push(SpliceRack.formatTime(dur / speed));
    }
    if (seg.speed && seg.speed !== 1) parts.push(`@ ${seg.speed}x`);
    return { title, detail: parts.join("  ") };
  },

  serialize(seg, lines) {
    if (seg.source) lines.push(`    source: ${seg.source}`);
    if (seg.clip) lines.push(`    clip: ${seg.clip}`);
    if (seg.start != null && !seg.clip) lines.push(`    start: ${seg.start}`);
    if (seg.end != null && !seg.clip) lines.push(`    end: ${seg.end}`);
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
    if (seg["fade-in"]) lines.push(`    fade-in: ${seg["fade-in"]}`);
    if (seg["fade-out"]) lines.push(`    fade-out: ${seg["fade-out"]}`);
  },
});
