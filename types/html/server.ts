import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { renderHtmlToVideo } from "../../services/html-renderer.ts";
import type { SegmentRenderer, RenderContext, Segment } from "../../shared/types.ts";

export default {
  type: "html",

  async render(seg: Segment, outFile: string, ctx: RenderContext): Promise<void> {
    const duration = seg.duration || 3;

    // HTML can come from inline content or a file reference
    let html: string;
    if (seg.file) {
      const filePath = join(ctx.LIBRARY_DIR, seg.file as string);
      if (!existsSync(filePath)) throw new Error(`HTML file not found: ${seg.file}`);
      html = readFileSync(filePath, "utf-8");
    } else if (seg.html) {
      html = seg.html as string;
    } else {
      throw new Error("html segment requires either 'html' (inline) or 'file' property");
    }

    // Substitute variables in the HTML (e.g. {{width}}, {{height}}, {{duration}}, {{fps}})
    html = html
      .replace(/\{\{width\}\}/g, String(ctx.width))
      .replace(/\{\{height\}\}/g, String(ctx.height))
      .replace(/\{\{duration\}\}/g, String(duration))
      .replace(/\{\{fps\}\}/g, String(ctx.fps))
      .replace(/\{\{background\}\}/g, ctx.defaultBg);

    // Substitute any custom variables from seg.vars
    if (seg.vars) {
      for (const [key, value] of Object.entries(seg.vars as Record<string, unknown>)) {
        html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
    }

    await renderHtmlToVideo({
      html,
      width: ctx.width,
      height: ctx.height,
      fps: ctx.fps,
      duration,
      outFile,
      tempDir: ctx.OUTPUT_DIR,
    });
  },
} satisfies SegmentRenderer;
