export default {
  type: "caption",

  async render(seg, outFile, ctx) {
    const duration = seg.duration || 3;
    const style = seg.style || {};
    const fontSize = style["font-size"] || 48;
    const color = (style.color || "#ffffff").replace("#", "");
    const bgColor = (style.background || ctx.defaultBg).replace("#", "");
    const align = style.align || "center";
    const valign = style.valign || "middle";

    const xExpr =
      align === "left" ? "50" : align === "right" ? "(w-text_w-50)" : "((w-text_w)/2)";
    const yExpr =
      valign === "top" ? "50" : valign === "bottom" ? "(h-text_h-50)" : "((h-text_h)/2)";

    const escapedText = seg.text
      .replace(/\\/g, "\\\\\\\\")
      .replace(/'/g, "\u2019")
      .replace(/:/g, "\\:")
      .replace(/%/g, "%%");

    const fadeFilter = ctx.buildFadeFilter(seg, duration);

    const filter = `drawtext=fontfile='${ctx.defaultFont}':text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xExpr}:y=${yExpr}${fadeFilter}`;
    const filterScript = ctx.writeFilterScript(filter);

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=0x${bgColor}:s=${ctx.width}x${ctx.height}:d=${duration}:r=${ctx.fps}`,
      "-filter_script:v", filterScript,
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-t", String(duration),
      outFile,
    ], { maxBuffer: 50 * 1024 * 1024 });
  },
};
