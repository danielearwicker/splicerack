import { buildTextAlignmentExpr } from "../_helpers.ts";
import { ALPHA_ARGS, FFMPEG_MAX_BUFFER, hexToFFmpeg, escapeDrawtext, scalePadFilter } from "../../shared/ffmpeg.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "clip",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const { start, end } = ctx.resolveClip(seg);
    const duration = end - start;
    const speed = (seg.speed as number) || 1.0;
    const sourcePath = ctx.join(ctx.LIBRARY_DIR, seg.source as string);

    if (!ctx.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${seg.source}`);
    }

    const fadeFilter = ctx.buildFadeFilter(seg, duration / speed);

    // Build overlay filters if present
    let overlayFilters = "";
    let hasFont = false;
    const overlay = seg.overlay as Array<Record<string, unknown>> | undefined;
    if (overlay && overlay.length > 0) {
      for (const ov of overlay) {
        if (ov.type === "caption") {
          hasFont = true;
          const style = (ov.style || {}) as Record<string, unknown>;
          const fontSize = style["font-size"] || 36;
          const color = hexToFFmpeg(style.color as string, "#ffffff");
          const ovAlign = (style.align as string) || "center";
          const ovValign = (style.valign as string) || "bottom";
          const { xExpr, yExpr } = buildTextAlignmentExpr(ovAlign, ovValign);
          const escapedText = escapeDrawtext(ov.text as string);
          overlayFilters += `,drawtext=fontfile='${ctx.defaultFont}':text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xExpr}:y=${yExpr}`;
        }
      }
    }

    const vfParts: string[] = [];
    vfParts.push(scalePadFilter(ctx.width, ctx.height));
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
      ...ALPHA_ARGS,
      "-an",
      "-r", String(ctx.fps),
      outFile,
    ];

    // Always video-only — the audio mixer handles audio layers separately
    await ctx.execFileAsync("ffmpeg", args, FFMPEG_MAX_BUFFER);
  },
} satisfies SegmentRenderer;
