import { H264_ARGS, FFMPEG_MAX_BUFFER, hexToFFmpeg, colorInputArgs } from "../../shared/ffmpeg.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "pause",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 1;
    const bgColor = hexToFFmpeg(seg.background as string, ctx.defaultBg);

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      ...colorInputArgs(bgColor, ctx.width, ctx.height, duration, ctx.fps),
      ...H264_ARGS,
      "-t", String(duration),
      outFile,
    ], FFMPEG_MAX_BUFFER);
  },
} satisfies SegmentRenderer;
