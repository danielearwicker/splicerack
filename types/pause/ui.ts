SpliceRack.registerType("pause", {
  schema: [
    { key: "duration", label: "Duration", type: "number", default: 1.5, min: 0.1, max: 300, step: 0.1 },
    { key: "background", label: "Background", type: "color", default: "#1a1a2e" },
  ],

  badgeColor: { bg: "#5c4a1a", fg: "#f0c674" },

  defaults() {
    return {
      type: "pause",
      duration: 1.5,
      background: "#1a1a2e",
    };
  },

  timelineDisplay(seg) {
    return {
      title: "Pause",
      detail: `${seg.duration || 1}s`,
    };
  },

});
