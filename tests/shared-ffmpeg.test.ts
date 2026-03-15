import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hexToFFmpeg,
  escapeDrawtext,
  colorInputArgs,
  scalePadFilter,
  probeJson,
  H264_ARGS,
  FFMPEG_MAX_BUFFER,
} from "../shared/ffmpeg.ts";

describe("H264_ARGS", () => {
  it("contains the standard x264 encoding arguments", () => {
    assert.deepStrictEqual([...H264_ARGS], ["-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p"]);
  });
});

describe("FFMPEG_MAX_BUFFER", () => {
  it("is 50 MB", () => {
    assert.strictEqual(FFMPEG_MAX_BUFFER.maxBuffer, 50 * 1024 * 1024);
  });
});

describe("hexToFFmpeg", () => {
  it("strips # from a hex color", () => {
    assert.strictEqual(hexToFFmpeg("#ff0000"), "ff0000");
  });

  it("returns the string unchanged if no #", () => {
    assert.strictEqual(hexToFFmpeg("abcdef"), "abcdef");
  });

  it("uses fallback when color is empty string", () => {
    assert.strictEqual(hexToFFmpeg("", "#1a1a2e"), "1a1a2e");
  });

  it("uses fallback when color is undefined", () => {
    assert.strictEqual(hexToFFmpeg(undefined as any, "#1a1a2e"), "1a1a2e");
  });

  it("uses default fallback #000000 when no fallback provided", () => {
    assert.strictEqual(hexToFFmpeg(""), "000000");
  });

  it("prefers the color over the fallback when color is provided", () => {
    assert.strictEqual(hexToFFmpeg("#ffffff", "#000000"), "ffffff");
  });
});

describe("escapeDrawtext", () => {
  it("escapes backslashes", () => {
    assert.strictEqual(escapeDrawtext("a\\b"), "a\\\\\\\\b");
  });

  it("replaces straight apostrophes with curly quotes", () => {
    assert.strictEqual(escapeDrawtext("it's"), "it\u2019s");
  });

  it("escapes colons", () => {
    assert.strictEqual(escapeDrawtext("a:b"), "a\\:b");
  });

  it("escapes percent signs", () => {
    assert.strictEqual(escapeDrawtext("100%"), "100%%");
  });

  it("handles a string with all special characters", () => {
    const result = escapeDrawtext("it's 100% a\\path:here");
    assert.strictEqual(result, "it\u2019s 100%% a\\\\\\\\path\\:here");
  });

  it("handles empty string", () => {
    assert.strictEqual(escapeDrawtext(""), "");
  });

  it("passes through normal text unchanged", () => {
    assert.strictEqual(escapeDrawtext("Hello World"), "Hello World");
  });
});

describe("colorInputArgs", () => {
  it("returns lavfi color source args", () => {
    const args = colorInputArgs("1a1a2e", 1920, 1080, 3, 30);
    assert.deepStrictEqual(args, [
      "-f", "lavfi",
      "-i", "color=c=0x1a1a2e:s=1920x1080:d=3:r=30",
    ]);
  });

  it("handles different dimensions and fps", () => {
    const args = colorInputArgs("ffffff", 640, 480, 5.5, 60);
    assert.deepStrictEqual(args, [
      "-f", "lavfi",
      "-i", "color=c=0xffffff:s=640x480:d=5.5:r=60",
    ]);
  });
});

describe("scalePadFilter", () => {
  it("returns the correct scale+pad filter string", () => {
    const filter = scalePadFilter(1920, 1080);
    assert.strictEqual(
      filter,
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
    );
  });

  it("works with other dimensions", () => {
    const filter = scalePadFilter(640, 480);
    assert.strictEqual(
      filter,
      "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2"
    );
  });
});

describe("probeJson", () => {
  it("calls ffprobe with correct args for 'both' mode", async () => {
    const calls: any[] = [];
    const mockExec = async (...args: any[]) => {
      calls.push(args);
      return { stdout: '{"format":{},"streams":[]}' };
    };

    const result = await probeJson(mockExec, "/path/to/file.mp4");
    assert.deepStrictEqual(result, { format: {}, streams: [] });
    assert.deepStrictEqual(calls[0][1], [
      "-v", "quiet", "-print_format", "json",
      "-show_format", "-show_streams",
      "/path/to/file.mp4",
    ]);
  });

  it("calls ffprobe with -show_format only for 'format' mode", async () => {
    const calls: any[] = [];
    const mockExec = async (...args: any[]) => {
      calls.push(args);
      return { stdout: '{"format":{"duration":"5.0"}}' };
    };

    await probeJson(mockExec, "/path/to/file.mp4", "format");
    assert.ok(calls[0][1].includes("-show_format"));
    assert.ok(!calls[0][1].includes("-show_streams"));
  });

  it("calls ffprobe with -show_streams only for 'streams' mode", async () => {
    const calls: any[] = [];
    const mockExec = async (...args: any[]) => {
      calls.push(args);
      return { stdout: '{"streams":[]}' };
    };

    await probeJson(mockExec, "/path/to/file.mp4", "streams");
    assert.ok(calls[0][1].includes("-show_streams"));
    assert.ok(!calls[0][1].includes("-show_format"));
  });
});
