import { ALPHA_ARGS, FFMPEG_MAX_BUFFER, hexToFFmpeg, colorInputArgs } from "../../shared/ffmpeg.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "pause",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 1;
    const rawBg = (seg.background as string) || ctx.defaultBg;
    const isTransparent = rawBg === "transparent" || rawBg.startsWith("rgba") || (rawBg.replace("#", "").length === 8);
    const bgColor = hexToFFmpeg(rawBg, ctx.defaultBg);

    // Use transparent canvas when background is transparent/rgba/8-char hex
    const canvasArgs = isTransparent
      ? ["-f", "lavfi", "-i", `color=c=black@0:s=${ctx.width}x${ctx.height}:d=${duration}:r=${ctx.fps},format=rgba`]
      : colorInputArgs(bgColor, ctx.width, ctx.height, duration, ctx.fps);

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      ...canvasArgs,
      ...ALPHA_ARGS,
      "-t", String(duration),
      outFile,
    ], FFMPEG_MAX_BUFFER);
  },
} satisfies SegmentRenderer;
