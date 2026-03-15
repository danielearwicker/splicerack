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
    const title = (seg.clip as string) || (seg.source ? `${seg.source} [${seg.start}-${seg.end}]` : "(no source)");
    const parts = [(seg.source as string) || ""];
    if (clipTimes) {
      const dur = clipTimes.end - clipTimes.start;
      const speed = (seg.speed as number) || 1;
      parts.push(SpliceRack.formatTime(dur / speed));
    }
    if (seg.speed && seg.speed !== 1) parts.push(`@ ${seg.speed}x`);
    return { title, detail: parts.join("  ") };
  },

});
