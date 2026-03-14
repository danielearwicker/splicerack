export default {
  type: "image",

  async render(seg, outFile, ctx) {
    const duration = seg.duration || 5;
    const sourcePath = ctx.join(ctx.LIBRARY_DIR, seg.source);

    if (!ctx.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${seg.source}`);
    }

    const fadeFilter = ctx.buildFadeFilter(seg, duration);

    let vf;
    if (seg.animation) {
      const anim = seg.animation;
      if (anim.type === "ken-burns" || anim.type === "zoom" || anim.type === "pan") {
        const from = anim.from || { x: 0, y: 0, scale: 1.0 };
        const to = anim.to || { x: 0, y: 0, scale: 1.2 };
        const zStart = from.scale || 1.0;
        const zEnd = to.scale || 1.2;
        const totalFrames = duration * ctx.fps;
        const xStart = from.x || 0;
        const xEnd = to.x || 0;
        const yStart = from.y || 0;
        const yEnd = to.y || 0;
        vf = `zoompan=z='${zStart}+(${zEnd}-${zStart})*on/${totalFrames}':x='${xStart}+(${xEnd}-${xStart})*on/${totalFrames}':y='${yStart}+(${yEnd}-${yStart})*on/${totalFrames}':d=${totalFrames}:s=${ctx.width}x${ctx.height}:fps=${ctx.fps}${fadeFilter}`;
      } else {
        vf = `scale=${ctx.width}:${ctx.height}:force_original_aspect_ratio=decrease,pad=${ctx.width}:${ctx.height}:(ow-iw)/2:(oh-ih)/2${fadeFilter}`;
      }
    } else {
      vf = `scale=${ctx.width}:${ctx.height}:force_original_aspect_ratio=decrease,pad=${ctx.width}:${ctx.height}:(ow-iw)/2:(oh-ih)/2${fadeFilter}`;
    }

    await ctx.execFileAsync("ffmpeg", [
      "-y",
      "-loop", "1",
      "-i", sourcePath,
      "-vf", vf,
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-t", String(duration),
      "-r", String(ctx.fps),
      outFile,
    ], { maxBuffer: 50 * 1024 * 1024 });
  },
};
