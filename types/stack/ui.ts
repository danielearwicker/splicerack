SpliceRack.registerType("stack", {
  schema: [
    { key: "duration", label: "Duration", type: "number", default: 0, min: 0, max: 300, step: 0.1 },
    { key: "background", label: "Background", type: "color", default: "#1a1a2e" },
    { key: "layers", label: "Layers", type: "layers" },
  ],

  badgeColor: { bg: "#4a3a6a", fg: "#c8a0f0" },

  defaults() {
    return {
      type: "stack",
      duration: 0,
      background: "#1a1a2e",
      layers: [
        { type: "caption", text: "Layer 1", duration: 3, opacity: 1, delay: 0,
          style: { "font-size": 48, color: "#ffffff", background: "#1a1a2e", align: "center", valign: "middle" } },
      ],
    };
  },

  timelineDisplay(seg) {
    const layers = (seg.layers as Array<Record<string, unknown>>) || [];
    const types = layers.map((l: Record<string, unknown>) => l.type).join(", ");
    const dur = seg.duration || "auto";
    return {
      title: `Stack (${layers.length} layer${layers.length !== 1 ? "s" : ""})`,
      detail: `${dur === 0 || dur === "auto" ? "auto" : dur + "s"} — ${types || "empty"}`,
    };
  },

});
