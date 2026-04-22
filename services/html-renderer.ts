import puppeteer from "puppeteer";
import { join } from "path";
import { mkdirSync, existsSync, unlinkSync, readdirSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";
import { FFMPEG_PATH } from "../shared/ffmpeg.ts";
import { ALPHA_ARGS } from "../shared/ffmpeg.ts";

const execFileAsync = promisify(execFile);

interface RenderHtmlToVideoOptions {
  html: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  outFile: string;
  tempDir: string;
  baseDir?: string;
  onProgress?: (msg: { phase: string; frame?: number; totalFrames?: number }) => void;
}

/**
 * Render an HTML/CSS animation to an MP4 video file.
 */
export async function renderHtmlToVideo({ html, width, height, fps, duration, outFile, tempDir, baseDir, onProgress }: RenderHtmlToVideoOptions): Promise<void> {
  const framesDir = join(tempDir, `_html_frames_${Date.now()}`);
  if (!existsSync(framesDir)) mkdirSync(framesDir, { recursive: true });

  const totalFrames = Math.ceil(duration * fps);
  const frameDuration = 1000 / fps; // ms per frame

  const report = onProgress || (() => {});
  report({ phase: `Launching browser (${totalFrames} frames to capture)` });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  let tempHtmlFile: string | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--window-size=${width},${height}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    // Inject the HTML with animation paused — we'll seek frame by frame
    // We wrap the user's HTML to add a controllable animation timeline
    const wrappedHtml = html.replace(
      "</head>",
      `<style>
        *, *::before, *::after {
          animation-play-state: paused !important;
        }
      </style></head>`
    );

    report({ phase: "Loading HTML content" });
    if (baseDir) {
      // Write to a temp file in baseDir so relative URLs (images, fonts) resolve naturally
      tempHtmlFile = join(baseDir, `_splicerack_render_${Date.now()}.html`);
      writeFileSync(tempHtmlFile, wrappedHtml, "utf-8");
      await page.goto(pathToFileURL(tempHtmlFile).href, { waitUntil: "load" });
    } else {
      await page.setContent(wrappedHtml, { waitUntil: "load" });
    }

    // Capture each frame by seeking the animation
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeMs = frame * frameDuration;

      if (frame % 10 === 0) {
        const pct = Math.round((frame / totalFrames) * 100);
        report({ phase: `Capturing frame ${frame + 1}/${totalFrames} (${pct}%)`, frame: frame + 1, totalFrames });
      }

      // Set all animations to the target time
      await (page as any).evaluate((t: number, dur: number) => {
        // Seek all CSS animations
        (document as any).getAnimations({ subtree: true }).forEach((anim: Animation) => {
          anim.currentTime = t;
        });
        // Dispatch a custom event so the page can update JS-driven content
        window.dispatchEvent(new CustomEvent("splicerack-frame", {
          detail: { timeMs: t, progress: t / dur, duration: dur }
        }));
      }, timeMs, duration * 1000);

      // Small delay to let the browser paint
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

      const framePath = join(framesDir, `frame_${String(frame).padStart(6, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png", omitBackground: true });
    }

    report({ phase: `All ${totalFrames} frames captured` });
  } finally {
    if (browser) await browser.close();
    if (tempHtmlFile) try { unlinkSync(tempHtmlFile); } catch {}
  }

  // Stitch frames into alpha-capable video with FFmpeg (PNG codec for transparency)
  report({ phase: "Stitching frames into video with FFmpeg" });
  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-framerate", String(fps),
    "-i", join(framesDir, "frame_%06d.png"),
    ...ALPHA_ARGS,
    outFile,
  ], { maxBuffer: 50 * 1024 * 1024 });

  // Clean up frame PNGs
  try {
    for (const f of readdirSync(framesDir)) {
      unlinkSync(join(framesDir, f));
    }
    const { rmdirSync } = await import("fs");
    rmdirSync(framesDir);
  } catch {}
}
