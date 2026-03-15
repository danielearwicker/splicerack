import { buildTextAlignmentExpr } from "../_helpers.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "caption",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 3;
    const style = (seg.style || {}) as Record<string, unknown>;
    const fontSize = style["font-size"] || 48;
    const color = (((style.color as string) || "#ffffff")).replace("#", "");
    const bgColor = (((style.background as string) || ctx.defaultBg)).replace("#", "");
    const { xExpr, yExpr } = buildTextAlignmentExpr((style.align as string) || "center", (style.valign as string) || "middle");

    const escapedText = (seg.text as string)
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
} satisfies SegmentRenderer;
