import { buildTextAlignmentExpr } from "../_helpers.ts";
import { H264_ARGS, FFMPEG_MAX_BUFFER, hexToFFmpeg, escapeDrawtext, colorInputArgs } from "../../shared/ffmpeg.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "caption",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 3;
    const style = (seg.style || {}) as Record<string, unknown>;
    const fontSize = style["font-size"] || 48;
    const color = hexToFFmpeg(style.color as string, "#ffffff");
    const bgColor = hexToFFmpeg(style.background as string, ctx.defaultBg);
    const { xExpr, yExpr } = buildTextAlignmentExpr((style.align as string) || "center", (style.valign as string) || "middle");

    const escapedText = escapeDrawtext(seg.text as string);

    const fadeFilter = ctx.buildFadeFilter(seg, duration);

    const filter = `drawtext=fontfile='${ctx.defaultFont}':text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xExpr}:y=${yExpr}${fadeFilter}`;
    const filterScript = ctx.writeFilterScript(filter);

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      ...colorInputArgs(bgColor, ctx.width, ctx.height, duration, ctx.fps),
      "-filter_script:v", filterScript,
      ...H264_ARGS,
      "-t", String(duration),
      outFile,
    ], FFMPEG_MAX_BUFFER);
  },
} satisfies SegmentRenderer;
