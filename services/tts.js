import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Derive TTS endpoint from AZURE_SPEECH_ENDPOINT.
// The cognitive services endpoint (e.g. https://uksouth.api.cognitive.microsoft.com/)
// does NOT serve TTS directly. The TTS REST API lives at {region}.tts.speech.microsoft.com.
function getTtsEndpoint() {
  const endpoint = (process.env.AZURE_SPEECH_ENDPOINT || "").replace(/\/+$/, "");
  const match = endpoint.match(/https?:\/\/(\w+)\./);
  if (match) {
    return `https://${match[1]}.tts.speech.microsoft.com`;
  }
  return endpoint; // fallback: use as-is
}
const AZURE_ENDPOINT = getTtsEndpoint();
const CACHE_DIR = join(process.cwd(), "cache", "tts");

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// Deterministic hash for TTS settings
function ttsHash(settings) {
  const json = JSON.stringify(settings, (key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      for (const k of Object.keys(value).sort()) sorted[k] = value[k];
      return sorted;
    }
    return value;
  });
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

// Cached voice list
let voicesCache = null;

export async function getVoices() {
  if (voicesCache) return voicesCache;

  // Try loading from disk cache
  const diskCache = join(CACHE_DIR, "_voices.json");
  if (existsSync(diskCache)) {
    try {
      voicesCache = JSON.parse(readFileSync(diskCache, "utf-8"));
      return voicesCache;
    } catch {}
  }

  const key = process.env.AZURE_SPEECH_KEY;
  if (!key) throw new Error("AZURE_SPEECH_KEY environment variable is not set");
  if (!AZURE_ENDPOINT) throw new Error("AZURE_SPEECH_ENDPOINT environment variable is not set");

  const res = await fetch(`${AZURE_ENDPOINT}/cognitiveservices/voices/list`, {
    headers: { "Ocp-Apim-Subscription-Key": key },
  });

  if (!res.ok) {
    throw new Error(`Azure voices API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  voicesCache = raw.map((v) => ({
    name: v.ShortName,
    displayName: v.DisplayName,
    locale: v.Locale,
    gender: v.Gender,
    localeName: v.LocaleName,
  }));

  // Cache to disk
  try { writeFileSync(diskCache, JSON.stringify(voicesCache)); } catch {}

  return voicesCache;
}

export async function synthesize({ text, voice, rate, pitch, volume }) {
  const settings = { text, voice, rate: rate || "0%", pitch: pitch || "0%", volume: volume || 1 };
  const hash = ttsHash(settings);
  const cachedPath = join(CACHE_DIR, `${hash}.mp3`);

  if (existsSync(cachedPath)) {
    return { path: cachedPath, cached: true };
  }

  const key = process.env.AZURE_SPEECH_KEY;
  if (!key) throw new Error("AZURE_SPEECH_KEY environment variable is not set");

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${voice}'>
    <prosody rate='${settings.rate}' pitch='${settings.pitch}'>
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`;

  const res = await fetch(`${AZURE_ENDPOINT}/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    },
    body: ssml,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure TTS error: ${res.status} ${res.statusText} — ${body}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachedPath, buffer);

  return { path: cachedPath, cached: false };
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function clearVoicesCache() {
  voicesCache = null;
  const diskCache = join(CACHE_DIR, "_voices.json");
  try { if (existsSync(diskCache)) writeFileSync(diskCache, ""); } catch {}
}
