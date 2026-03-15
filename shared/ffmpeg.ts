// Shared FFmpeg constants and utilities used by server.ts and type plugins.

/** Standard H.264 encoding arguments used across all segment renderers. */
export const H264_ARGS = ["-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p"] as const;

/** Default maxBuffer for FFmpeg/FFprobe child processes (50 MB). */
export const FFMPEG_MAX_BUFFER = { maxBuffer: 50 * 1024 * 1024 } as const;

/** Strip '#' from a hex color for FFmpeg filter syntax (e.g. "#ff0000" -> "ff0000"). */
export function hexToFFmpeg(color: string, fallback: string = "#000000"): string {
  return (color || fallback).replace("#", "");
}

/** Escape text for use in FFmpeg drawtext filter expressions. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%");
}

/** Build lavfi color source input args: generates a solid-color video. */
export function colorInputArgs(bgColor: string, width: number, height: number, duration: number, fps: number): string[] {
  return ["-f", "lavfi", "-i", `color=c=0x${bgColor}:s=${width}x${height}:d=${duration}:r=${fps}`];
}

/** Build a scale+pad filter that fits video into target dimensions, preserving aspect ratio. */
export function scalePadFilter(width: number, height: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
}

/** Run ffprobe and parse JSON output. Returns the parsed JSON object. */
export async function probeJson(
  execFileAsync: Function,
  filePath: string,
  show: "format" | "streams" | "both" = "both",
): Promise<any> {
  const args = ["-v", "quiet", "-print_format", "json"];
  if (show === "format") args.push("-show_format");
  else if (show === "streams") args.push("-show_streams");
  else { args.push("-show_format", "-show_streams"); }
  args.push(filePath);
  const { stdout } = await execFileAsync("ffprobe", args);
  return JSON.parse(stdout as string);
}
