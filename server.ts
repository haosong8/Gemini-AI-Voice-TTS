import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Directory paths for persistent disk cache
const SAMPLES_DIR = path.resolve(__dirname, 'cache', 'samples');
const GENERATIONS_DIR = path.resolve(__dirname, 'cache', 'generations');
if (!fs.existsSync(SAMPLES_DIR)) fs.mkdirSync(SAMPLES_DIR, { recursive: true });
if (!fs.existsSync(GENERATIONS_DIR)) fs.mkdirSync(GENERATIONS_DIR, { recursive: true });

// Rolling window rate limit tracker (tracks calls in last 60s)
const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 10; // Gemini Flash free tier RPM guard

// Dynamic quota cooldown tracking from upstream Gemini API
let upstreamCooldownUntil = 0;

function getRateLimitStatus() {
  const now = Date.now();
  // Filter out timestamps older than 60s
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 60000) {
    requestTimestamps.shift();
  }
  const isRPMExceeded = requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE;
  const isUpstreamThrottled = upstreamCooldownUntil > now;
  const isLimited = isRPMExceeded || isUpstreamThrottled;

  const oldest = requestTimestamps[0];
  const rpmCooldown = isRPMExceeded && oldest ? Math.max(0, Math.ceil((60000 - (now - oldest)) / 1000)) : 0;
  const upstreamCooldown = isUpstreamThrottled ? Math.max(0, Math.ceil((upstreamCooldownUntil - now) / 1000)) : 0;
  const cooldownRemaining = Math.max(rpmCooldown, upstreamCooldown);
  const resetInSeconds = cooldownRemaining > 0 ? cooldownRemaining : oldest ? Math.max(0, Math.ceil((60000 - (now - oldest)) / 1000)) : 0;

  return {
    requestsInLastMinute: requestTimestamps.length,
    maxRequestsPerMinute: MAX_REQUESTS_PER_MINUTE,
    isRateLimited: isLimited,
    cooldownRemaining,
    resetInSeconds,
    timestamp: now,
  };
}

function setExternalCooldown(seconds: number) {
  const safeSeconds = Math.min(Math.max(seconds, 5), 60);
  upstreamCooldownUntil = Math.max(upstreamCooldownUntil, Date.now() + safeSeconds * 1000);
}

function recordRequestTimestamp() {
  requestTimestamps.push(Date.now());
}

/**
 * Robust Gemini Audio Cleaner
 * 1. Parses RIFF chunks and isolates the audio PCM data chunk
 * 2. Strips out C2PA, JUMB, and watermark metadata that causes loud static burst at the end
 * 3. Applies a 15ms smooth cosine fade-out at the end to prevent DAC click / pop
 * 4. Reconstructs a pristine, standard 44-byte RIFF WAV header
 */
function cleanGeminiAudioBuffer(buffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  let detectedSampleRate = sampleRate;
  let detectedChannels = numChannels;
  let detectedBits = bitsPerSample;
  let pcmData: Buffer | null = null;

  // Case 1: Buffer starts with RIFF/WAVE header
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = Math.min(buffer.length, chunkStart + chunkSize);

      if (chunkId === 'fmt ' && chunkSize >= 16) {
        detectedChannels = buffer.readUInt16LE(chunkStart + 2);
        detectedSampleRate = buffer.readUInt32LE(chunkStart + 4);
        detectedBits = buffer.readUInt16LE(chunkStart + 14);
      } else if (chunkId === 'data') {
        let rawData = buffer.slice(chunkStart, chunkEnd);
        // Handle potential nested RIFF header
        if (rawData.length >= 12 && rawData.toString('ascii', 0, 4) === 'RIFF' && rawData.toString('ascii', 8, 12) === 'WAVE') {
          return cleanGeminiAudioBuffer(rawData, detectedSampleRate, detectedChannels, detectedBits);
        }
        // If C2PA / JUMB metadata was appended inside data chunk
        const c2paIdx = rawData.indexOf('C2PA');
        if (c2paIdx !== -1 && c2paIdx > 1000) {
          rawData = rawData.slice(0, c2paIdx);
        }
        pcmData = rawData;
        break;
      }
      offset += 8 + chunkSize;
      if (chunkSize % 2 === 1) offset++; // RIFF word alignment
    }
  }

  // Case 2: Buffer without RIFF header or fallback
  if (!pcmData) {
    let raw = Buffer.from(buffer);
    const c2paIdx = raw.indexOf('C2PA');
    if (c2paIdx !== -1 && c2paIdx > 1000) {
      raw = raw.slice(0, c2paIdx);
    }
    pcmData = raw;
  }

  // Ensure PCM sample alignment (16-bit = 2 bytes per sample)
  const bytesPerSample = detectedBits / 8;
  const frameSize = detectedChannels * bytesPerSample;
  const validLength = pcmData.length - (pcmData.length % frameSize);
  const cleanPcm = Buffer.from(pcmData.slice(0, validLength));

  // Apply smooth 15ms cosine fade-out at the end to eliminate speaker click / static pop
  const totalSamples = cleanPcm.length / 2;
  const fadeSamples = Math.min(Math.floor(detectedSampleRate * 0.015), totalSamples);
  for (let i = 0; i < fadeSamples; i++) {
    const sampleIdx = (totalSamples - fadeSamples + i) * 2;
    const originalVal = cleanPcm.readInt16LE(sampleIdx);
    const fadeFactor = Math.cos((i / fadeSamples) * (Math.PI / 2));
    cleanPcm.writeInt16LE(Math.round(originalVal * fadeFactor), sampleIdx);
  }

  // Build clean 44-byte standard RIFF/WAVE header
  const byteRate = (detectedSampleRate * detectedChannels * detectedBits) / 8;
  const blockAlign = (detectedChannels * detectedBits) / 8;
  const dataSize = cleanPcm.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(detectedChannels, 22);
  header.writeUInt32LE(detectedSampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(detectedBits, 34);

  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, cleanPcm]);
}

// In-memory audio caches for instantaneous playback
interface CachedAudio {
  audioUrl: string;
  audioBase64: string;
  mimeType: string;
  voice: string;
  style: string;
  model: string;
  duration: number;
  sizeBytes: number;
}
const audioCache = new Map<string, CachedAudio>();
const sampleCache = new Map<string, CachedAudio>();

// Initialize existing disk samples into memory
function loadDiskCache() {
  try {
    if (fs.existsSync(SAMPLES_DIR)) {
      const files = fs.readdirSync(SAMPLES_DIR);
      for (const file of files) {
        if (file.endsWith('.wav')) {
          const rawVoice = file.replace(/\.wav$/i, '');
          const voice = rawVoice.charAt(0).toUpperCase() + rawVoice.slice(1);
          const wavBuffer = fs.readFileSync(path.join(SAMPLES_DIR, file));
          const wavBase64 = wavBuffer.toString('base64');
          const duration = +((wavBuffer.length - 44) / (24000 * 2)).toFixed(2);
          const cachedItem: CachedAudio = {
            audioUrl: `data:audio/wav;base64,${wavBase64}`,
            audioBase64: wavBase64,
            mimeType: 'audio/wav',
            voice,
            style: 'Sample Introduction',
            model: 'gemini-3.8-flash-tts',
            duration,
            sizeBytes: wavBuffer.length,
          };
          sampleCache.set(voice, cachedItem);
          sampleCache.set(voice.toLowerCase(), cachedItem);
          sampleCache.set(`${voice.toLowerCase()}_gemini-3.8-flash-tts`, cachedItem);
          sampleCache.set(`${voice.toLowerCase()}_gemini-3.8-flash-lite-tts`, cachedItem);
        }
      }
    }
  } catch (e) {
    console.warn('Could not read disk cache:', e);
  }
}
loadDiskCache();

// Automatically start background cache warmup on boot after a brief startup delay
setTimeout(() => {
  refreshWarmupStatus();
  if (warmupState.pendingVoices.length > 0 && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    console.log(`Starting automatic background warmup for ${warmupState.pendingVoices.length} remaining voices...`);
    warmupState.isActive = true;
    runWarmupWorker();
  }
}, 3000);

// Health and capabilities check
app.get('/api/health', (_req: Request, res: Response) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({
    status: 'ok',
    hasApiKey: hasKey,
    defaultModel: 'gemini-3.8-flash-tts',
    cachedSamplesCount: Array.from(new Set(Array.from(sampleCache.values()).map((v) => v.voice.toLowerCase()))).length,
    cachedGenerationsCount: audioCache.size,
    rateLimit: getRateLimitStatus(),
  });
});

// Rate limit status endpoint for UI tracking
app.get('/api/tts/ratelimit', (_req: Request, res: Response) => {
  res.json(getRateLimitStatus());
});

// Full voice catalogue of all available Gemini neural voices
const VOICES = [
  { id: 'Kore', name: 'Kore', gender: 'Female / Neutral', tone: 'Clear, balanced, articulate & warm', tag: 'Most Popular', category: 'core', isFeatured: true },
  { id: 'Puck', name: 'Puck', gender: 'Youthful / Upbeat', tone: 'Playful, lively, friendly & dynamic', tag: 'Playful & Lively', category: 'core', isFeatured: true },
  { id: 'Charon', name: 'Charon', gender: 'Deep / Baritone', tone: 'Resonant, steady, authoritative & wise', tag: 'Deep Baritone', category: 'core', isFeatured: true },
  { id: 'Fenrir', name: 'Fenrir', gender: 'Rich / Masculine', tone: 'Commanding, crisp, dramatic & cinematic', tag: 'Cinematic Epic', category: 'core', isFeatured: true },
  { id: 'Zephyr', name: 'Zephyr', gender: 'Soft / Airy', tone: 'Serene, airy, gentle & meditative', tag: 'Gentle & Calming', category: 'core', isFeatured: true },
  { id: 'Aoede', name: 'Aoede', gender: 'Female / Conversational', tone: 'Melodic, warm, engaging & expressive', tag: 'Melodic & Warm', category: 'female', isFeatured: true },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'Female / Elegant', tone: 'Lyrical, refined, poised & poetic', tag: 'Poetic & Refined', category: 'female' },
  { id: 'Despina', name: 'Despina', gender: 'Female / Modern', tone: 'Crisp, contemporary, cheerful & bright', tag: 'Bright & Crisp', category: 'expressive' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'Male / Resonant', tone: 'Deep, imposing, steady & profound', tag: 'Deep Cosmic', category: 'male' },
  { id: 'Erinome', name: 'Erinome', gender: 'Female / Smooth', tone: 'Intimate, thoughtful, velvety & calm', tag: 'Intimate & Calm', category: 'calm' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'Male / Broadcast', tone: 'Authoritative, clear broadcast cadence', tag: 'News Broadcaster', category: 'male' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'Male / Stately', tone: 'Grounded, patient, seasoned & solemn', tag: 'Stately Narrator', category: 'male' },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'Female / Friendly', tone: 'Warm, inviting, gentle & comforting', tag: 'Storyteller', category: 'female' },
  { id: 'Leda', name: 'Leda', gender: 'Female / Professional', tone: 'Articulate, confident, executive & clear', tag: 'Executive Keynote', category: 'female' },
  { id: 'Orus', name: 'Orus', gender: 'Male / Punchy', tone: 'Bold, punchy, dramatic & spirited', tag: 'Bold & Punchy', category: 'expressive' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'Female / Silky', tone: 'Silky, luminous, delicate & refined', tag: 'Silky Luxury', category: 'female' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'Male / Reflective', tone: 'Deep, contemplative, soothing & slow', tag: 'Contemplative', category: 'calm' },
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'Female / Upbeat', tone: 'Bright, cheerful, approachable & crisp', tag: 'Friendly Assistant', category: 'expressive' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'Neutral / Balanced', tone: 'Even-toned, articulate, balanced & neutral', tag: 'Neutral Balanced', category: 'core' },
  { id: 'Schedar', name: 'Schedar', gender: 'Male / Cinematic', tone: 'Grand, dramatic, resonant & epic', tag: 'Trailer Voice', category: 'cinematic' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'Male / Crisp', tone: 'Decisive, clear, energetic & direct', tag: 'Decisive & Direct', category: 'male' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'Neutral / Atmospheric', tone: 'Mysterious, velvety, atmospheric & soft', tag: 'Atmospheric Lore', category: 'calm' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'Female / Pedagogical', tone: 'Knowledgeable, articulate & professorial', tag: 'Professorial & Wise', category: 'female' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'Male / Rich', tone: 'Seasoned, warm, rich & authentic', tag: 'Seasoned Storyteller', category: 'male' },
  { id: 'Achernar', name: 'Achernar', gender: 'Male / Modern', tone: 'Sharp, dynamic, modern & articulate', tag: 'Modern Tech', category: 'male' },
  { id: 'Achird', name: 'Achird', gender: 'Female / Cheerful', tone: 'Warm, breezy, cheerful & welcoming', tag: 'Sunny & Welcoming', category: 'expressive' },
  { id: 'Algenib', name: 'Algenib', gender: 'Male / Assertive', tone: 'Assertive, crisp, confident & strong', tag: 'Confident & Strong', category: 'male' },
  { id: 'Algieba', name: 'Algieba', gender: 'Male / Measured', tone: 'Steady, patient, pedagogical & calm', tag: 'Patient Explainer', category: 'male' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'Female / Animated', tone: 'Spirited, playful, theatrical & whimsical', tag: 'Theatrical & Animated', category: 'expressive' },
];

// Full voice catalogue of all available Gemini neural voices
app.get('/api/tts/voices', (_req: Request, res: Response) => {
  const voices = VOICES;

  const presetStyles = [
    {
      id: 'natural',
      name: 'Natural & Balanced',
      prompt: 'Clear, natural, conversational speaker with pleasant pacing',
      icon: 'sparkles',
    },
    {
      id: 'storyteller',
      name: 'Storyteller',
      prompt: 'Warm, captivating bedtime storyteller with expressive cadence and natural pauses',
      icon: 'book-open',
    },
    {
      id: 'news',
      name: 'News Anchor',
      prompt: 'Professional, articulate broadcast news anchor delivering breaking news',
      icon: 'newspaper',
    },
    {
      id: 'excited',
      name: 'Enthusiastic & Upbeat',
      prompt: 'Excited, bright, high-energy speaker bursting with enthusiasm and smile',
      icon: 'zap',
    },
    {
      id: 'meditative',
      name: 'Calm & Meditative',
      prompt: 'Gentle, soothing, slow-paced mindfulness and meditation guide',
      icon: 'moon',
    },
    {
      id: 'dramatic',
      name: 'Dramatic Movie Trailer',
      prompt: 'Intense, brooding, cinematic narrator with suspenseful pacing',
      icon: 'film',
    },
    {
      id: 'whisper',
      name: 'Whisper / ASMR',
      prompt: 'Soft, intimate, whispered voice with delicate articulation and close-mic presence',
      icon: 'volume-1',
    },
    {
      id: 'executive',
      name: 'Executive & Corporate',
      prompt: 'Polished, confident, authoritative corporate presenter in a keynote',
      icon: 'briefcase',
    },
    {
      id: 'teacher',
      name: 'Teacher / Explainer',
      prompt: 'Friendly, encouraging, patient tutor explaining an intriguing concept to students',
      icon: 'graduation-cap',
    },
  ];

  const cachedVoiceNames = Array.from(
    new Set(Array.from(sampleCache.values()).map((v) => v.voice))
  );

  res.json({ voices, presetStyles, totalVoices: voices.length, cachedVoiceNames });
});

// Dedicated audio download stream endpoint
app.get('/api/tts/download/:name.wav', (req: Request, res: Response) => {
  const name = (req.params.name || '').replace(/\.wav$/i, '');
  const samplePath = path.join(SAMPLES_DIR, `${name.toLowerCase()}.wav`);
  const genPath = path.join(GENERATIONS_DIR, `${name}.wav`);

  let targetPath = '';
  if (fs.existsSync(samplePath)) targetPath = samplePath;
  else if (fs.existsSync(genPath)) targetPath = genPath;

  if (targetPath) {
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="voxcraft-${name}.wav"`);
    return fs.createReadStream(targetPath).pipe(res);
  }

  const inMem = Array.from(sampleCache.values()).concat(Array.from(audioCache.values())).find(
    (c) => c.voice.toLowerCase() === name.toLowerCase()
  );
  if (inMem) {
    const buf = Buffer.from(inMem.audioBase64, 'base64');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="voxcraft-${name}.wav"`);
    return res.end(buf);
  }

  res.status(404).json({ error: 'Audio file not found' });
});

// Unified helper for voice sample retrieval and on-demand synthesis
async function getOrGenerateVoiceSampleAudio(
  rawVoiceName: string,
  requestedModel = 'gemini-3.8-flash-tts'
): Promise<{
  wavBuffer: Buffer;
  wavBase64: string;
  duration: number;
  fromCache: boolean;
  model: string;
  voice: string;
}> {
  const voiceName = (rawVoiceName || 'Kore').replace(/\.wav$/i, '');
  const voiceKey = voiceName.toLowerCase();
  const cacheKey = `${voiceKey}_${requestedModel}`;
  const diskPath = path.join(SAMPLES_DIR, `${voiceKey}.wav`);

  // 1. Instant check in memory cache (0ms)
  const inMem = sampleCache.get(cacheKey) || sampleCache.get(voiceKey);
  if (inMem && inMem.audioBase64) {
    const wavBuffer = Buffer.from(inMem.audioBase64, 'base64');
    return {
      wavBuffer,
      wavBase64: inMem.audioBase64,
      duration: inMem.duration,
      fromCache: true,
      model: inMem.model,
      voice: inMem.voice || voiceName,
    };
  }

  // 2. Instant check in disk cache (< 1ms)
  if (fs.existsSync(diskPath)) {
    const wavBuffer = fs.readFileSync(diskPath);
    const wavBase64 = wavBuffer.toString('base64');
    const estimatedDuration = +((wavBuffer.length - 44) / (24000 * 2)).toFixed(2);
    const result: CachedAudio = {
      audioUrl: `/api/tts/sample/${encodeURIComponent(voiceKey)}.wav`,
      audioBase64: wavBase64,
      mimeType: 'audio/wav',
      voice: voiceName,
      style: 'Sample Introduction',
      model: requestedModel,
      duration: estimatedDuration,
      sizeBytes: wavBuffer.length,
    };
    sampleCache.set(voiceKey, result);
    sampleCache.set(cacheKey, result);
    return {
      wavBuffer,
      wavBase64,
      duration: estimatedDuration,
      fromCache: true,
      model: requestedModel,
      voice: voiceName,
    };
  }

  // 3. Rate limit check before live Gemini API invocation
  const rateLimit = getRateLimitStatus();
  if (rateLimit.isRateLimited) {
    const error: any = new Error(
      `Gemini API free-tier pacing active: ${rateLimit.requestsInLastMinute}/${rateLimit.maxRequestsPerMinute} req/min. Please wait ${rateLimit.cooldownRemaining}s before generating a new sample.`
    );
    error.status = 429;
    error.isRateLimited = true;
    error.cooldownRemaining = rateLimit.cooldownRemaining;
    throw error;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('Gemini API key is not configured in Settings > Secrets.');
  }

  recordRequestTimestamp();

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const sampleText = `Hello, I'm ${voiceName}. Welcome to VoxCraft Studio.`;

  // Try primary model, fall back if 429 quota exhaustion or temporary error
  const modelsToTry =
    requestedModel === 'gemini-3.8-flash-tts'
      ? ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']
      : ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];

  let base64Data: string | null = null;
  let successfulModel = requestedModel;
  let lastError: any = null;

  for (const mod of modelsToTry) {
    try {
      const generatePromise = ai.models.generateContent({
        model: mod,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: sampleText,
                speechMetadata: {
                  style: 'Clear, natural, pleasant voice introduction',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_RATE_LIMIT')), 45000)
      );

      const response = (await Promise.race([generatePromise, timeoutPromise])) as any;
      const part = response?.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        base64Data = part.inlineData.data;
        successfulModel = mod;
        break;
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`Sample call failed on model ${mod}: ${e.message}`);
    }
  }

  if (!base64Data) {
    throw lastError || new Error(`No audio returned from Gemini speech model for ${voiceName}`);
  }

  const rawBuffer = Buffer.from(base64Data, 'base64');
  const wavBuffer = cleanGeminiAudioBuffer(rawBuffer, 24000, 1, 16);
  const wavBase64 = wavBuffer.toString('base64');
  const estimatedDuration = +((wavBuffer.length - 44) / (24000 * 2)).toFixed(2);

  const result: CachedAudio = {
    audioUrl: `/api/tts/sample/${encodeURIComponent(voiceKey)}.wav`,
    audioBase64: wavBase64,
    mimeType: 'audio/wav',
    voice: voiceName,
    style: 'Sample Introduction',
    model: successfulModel,
    duration: estimatedDuration,
    sizeBytes: wavBuffer.length,
  };

  // Save to persistent disk cache and memory cache
  try {
    fs.writeFileSync(diskPath, wavBuffer);
  } catch (e) {
    console.warn('Could not write sample to disk:', e);
  }
  sampleCache.set(voiceKey, result);
  sampleCache.set(cacheKey, result);

  return {
    wavBuffer,
    wavBase64,
    duration: estimatedDuration,
    fromCache: false,
    model: successfulModel,
    voice: voiceName,
  };
}

// Direct WAV audio stream endpoint for ultra-low latency playback (plays or on-demand generates and streams)
app.get('/api/tts/sample/:voiceName.wav', async (req: Request, res: Response) => {
  try {
    const rawVoice = req.params.voiceName || 'Kore';
    const model = (req.query.model as string) || 'gemini-3.8-flash-tts';
    const sample = await getOrGenerateVoiceSampleAudio(rawVoice, model);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Voice-Duration', sample.duration.toString());
    res.setHeader('X-Voice-Cached', sample.fromCache ? 'true' : 'false');
    const rateLimit = getRateLimitStatus();
    res.setHeader('X-RateLimit-Requests', rateLimit.requestsInLastMinute.toString());
    res.setHeader('X-RateLimit-Remaining-Cooldown', rateLimit.cooldownRemaining.toString());

    return res.end(sample.wavBuffer);
  } catch (err: any) {
    console.error(`WAV stream error for ${req.params.voiceName}:`, err?.message);
    const is429 =
      err?.isRateLimited ||
      err?.status === 429 ||
      err?.message?.includes('429') ||
      err?.message?.includes('Quota exceeded') ||
      err?.message?.includes('RESOURCE_EXHAUSTED');

    let cooldownRemaining = err?.cooldownRemaining || 30;
    const retryMatch = err?.message?.match(/Please retry in ([\d.]+)s/i) || err?.message?.match(/"retryDelay":\s*"(\d+)s"/i);
    if (retryMatch && retryMatch[1]) {
      cooldownRemaining = Math.ceil(parseFloat(retryMatch[1]));
    }

    return res.status(is429 ? 429 : 500).json({
      error: is429 ? `Gemini API quota pacing active. Please retry in ${cooldownRemaining}s.` : err?.message || 'Sample audio not found',
      isRateLimited: is429,
      cooldownRemaining: is429 ? cooldownRemaining : 0,
      rateLimit: getRateLimitStatus(),
    });
  }
});

// JSON voice sample preview endpoint (retrieves from cache or generates + returns audio URL & base64)
app.get('/api/tts/sample/:voiceName', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const rawVoice = req.params.voiceName || 'Kore';
    const requestedModel = (req.query.model as string) || 'gemini-3.8-flash-tts';
    const sample = await getOrGenerateVoiceSampleAudio(rawVoice, requestedModel);

    return res.json({
      success: true,
      fromCache: sample.fromCache,
      audioUrl: `/api/tts/sample/${encodeURIComponent(sample.voice.toLowerCase())}.wav`,
      audioBase64: sample.wavBase64,
      voice: sample.voice,
      duration: sample.duration,
      sizeBytes: sample.wavBuffer.length,
      model: sample.model,
      rateLimit: getRateLimitStatus(),
    });
  } catch (err: any) {
    console.error(`Sample JSON error for ${req.params.voiceName}:`, err?.message);
    const is429 =
      err?.isRateLimited ||
      err?.status === 429 ||
      err?.message?.includes('429') ||
      err?.message?.includes('Quota exceeded') ||
      err?.message?.includes('RESOURCE_EXHAUSTED');

    let cooldownRemaining = err?.cooldownRemaining || 30;
    const retryMatch = err?.message?.match(/Please retry in ([\d.]+)s/i) || err?.message?.match(/"retryDelay":\s*"(\d+)s"/i);
    if (retryMatch && retryMatch[1]) {
      cooldownRemaining = Math.ceil(parseFloat(retryMatch[1]));
    }

    return res.status(is429 ? 429 : 500).json({
      error: is429
        ? `Gemini API quota pacing active. Please retry in ${cooldownRemaining}s.`
        : err?.message || 'Failed to generate voice sample',
      isRateLimited: is429,
      cooldownRemaining: is429 ? cooldownRemaining : 0,
      rateLimit: getRateLimitStatus(),
    });
  }
});

// Background Voice Cache Warmup State Tracker
interface WarmupState {
  isActive: boolean;
  totalVoices: number;
  cachedCount: number;
  currentVoice: string | null;
  status: 'idle' | 'running' | 'paused_cooldown' | 'completed' | 'error';
  lastMessage: string;
  cachedVoices: string[];
  pendingVoices: string[];
}

const warmupState: WarmupState = {
  isActive: false,
  totalVoices: VOICES.length,
  cachedCount: 0,
  currentVoice: null,
  status: 'idle',
  lastMessage: 'Ready to warm up cache',
  cachedVoices: [],
  pendingVoices: [],
};

function refreshWarmupStatus() {
  const cachedNames = Array.from(
    new Set(Array.from(sampleCache.values()).map((v) => v.voice))
  );
  warmupState.cachedCount = cachedNames.length;
  warmupState.cachedVoices = cachedNames;
  warmupState.pendingVoices = VOICES.map((v) => v.id).filter((id) => !cachedNames.includes(id));
}

// Background Worker Loop for Pre-warming Voices
let warmupTimer: NodeJS.Timeout | null = null;

async function runWarmupWorker() {
  refreshWarmupStatus();
  if (warmupState.pendingVoices.length === 0) {
    warmupState.isActive = false;
    warmupState.currentVoice = null;
    warmupState.status = 'completed';
    warmupState.lastMessage = `All ${VOICES.length} voices are now cached locally in persistent storage.`;
    return;
  }

  // Rate limit / cooldown inspection
  const rateLimit = getRateLimitStatus();
  if (rateLimit.isRateLimited) {
    warmupState.status = 'paused_cooldown';
    warmupState.lastMessage = `Waiting for API quota window (${rateLimit.cooldownRemaining}s remaining) before warming next voice...`;
    warmupTimer = setTimeout(runWarmupWorker, Math.max(2000, rateLimit.cooldownRemaining * 1000 + 1000));
    return;
  }

  const nextVoice = warmupState.pendingVoices[0];
  warmupState.currentVoice = nextVoice;
  warmupState.status = 'running';
  warmupState.lastMessage = `Synthesizing and caching sample for ${nextVoice}...`;

  try {
    // Generate voice sample using Flash-Lite TTS for speed and high throughput
    await getOrGenerateVoiceSampleAudio(nextVoice, 'gemini-3.8-flash-lite-tts');
    refreshWarmupStatus();
    warmupState.lastMessage = `Successfully cached ${nextVoice}. (${warmupState.cachedCount}/${VOICES.length} cached)`;

    // Paced delay to respect RPM
    if (warmupState.isActive && warmupState.pendingVoices.length > 0) {
      warmupTimer = setTimeout(runWarmupWorker, 7500); // ~8 requests per minute
    } else {
      warmupState.isActive = false;
      warmupState.currentVoice = null;
      warmupState.status = 'completed';
      warmupState.lastMessage = `All ${VOICES.length} voices are cached!`;
    }
  } catch (err: any) {
    console.warn(`Warmup for ${nextVoice} encountered notice:`, err?.message);
    const isDailyLimit =
      err?.message?.includes('GenerateRequestsPerDayPerProjectPerModel-FreeTier') ||
      err?.message?.includes('limit: 10') ||
      (err?.message?.includes('retry in') && (err?.message?.includes('h') || err?.message?.includes('m')));

    const retryMatch =
      err?.message?.match(/Please retry in ([\d.]+)s/i) ||
      err?.message?.match(/"retryDelay":\s*"(\d+)s"/i);

    if (isDailyLimit) {
      // Free-tier Daily RPD limit has been reached for today on this API key
      const hoursMatch = err?.message?.match(/retry in (\d+h\d+m|\d+h|\d+m)/i);
      const remainingTime = hoursMatch ? hoursMatch[1] : 'tomorrow';
      warmupState.isActive = false;
      warmupState.status = 'paused_cooldown';
      warmupState.lastMessage = `Gemini Free Tier daily quota reached (10 requests/day). The ${warmupState.cachedCount} cached voices remain available at 0ms. Warmup will resume when quota resets in ${remainingTime}.`;
      return;
    }

    const waitSec = retryMatch && retryMatch[1] ? Math.ceil(parseFloat(retryMatch[1])) : 25;
    setExternalCooldown(waitSec);
    warmupState.status = 'paused_cooldown';
    warmupState.lastMessage = `Paced warmup paused: Gemini free-tier pacing (${waitSec}s). Will resume automatically.`;

    if (warmupState.isActive) {
      warmupTimer = setTimeout(runWarmupWorker, (waitSec + 2) * 1000);
    }
  }
}

// Warmup control endpoint
app.post('/api/tts/warmup', (req: Request, res: Response) => {
  const { action = 'start' } = req.body || {};

  if (action === 'start') {
    if (!warmupState.isActive) {
      warmupState.isActive = true;
      if (warmupTimer) clearTimeout(warmupTimer);
      runWarmupWorker();
    }
  } else if (action === 'pause' || action === 'stop') {
    warmupState.isActive = false;
    warmupState.status = 'idle';
    if (warmupTimer) clearTimeout(warmupTimer);
    warmupState.lastMessage = 'Background cache warmup paused by user.';
  }

  refreshWarmupStatus();
  return res.json({
    success: true,
    warmupState,
  });
});

// Warmup status polling endpoint
app.get('/api/tts/warmup', (_req: Request, res: Response) => {
  refreshWarmupStatus();
  return res.json(warmupState);
});

// Single-speaker TTS generation (with persistent disk & memory caching + rate limit guard)
app.post('/api/tts/generate', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { text, voiceName = 'Kore', style = '', model = 'gemini-3.8-flash-lite-tts' } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text content is required' });
    }

    const selectedModel = model === 'gemini-3.8-flash-tts' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
    const cacheKey = `${voiceName.toLowerCase()}__${selectedModel}__${style.trim().toLowerCase()}__${text.trim().toLowerCase()}`;
    const hash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 24);
    const diskPath = path.join(GENERATIONS_DIR, `${hash}.wav`);

    // 1. Instant replay from memory cache
    if (audioCache.has(cacheKey)) {
      const cached = audioCache.get(cacheKey)!;
      return res.json({ success: true, fromCache: true, rateLimit: getRateLimitStatus(), ...cached });
    }

    // 2. Instant replay from persistent disk cache
    if (fs.existsSync(diskPath)) {
      const wavBuffer = fs.readFileSync(diskPath);
      const wavBase64 = wavBuffer.toString('base64');
      const audioDataUrl = `data:audio/wav;base64,${wavBase64}`;
      const estimatedDuration = +((wavBuffer.length - 44) / (24000 * 2)).toFixed(2);
      const result: CachedAudio = {
        audioUrl: audioDataUrl,
        audioBase64: wavBase64,
        mimeType: 'audio/wav',
        voice: voiceName,
        style: style || 'Default',
        model: selectedModel,
        duration: estimatedDuration,
        sizeBytes: wavBuffer.length,
      };
      audioCache.set(cacheKey, result);
      return res.json({ success: true, fromCache: true, rateLimit: getRateLimitStatus(), ...result });
    }

    // 3. Check rate limit
    const rateLimit = getRateLimitStatus();
    if (rateLimit.isRateLimited) {
      return res.status(429).json({
        error: `Rate limit pacing active: ${rateLimit.requestsInLastMinute}/${rateLimit.maxRequestsPerMinute} req/min. Please wait ${rateLimit.cooldownRemaining}s before next generation.`,
        isRateLimited: true,
        cooldownRemaining: rateLimit.cooldownRemaining,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is configured in Settings > Secrets.',
      });
    }

    recordRequestTimestamp();

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: any[] = [
      {
        text: text.trim(),
        speechMetadata: style && style.trim() ? { style: style.trim() } : undefined,
      },
    ];

    const modelsToTry = selectedModel === 'gemini-3.8-flash-tts'
      ? ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']
      : ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];

    let base64Data: string | null = null;
    let successfulModel = selectedModel;
    let lastError: any = null;

    for (const mod of modelsToTry) {
      try {
        const generatePromise = ai.models.generateContent({
          model: mod,
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        // Generous timeout for long scripts (e.g. 500+ words can take ~30s on audio models)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_RATE_LIMIT')), 75000)
        );

        const response = (await Promise.race([generatePromise, timeoutPromise])) as any;
        const part = response?.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData?.data) {
          base64Data = part.inlineData.data;
          successfulModel = mod;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Generation attempt failed on model ${mod}: ${err.message}`);
        // If upstream tells us to wait, record it
        const retryMatch = err?.message?.match(/Please retry in ([\d.]+)s/i) || err?.message?.match(/"retryDelay":\s*"(\d+)s"/i);
        if (retryMatch && retryMatch[1]) {
          setExternalCooldown(Math.ceil(parseFloat(retryMatch[1])));
        }
      }
    }

    if (!base64Data) {
      throw lastError || new Error('No audio returned from Gemini speech model');
    }

    // Convert raw PCM to proper standard WAV header (cleaning C2PA metadata and static)
    const rawBuffer = Buffer.from(base64Data, 'base64');
    const wavBuffer = cleanGeminiAudioBuffer(rawBuffer, 24000, 1, 16);
    const wavBase64 = wavBuffer.toString('base64');
    const audioDataUrl = `data:audio/wav;base64,${wavBase64}`;

    // Calculate duration (24000 samples/sec * 2 bytes/sample)
    const estimatedDuration = +((wavBuffer.length - 44) / (24000 * 2)).toFixed(2);

    const result: CachedAudio = {
      audioUrl: audioDataUrl,
      audioBase64: wavBase64,
      mimeType: 'audio/wav',
      voice: voiceName,
      style: style || 'Default',
      model: successfulModel,
      duration: estimatedDuration,
      sizeBytes: wavBuffer.length,
    };

    // Store in disk cache and memory cache
    try {
      fs.writeFileSync(diskPath, wavBuffer);
    } catch (e) {
      console.warn('Could not write generation to disk:', e);
    }
    audioCache.set(cacheKey, result);

    // Also store short introductory text in sampleCache
    if (text.trim().length <= 30) {
      sampleCache.set(`${voiceName.toLowerCase()}_${selectedModel}`, result);
      try {
        fs.writeFileSync(path.join(SAMPLES_DIR, `${voiceName.toLowerCase()}.wav`), wavBuffer);
      } catch (e) {
        // ignore
      }
    }

    res.json({
      success: true,
      fromCache: false,
      rateLimit: getRateLimitStatus(),
      ...result,
    });
  } catch (err: any) {
    console.error('TTS generation error:', err);
    const is429 =
      err?.message?.includes('429') ||
      err?.status === 429 ||
      err?.message?.includes('Quota exceeded') ||
      err?.message?.includes('RESOURCE_EXHAUSTED');

    const is503 =
      err?.status === 503 ||
      err?.message?.includes('503') ||
      err?.message?.includes('UNAVAILABLE') ||
      err?.message?.includes('overloaded') ||
      err?.message?.includes('high demand');

    let cooldownRemaining = 25;
    const retryMatch =
      err?.message?.match(/Please retry in ([\d.]+)s/i) ||
      err?.message?.match(/"retryDelay":\s*"(\d+)s"/i);
    if (retryMatch && retryMatch[1]) {
      cooldownRemaining = Math.ceil(parseFloat(retryMatch[1]));
      setExternalCooldown(cooldownRemaining);
    }

    if (is429) {
      return res.status(429).json({
        error: `Gemini API quota pacing active. Please retry in ${cooldownRemaining}s, or switch to "Browser Speech" tab to listen immediately with zero limits.`,
        isRateLimited: true,
        cooldownRemaining,
        rateLimit: getRateLimitStatus(),
      });
    }

    if (is503) {
      return res.status(503).json({
        error: 'The Gemini audio API is currently experiencing momentary high traffic. Please retry in a few seconds, or switch to the "Browser Speech" tab for instant playback.',
        isRateLimited: false,
        cooldownRemaining: 5,
        rateLimit: getRateLimitStatus(),
      });
    }

    res.status(500).json({
      error: err?.message || 'Failed to generate speech. Please check your text or try another voice.',
      isRateLimited: false,
      cooldownRemaining: 0,
      rateLimit: getRateLimitStatus(),
    });
  }
});

// Dual-speaker dialogue generation using gemini-3.8-flash-tts
app.post('/api/tts/generate-dialogue', async (req: Request, res: Response) => {
  try {
    const {
      turns, // Array of { speaker: string, text: string, style?: string }
      speakerA = { name: 'Alex', voice: 'Puck' },
      speakerB = { name: 'Sam', voice: 'Kore' },
    } = req.body;

    if (!Array.isArray(turns) || turns.length === 0) {
      return res.status(400).json({ error: 'Dialogue turns array is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is configured in Settings > Secrets.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts = turns.map((turn) => {
      const isSpeakerA = turn.speaker === speakerA.name;
      const speakerName = isSpeakerA ? speakerA.name : speakerB.name;
      return {
        text: `${speakerName}: ${turn.text}`,
        speechMetadata: {
          speaker: speakerName,
          style: turn.style || (isSpeakerA ? 'Lively and engaging podcast host' : 'Thoughtful and inquisitive co-host'),
        },
      };
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: speakerA.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: speakerA.voice },
                },
              },
              {
                speaker: speakerB.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: speakerB.voice },
                },
              },
            ],
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const base64Data = part?.inlineData?.data;

    if (!base64Data) {
      return res.status(502).json({ error: 'No audio returned from Gemini speech model for dialogue' });
    }

    const rawBuffer = Buffer.from(base64Data, 'base64');
    const wavBuffer = cleanGeminiAudioBuffer(rawBuffer, 24000, 1, 16);
    const wavBase64 = wavBuffer.toString('base64');
    const audioDataUrl = `data:audio/wav;base64,${wavBase64}`;
    const estimatedDuration = +((wavBuffer.length - 44) / (24000 * 2)).toFixed(2);

    res.json({
      success: true,
      audioUrl: audioDataUrl,
      audioBase64: wavBase64,
      mimeType: 'audio/wav',
      model: 'gemini-3.8-flash-tts',
      duration: estimatedDuration,
      sizeBytes: wavBuffer.length,
      turnsCount: turns.length,
      rateLimit: getRateLimitStatus(),
    });
  } catch (err: any) {
    console.error('Dialogue TTS error:', err);
    res.status(500).json({
      error: err?.message || 'Failed to generate dialogue speech.',
    });
  }
});

// Explicit API 404 handler to prevent SPA fallback from returning index.html for API calls
app.all('/api/*', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(404).json({ error: 'API route not found' });
});

// Explicit JSON error handler to guarantee API errors never return HTML
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Express server error:', err);
  res.setHeader('Content-Type', 'application/json');
  res.status(err.status || 500).json({
    error: err?.message || 'Internal server error',
  });
});

// Setup dev server middlewares or static production serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxCraft server running on http://0.0.0.0:${PORT} [${isProd ? 'production' : 'development'}]`);
  });
}

startServer();
