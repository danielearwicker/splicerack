import puppeteer from "puppeteer";
import { join } from "path";
import { mkdirSync, existsSync, unlinkSync, readdirSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Render an HTML/CSS animation to an MP4 video file.
 *
 * @param {object} opts
 * @param {string} opts.html - Full HTML document string (including <style> and animation CSS)
 * @param {number} opts.width - Output width in pixels
 * @param {number} opts.height - Output height in pixels
 * @param {number} opts.fps - Frames per second
 * @param {number} opts.duration - Total duration in seconds
 * @param {string} opts.outFile - Output MP4 path
 * @param {string} opts.tempDir - Directory for temporary frame PNGs
 */
export async function renderHtmlToVideo({ html, width, height, fps, duration, outFile, tempDir }) {
  const framesDir = join(tempDir, `_html_frames_${Date.now()}`);
  if (!existsSync(framesDir)) mkdirSync(framesDir, { recursive: true });

  const totalFrames = Math.ceil(duration * fps);
  const frameDuration = 1000 / fps; // ms per frame

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
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
      await page.evaluate((t) => {
        document.getAnimations({ subtree: true }).forEach((anim) => {
          anim.currentTime = t;
        });
      }, timeMs);

      // Small delay to let the browser paint
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

      const framePath = join(framesDir, `frame_${String(frame).padStart(6, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png" });
    }
  } finally {
    if (browser) await browser.close();
  }

  // Stitch frames into MP4 with FFmpeg
  await execFileAsync("ffmpeg", [
    "-y",
    "-framerate", String(fps),
    "-i", join(framesDir, "frame_%06d.png"),
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
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
