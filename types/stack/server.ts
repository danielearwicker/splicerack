import { ALPHA_ARGS, FFMPEG_MAX_BUFFER, hexToFFmpeg, colorInputArgs, probeJson } from "../../shared/ffmpeg.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "stack",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const layers = (seg.layers || []) as Array<Record<string, unknown> & Segment>;
    const bgColor = hexToFFmpeg(seg.background as string, ctx.defaultBg);

    if (layers.length === 0) {
      // Empty stack — render a blank frame
      const duration = seg.duration || 1;
      await ctx.execFileAsync("ffmpeg", [
        "-y",
        ...colorInputArgs(bgColor, ctx.width, ctx.height, duration, ctx.fps),
        ...ALPHA_ARGS,
        "-t", String(duration), outFile,
      ], FFMPEG_MAX_BUFFER);
      return;
    }

    // Render each layer to a temp file, using cache where possible
    const layerFiles: string[] = [];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];

      const layerFile = ctx.join(ctx.OUTPUT_DIR, `_stack_layer_${i}_${Date.now()}.mov`);
      layerFiles.push(layerFile);

      // Build a segment for the sub-renderer (without stack-specific props)
      const layerSeg = { ...layer } as Record<string, unknown>;
      delete layerSeg.opacity;
      delete layerSeg.delay;

      await ctx.renderCached(layerSeg as Segment, layerFile, ctx);
    }

    if (layers.length === 1 && !layers[0].opacity && !layers[0].delay) {
      // Single layer with no compositing — just use it directly
      const { rename } = await import("fs/promises");
      await rename(layerFiles[0], outFile);
      return;
    }

    // Determine total duration from the longest layer + delay
    // We'll probe each layer for its duration
    const layerDurations: number[] = [];
    for (let i = 0; i < layerFiles.length; i++) {
      try {
        const info = await probeJson(ctx.execFileAsync, layerFiles[i], "format");
        layerDurations.push(parseFloat(info.format.duration) || 5);
      } catch {
        layerDurations.push(5);
      }
    }

    const totalDuration = seg.duration || Math.max(
      ...layers.map((l, i) => ((l.delay as number) || 0) + layerDurations[i])
    );

    // Build filter_complex for compositing
    // Start with a solid background canvas
    const inputs: string[] = [];
    for (const f of layerFiles) {
      inputs.push("-i", f);
    }

    const filterLines: string[] = [];
    // Base canvas
    filterLines.push(
      `color=c=0x${bgColor}:s=${ctx.width}x${ctx.height}:d=${totalDuration}:r=${ctx.fps},format=yuva420p[base]`
    );

    let lastLabel = "base";
    for (let i = 0; i < layers.length; i++) {
      const opacity = layers[i].opacity != null ? (layers[i].opacity as number) : 1;
      const delay = (layers[i].delay as number) || 0;

      const layerLabel = `l${i}`;
      const outLabel = `out${i}`;

      // Build per-layer filter: handle delay and opacity
      const layerFilters: string[] = [];
      if (delay > 0) {
        layerFilters.push(`tpad=start_duration=${delay}:color=black@0`);
      }
      layerFilters.push("format=yuva420p");
      if (opacity < 1) {
        layerFilters.push(`colorchannelmixer=aa=${opacity}`);
      }

      filterLines.push(`[${i}:v]${layerFilters.join(",")}[${layerLabel}]`);
      filterLines.push(
        `[${lastLabel}][${layerLabel}]overlay=0:0:eof_action=pass:format=yuv420p10[${outLabel}]`
      );
      lastLabel = outLabel;
    }

    // Final output conversion
    filterLines.push(`[${lastLabel}]format=yuv420p[final]`);

    const filterComplex = filterLines.join(";\n");
    const filterScript = ctx.writeFilterScript(filterComplex);

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      ...inputs,
      "-filter_complex_script", filterScript,
      "-map", "[final]",
      ...ALPHA_ARGS,
      "-t", String(totalDuration),
      outFile,
    ], FFMPEG_MAX_BUFFER);

    // Clean up layer temp files
    for (const f of layerFiles) {
      try { if (ctx.existsSync(f)) (await import("fs")).unlinkSync(f); } catch {}
    }
  },
} satisfies SegmentRenderer;
