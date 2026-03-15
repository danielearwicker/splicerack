SpliceRack.registerType("image", {
  schema: [
    { key: "source", label: "Source", type: "file", default: "" },
    { key: "duration", label: "Duration", type: "number", default: 5, min: 0.1, max: 300, step: 0.1 },
    { key: "animation.type", label: "Animation", type: "dropdown", default: "none", options: ["none", "ken-burns", "zoom", "pan"], group: "Animation" },
    { key: "animation.from.x", label: "From X", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => { const a = seg.animation as Record<string, unknown> | undefined; return !!a && !!a.type && a.type !== "none"; } },
    { key: "animation.from.y", label: "From Y", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => { const a = seg.animation as Record<string, unknown> | undefined; return !!a && !!a.type && a.type !== "none"; } },
    { key: "animation.from.scale", label: "From Scale", type: "number", default: 1, min: 0.1, max: 10, step: 0.1, group: "Animation", condition: (seg) => { const a = seg.animation as Record<string, unknown> | undefined; return !!a && !!a.type && a.type !== "none"; } },
    { key: "animation.to.x", label: "To X", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => { const a = seg.animation as Record<string, unknown> | undefined; return !!a && !!a.type && a.type !== "none"; } },
    { key: "animation.to.y", label: "To Y", type: "number", default: 0, step: 1, group: "Animation", condition: (seg) => { const a = seg.animation as Record<string, unknown> | undefined; return !!a && !!a.type && a.type !== "none"; } },
    { key: "animation.to.scale", label: "To Scale", type: "number", default: 1.2, min: 0.1, max: 10, step: 0.1, group: "Animation", condition: (seg) => { const a = seg.animation as Record<string, unknown> | undefined; return !!a && !!a.type && a.type !== "none"; } },
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
    const anim = seg.animation as Record<string, unknown> | undefined;
    if (anim && anim.type && anim.type !== "none") {
      detail += ` [${anim.type}]`;
    }
    return {
      title: (seg.source as string) || "(no source)",
      detail,
    };
  },

});
