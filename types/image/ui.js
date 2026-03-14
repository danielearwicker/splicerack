SpliceRack.registerType("image", {
  schema: [
    { key: "source", label: "Source", type: "file", default: "" },
    { key: "duration", label: "Duration", type: "number", default: 5, min: 0.1, max: 300, step: 0.1 },
    { key: "animation.type", label: "Animation", type: "dropdown", default: "none", options: ["none", "ken-burns", "zoom", "pan"], group: "Animation" },
    { key: "animation.from.x", label: "From X", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => seg.animation && seg.animation.type && seg.animation.type !== "none" },
    { key: "animation.from.y", label: "From Y", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => seg.animation && seg.animation.type && seg.animation.type !== "none" },
    { key: "animation.from.scale", label: "From Scale", type: "number", default: 1, min: 0.1, max: 10, step: 0.1, group: "Animation", condition: (seg) => seg.animation && seg.animation.type && seg.animation.type !== "none" },
    { key: "animation.to.x", label: "To X", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => seg.animation && seg.animation.type && seg.animation.type !== "none" },
    { key: "animation.to.y", label: "To Y", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => seg.animation && seg.animation.type && seg.animation.type !== "none" },
    { key: "animation.to.scale", label: "To Scale", type: "number", default: 1.2, min: 0.1, max: 10, step: 0.1, group: "Animation", condition: (seg) => seg.animation && seg.animation.type && seg.animation.type !== "none" },
    { key: "fade-in", label: "Fade In", type: "number", default: 0.5, min: 0, max: 10, step: 0.1, group: "Transitions" },
    { key: "fade-out", label: "Fade Out", type: "number", default: 0.5, min: 0, max: 10, step: 0.1, group: "Transitions" },
  ],

  badgeColor: { bg: "#5c1a4a", fg: "#f0a0d0" },

  defaults() {
    return {
      type: "image",
      source: "",
      duration: 5,
      "fade-in": 0.5,
      "fade-out": 0.5,
    };
  },

  timelineDisplay(seg) {
    let detail = `${seg.duration || 5}s`;
    if (seg.animation && seg.animation.type && seg.animation.type !== "none") {
      detail += ` [${seg.animation.type}]`;
    }
    return {
      title: seg.source || "(no source)",
      detail,
    };
  },

  serialize(seg, lines) {
    if (seg.source) lines.push(`    source: ${seg.source}`);
    lines.push(`    duration: ${seg.duration || 5}`);
    if (seg.animation && seg.animation.type && seg.animation.type !== "none") {
      lines.push("    animation:");
      lines.push(`      type: ${seg.animation.type}`);
      if (seg.animation.from) {
        lines.push(`      from: { x: ${seg.animation.from.x || 0}, y: ${seg.animation.from.y || 0}, scale: ${seg.animation.from.scale || 1} }`);
      }
      if (seg.animation.to) {
        lines.push(`      to: { x: ${seg.animation.to.x || 0}, y: ${seg.animation.to.y || 0}, scale: ${seg.animation.to.scale || 1} }`);
      }
    }
    if (seg["fade-in"]) lines.push(`    fade-in: ${seg["fade-in"]}`);
    if (seg["fade-out"]) lines.push(`    fade-out: ${seg["fade-out"]}`);
  },
});
