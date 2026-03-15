import { H264_ARGS, FFMPEG_MAX_BUFFER, scalePadFilter } from "../../shared/ffmpeg.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "image",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 5;
    const sourcePath = ctx.join(ctx.LIBRARY_DIR, seg.source as string);

    if (!ctx.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${seg.source}`);
    }

    const fadeFilter = ctx.buildFadeFilter(seg, duration);

    let vf: string;
    if (seg.animation) {
      const anim = seg.animation as Record<string, unknown>;
      if (anim.type === "ken-burns" || anim.type === "zoom" || anim.type === "pan") {
        const from = (anim.from || { x: 0, y: 0, scale: 1.0 }) as { x?: number; y?: number; scale?: number };
        const to = (anim.to || { x: 0, y: 0, scale: 1.2 }) as { x?: number; y?: number; scale?: number };
        const zStart = from.scale || 1.0;
        const zEnd = to.scale || 1.2;
        const totalFrames = duration * ctx.fps;
        const xStart = from.x || 0;
        const xEnd = to.x || 0;
        const yStart = from.y || 0;
        const yEnd = to.y || 0;
        vf = `zoompan=z='${zStart}+(${zEnd}-${zStart})*on/${totalFrames}':x='${xStart}+(${xEnd}-${xStart})*on/${totalFrames}':y='${yStart}+(${yEnd}-${yStart})*on/${totalFrames}':d=${totalFrames}:s=${ctx.width}x${ctx.height}:fps=${ctx.fps}${fadeFilter}`;
      } else {
        vf = `${scalePadFilter(ctx.width, ctx.height)}${fadeFilter}`;
      }
    } else {
      vf = `${scalePadFilter(ctx.width, ctx.height)}${fadeFilter}`;
    }

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      "-loop", "1",
      "-i", sourcePath,
      "-vf", vf,
      ...H264_ARGS,
      "-t", String(duration),
      "-r", String(ctx.fps),
      outFile,
    ], FFMPEG_MAX_BUFFER);
  },
} satisfies SegmentRenderer;
