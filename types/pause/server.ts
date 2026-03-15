import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "pause",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 1;
    const bgColor = ((seg.background as string) || ctx.defaultBg).replace("#", "");

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=0x${bgColor}:s=${ctx.width}x${ctx.height}:d=${duration}:r=${ctx.fps}`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-t", String(duration),
      outFile,
    ], { maxBuffer: 50 * 1024 * 1024 });
  },
} satisfies SegmentRenderer;
