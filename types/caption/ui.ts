SpliceRack.registerType("caption", {
  schema: [
    { key: "text", label: "Text", type: "string", default: "New caption" },
    { key: "duration", label: "Duration", type: "number", default: 3, min: 0.1, max: 300, step: 0.1 },
    { key: "style.font-size", label: "Font Size", type: "number", default: 48, min: 8, max: 200, step: 1, group: "Style" },
    { key: "style.color", label: "Color", type: "color", default: "#ffffff", group: "Style" },
    { key: "style.background", label: "Background", type: "color", default: "#1a1a2e", group: "Style" },
    { key: "style.align", label: "Align", type: "dropdown", default: "center", options: ["left", "center", "right"], group: "Style" },
    { key: "style.valign", label: "Vertical", type: "dropdown", default: "middle", options: ["top", "middle", "bottom"], group: "Style" },
    { key: "fade-in", label: "Fade In", type: "number", default: 0.5, min: 0, max: 10, step: 0.1, group: "Transitions" },
    { key: "fade-out", label: "Fade Out", type: "number", default: 0.5, min: 0, max: 10, step: 0.1, group: "Transitions" },
  ],

  badgeColor: { bg: "#2d3a87", fg: "#8ab4f8" },

  defaults() {
    return {
      type: "caption",
      text: "New caption",
      duration: 3,
      style: { "font-size": 48, color: "#ffffff", background: "#1a1a2e", align: "center", valign: "middle" },
      "fade-in": 0.5,
      "fade-out": 0.5,
    };
  },

  timelineDisplay(seg) {
    return {
      title: (seg.text as string) || "(empty caption)",
      detail: `${seg.duration || 3}s`,
    };
  },

});
