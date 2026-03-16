SpliceRack.registerType("html", {
  schema: [
    { key: "duration", label: "Duration", type: "number", default: 3, min: 0.1, max: 60, step: 0.1 },
    { key: "file", label: "HTML File", type: "file", default: "", accept: [".html", ".htm"] },
    { key: "html", label: "Inline HTML", type: "string", default: "" },
  ],

  badgeColor: { bg: "#1a5c5c", fg: "#81d4d4" },

  defaults() {
    return {
      type: "html",
      duration: 3,
      file: "",
      html: "",
    };
  },

  sequenceDisplay(seg) {
    const source = seg.file || "(inline)";
    return {
      title: `HTML: ${source}`,
      detail: `${seg.duration || 3}s`,
    };
  },

});
