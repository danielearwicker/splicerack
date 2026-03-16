import puppeteer from "puppeteer";
import { join } from "path";
import { mkdirSync, existsSync, unlinkSync, readdirSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
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
}

/**
 * Render an HTML/CSS animation to an MP4 video file.
 */
export async function renderHtmlToVideo({ html, width, height, fps, duration, outFile, tempDir }: RenderHtmlToVideoOptions): Promise<void> {
  const framesDir = join(tempDir, `_html_frames_${Date.now()}`);
  if (!existsSync(framesDir)) mkdirSync(framesDir, { recursive: true });

  const totalFrames = Math.ceil(duration * fps);
  const frameDuration = 1000 / fps; // ms per frame

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
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

    await page.setContent(wrappedHtml, { waitUntil: "load" });

    // Capture each frame by seeking the animation
    for (let frame = 0; frame < totalFrames; frame++) {
      const timeMs = frame * frameDuration;

      // Set all animations to the target time
      await (page as any).evaluate((t: number) => {
        (document as any).getAnimations({ subtree: true }).forEach((anim: Animation) => {
          anim.currentTime = t;
        });
      }, timeMs);

      // Small delay to let the browser paint
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

      const framePath = join(framesDir, `frame_${String(frame).padStart(6, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png", omitBackground: true });
    }
  } finally {
    if (browser) await browser.close();
  }

  // Stitch frames into alpha-capable video with FFmpeg (PNG codec for transparency)
  await execFileAsync("ffmpeg", [
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
