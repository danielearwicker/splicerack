export default {
  type: "clip",

  async render(seg, outFile, ctx) {
    const { start, end } = ctx.resolveClip(seg);
    const duration = end - start;
    const speed = seg.speed || 1.0;
    const sourcePath = ctx.join(ctx.LIBRARY_DIR, seg.source);

    if (!ctx.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${seg.source}`);
    }

    const fadeFilter = ctx.buildFadeFilter(seg, duration / speed);

    // Build overlay filters if present
    let overlayFilters = "";
    let hasFont = false;
    if (seg.overlay && seg.overlay.length > 0) {
      for (const ov of seg.overlay) {
        if (ov.type === "caption") {
          hasFont = true;
          const style = ov.style || {};
          const fontSize = style["font-size"] || 36;
          const color = (style.color || "#ffffff").replace("#", "");
          const ovAlign = style.align || "center";
          const ovValign = style.valign || "bottom";
          const xExpr =
            ovAlign === "left" ? "50" : ovAlign === "right" ? "(w-text_w-50)" : "((w-text_w)/2)";
          const yExpr =
            ovValign === "top" ? "50" : ovValign === "bottom" ? "(h-text_h-50)" : "((h-text_h)/2)";
          const escapedText = ov.text
            .replace(/\\/g, "\\\\\\\\")
            .replace(/'/g, "\u2019")
            .replace(/:/g, "\\:")
            .replace(/%/g, "%%");
          overlayFilters += `,drawtext=fontfile='${ctx.defaultFont}':text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xExpr}:y=${yExpr}`;
        }
      }
    }

    const vfParts = [];
    vfParts.push(`scale=${ctx.width}:${ctx.height}:force_original_aspect_ratio=decrease,pad=${ctx.width}:${ctx.height}:(ow-iw)/2:(oh-ih)/2`);
    if (speed !== 1.0) {
      vfParts.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
    }
    if (overlayFilters) {
      vfParts.push(overlayFilters.slice(1)); // remove leading comma
    }
    if (fadeFilter) {
      vfParts.push(fadeFilter.slice(1)); // remove leading comma
    }

    const filter = vfParts.join(",");

    // Use -filter_script when filter contains font paths (colon escaping issues on Windows)
    const filterArgs = hasFont
      ? ["-filter_script:v", ctx.writeFilterScript(filter)]
      : ["-vf", filter];

    const args = [
      "-y",
      "-ss", String(start),
      "-to", String(end),
      "-i", sourcePath,
      ...filterArgs,
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-an",
      "-r", String(ctx.fps),
      outFile,
    ];

    // Always video-only — the audio mixer handles audio layers separately
    await ctx.execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
  },
};
