import React, { useState, useEffect, useRef } from 'react';
import {
  EngineMode,
  GeneratedSpeechItem,
  PresetStyle,
  VisualizerMode,
  VoiceOption,
  DialogueTurn,
} from './types';
import {
  GEMINI_VOICES,
  PRESET_STYLES,
  SAMPLE_TEXTS,
} from './utils/audio';
import { Header } from './components/Header';
import { VoiceSelector, WarmupStatusInfo } from './components/VoiceSelector';
import { StyleSelector } from './components/StyleSelector';
import { Visualizer } from './components/Visualizer';
import { AudioPlayer } from './components/AudioPlayer';
import { BrowserSpeechEngine } from './components/BrowserSpeechEngine';
import { DialogueStudio } from './components/DialogueStudio';
import { HistoryDrawer } from './components/HistoryDrawer';
import { RateLimitModal } from './components/RateLimitModal';
import { safeFetchJson } from './utils/apiSafe';
import { downloadAudioFile } from './utils/audioDownloader';
import {
  Sparkles,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Lightbulb,
  Clock,
  Download,
  ShieldCheck,
  Zap,
  Globe,
} from 'lucide-react';

interface RateLimitInfo {
  requestsInLastMinute: number;
  maxRequestsPerMinute: number;
  isRateLimited: boolean;
  cooldownRemaining: number;
  resetInSeconds?: number;
}

export default function App() {
  const [currentMode, setCurrentMode] = useState<EngineMode>('gemini');
  const [text, setText] = useState<string>(
    'Welcome to VoxCraft Studio! You can type any text here, choose from our neural voices, and hear it brought to life with natural human intonation and emotion.',
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('Kore');
  const [selectedStyle, setSelectedStyle] = useState<PresetStyle>(PRESET_STYLES[0]);
  const [customStylePrompt, setCustomStylePrompt] = useState<string>('');
  const [isCustomActive, setIsCustomActive] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash-tts');
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>('bars');
  const [cachedVoiceIds, setCachedVoiceIds] = useState<Set<string>>(new Set());
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatusInfo | null>(null);

  // Concurrency & Rate limit guard
  const [isGeneratingSampleId, setIsGeneratingSampleId] = useState<string | null>(null);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitInfo>({
    requestsInLastMinute: 0,
    maxRequestsPerMinute: 3,
    isRateLimited: false,
    cooldownRemaining: 0,
    resetInSeconds: 0,
  });

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSpeech, setCurrentSpeech] = useState<GeneratedSpeechItem | null>(null);
  const [historyItems, setHistoryItems] = useState<GeneratedSpeechItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isRateLimitModalOpen, setIsRateLimitModalOpen] = useState<boolean>(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [isDownloadingCurrent, setIsDownloadingCurrent] = useState<boolean>(false);

  // Audio player synchronization
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasCopiedText, setHasCopiedText] = useState<boolean>(false);

  // Hidden audio element for voice sample previews
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleCacheRef = useRef<Record<string, string>>({});

  const fetchRateLimitStatus = async () => {
    const res = await safeFetchJson<RateLimitInfo>('/api/tts/ratelimit');
    if (res.ok && res.data) {
      setRateLimitStatus((prev) => {
        if (
          prev.requestsInLastMinute === res.data!.requestsInLastMinute &&
          prev.maxRequestsPerMinute === res.data!.maxRequestsPerMinute &&
          prev.isRateLimited === res.data!.isRateLimited &&
          prev.cooldownRemaining === res.data!.cooldownRemaining
        ) {
          return prev;
        }
        return res.data!;
      });
    }
  };

  const fetchWarmupStatus = async () => {
    const res = await safeFetchJson<WarmupStatusInfo>('/api/tts/warmup');
    if (res.ok && res.data) {
      setWarmupStatus(res.data);
      if (res.data.cachedVoices && res.data.cachedVoices.length > 0) {
        setCachedVoiceIds((prev) => {
          const next = new Set(prev);
          res.data!.cachedVoices.forEach((v) => next.add(v));
          return next;
        });
      }
    }
  };

  const handleToggleWarmup = async () => {
    const nextAction = warmupStatus?.isActive ? 'pause' : 'start';
    const res = await safeFetchJson<{ warmupState: WarmupStatusInfo }>('/api/tts/warmup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: nextAction }),
    });
    if (res.ok && res.data?.warmupState) {
      setWarmupStatus(res.data.warmupState);
      if (res.data.warmupState.cachedVoices) {
        setCachedVoiceIds((prev) => {
          const next = new Set(prev);
          res.data!.warmupState.cachedVoices.forEach((v) => next.add(v));
          return next;
        });
      }
    }
  };

  // Periodic polling: sync rate limits and background warmup progress smoothly
  useEffect(() => {
    fetchRateLimitStatus();
    fetchWarmupStatus();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRateLimitStatus();
        fetchWarmupStatus();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Cooldown countdown timer: updates second-by-second ONLY when cooldown is actively positive
  useEffect(() => {
    if (!rateLimitStatus.isRateLimited || rateLimitStatus.cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setRateLimitStatus((prev) => {
        if (!prev.isRateLimited || prev.cooldownRemaining <= 0) {
          return prev;
        }
        const nextRemaining = prev.cooldownRemaining - 1;
        return {
          ...prev,
          cooldownRemaining: nextRemaining,
          isRateLimited: nextRemaining > 0,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimitStatus.isRateLimited, rateLimitStatus.cooldownRemaining]);

  // Load history & persistent sample cache on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('voxcraft_history');
      if (stored) {
        setHistoryItems(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Could not read history from localStorage:', e);
    }

    // Load voices manifest to know which are cached on server
    const loadCachedManifest = async () => {
      const res = await safeFetchJson<{ cachedVoiceNames?: string[] }>('/api/tts/voices');
      const cached = new Set<string>();

      // From server disk/memory cache
      if (res.ok && res.data?.cachedVoiceNames) {
        res.data.cachedVoiceNames.forEach((name) => {
          cached.add(name);
          sampleCacheRef.current[name] = `/api/tts/sample/${encodeURIComponent(name.toLowerCase())}.wav`;
        });
      }

      // From client localStorage
      GEMINI_VOICES.forEach((voice) => {
        try {
          const stored = localStorage.getItem(`voxcraft_sample_${voice.id}`);
          if (stored) {
            sampleCacheRef.current[voice.id] = stored;
            cached.add(voice.id);
          }
        } catch (e) {
          // ignore
        }
      });

      if (cached.size > 0) {
        setCachedVoiceIds(cached);
      }
    };

    loadCachedManifest();
    fetchRateLimitStatus();
  }, []);

  // Save history to localStorage
  const saveHistory = (items: GeneratedSpeechItem[]) => {
    setHistoryItems(items);
    try {
      localStorage.setItem('voxcraft_history', JSON.stringify(items.slice(0, 25)));
    } catch (e) {
      console.warn('Could not save history to localStorage:', e);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to generate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (currentMode === 'gemini') {
          handleGenerateSpeech();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, selectedVoiceId, selectedStyle, customStylePrompt, isCustomActive, selectedModel, currentMode, rateLimitStatus.isRateLimited]);

  // Authentic Gemini Neural Voice Preview
  const handlePreviewVoice = (voice: VoiceOption) => {
    // 1. If currently playing this sample, toggle stop
    if (previewingVoiceId === voice.id) {
      handleStopPreview();
      return;
    }

    const isCached = cachedVoiceIds.has(voice.id);

    // 2. Concurrency lock: don't allow clicking another sample while one processes
    if (isGeneratingSampleId || isGenerating) {
      return;
    }

    // 3. Rate limit check for uncached samples
    if (!isCached && rateLimitStatus.isRateLimited) {
      setError(
        `Gemini free-tier pacing active. Please wait ${rateLimitStatus.cooldownRemaining}s before generating new voice samples, or click any voice marked "Cached" to play immediately.`
      );
      return;
    }

    setError(null);

    // Stop any existing playback
    handleStopPreview();

    // 4. Direct WAV streaming URL (unified endpoint handles cached playback and on-demand generation seamlessly)
    const audioUrl = `/api/tts/sample/${encodeURIComponent(voice.id.toLowerCase())}.wav?model=${encodeURIComponent(selectedModel)}`;

    let audio = previewAudioRef.current;
    if (!audio) {
      audio = new Audio();
      previewAudioRef.current = audio;
    }

    setPreviewingVoiceId(voice.id);
    if (!isCached) {
      setIsGeneratingSampleId(voice.id);
    }

    // Attach event callbacks
    audio.onplaying = () => {
      setIsGeneratingSampleId(null);
      setCachedVoiceIds((prev) => new Set([...prev, voice.id]));
      fetchRateLimitStatus();
    };

    audio.onended = () => {
      setPreviewingVoiceId(null);
      setIsGeneratingSampleId(null);
    };

    audio.onerror = () => {
      setPreviewingVoiceId(null);
      setIsGeneratingSampleId(null);
      fetchRateLimitStatus();
      setError(`Could not stream sample for ${voice.name}. Please check rate limit or try again.`);
    };

    // Set source and play immediately within the user gesture context!
    audio.src = audioUrl;
    audio.play().catch((err) => {
      console.warn('Playback notice:', err);
    });
  };

  // Stop any active preview
  const handleStopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewingVoiceId(null);
    setIsGeneratingSampleId(null);
  };

  // Main Speech Generation with Gemini Neural
  const handleGenerateSpeech = async () => {
    if (!text.trim()) {
      setError('Please enter some text to speak aloud.');
      return;
    }

    if (rateLimitStatus.isRateLimited) {
      setError(`Gemini API pacing active. Please wait ${rateLimitStatus.cooldownRemaining}s before generating.`);
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);

      const styleString = isCustomActive
        ? customStylePrompt.trim()
        : selectedStyle.prompt;

      const res = await safeFetchJson<any>('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voiceName: selectedVoiceId,
          style: styleString,
          model: selectedModel,
        }),
      });

      if (res.isRateLimited || res.status === 429) {
        setRateLimitStatus((prev) => ({
          ...prev,
          isRateLimited: true,
          cooldownRemaining: res.cooldownRemaining || 25,
        }));
        setError(res.error || `Gemini free-tier rate limit active (3-10 req/min). Cooldown: ${res.cooldownRemaining || 25}s.`);
        return;
      }

      if (!res.ok || !res.data?.audioUrl) {
        throw new Error(res.error || 'TTS generation failed.');
      }

      const data = res.data;
      if (data.rateLimit) {
        setRateLimitStatus(data.rateLimit);
      }

      const newItem: GeneratedSpeechItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        text: text.trim(),
        voiceName: selectedVoiceId,
        style: isCustomActive ? (customStylePrompt || 'Custom Prompt') : selectedStyle.name,
        audioUrl: data.audioUrl,
        duration: data.duration || 0,
        sizeBytes: data.sizeBytes || 0,
        model: data.model || selectedModel,
      };

      setCurrentSpeech(newItem);
      saveHistory([newItem, ...historyItems.filter((i) => i.id !== newItem.id)]);
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err?.message || 'Failed to generate speech. Please check your text or rate limits.');
    } finally {
      setIsGenerating(false);
      fetchRateLimitStatus();
    }
  };

  // Dialogue Generation Handler
  const handleGenerateDialogue = async (
    turns: DialogueTurn[],
    speakerA: { name: string; voice: string },
    speakerB: { name: string; voice: string },
  ) => {
    try {
      setIsGenerating(true);
      setError(null);

      const res = await safeFetchJson<any>('/api/tts/generate-dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns,
          speakerA,
          speakerB,
        }),
      });

      if (res.isRateLimited || res.status === 429) {
        setRateLimitStatus((prev) => ({
          ...prev,
          isRateLimited: true,
          cooldownRemaining: res.cooldownRemaining || 25,
        }));
        setError(res.error || `Gemini free-tier rate limit active. Cooldown: ${res.cooldownRemaining || 25}s.`);
        return;
      }

      if (!res.ok || !res.data?.audioUrl) {
        throw new Error(res.error || 'Dialogue generation failed.');
      }

      const data = res.data;
      if (data.rateLimit) {
        setRateLimitStatus(data.rateLimit);
      }
      const scriptSummary = turns.map((t) => `${t.speaker}: ${t.text}`).join(' | ');

      const newItem: GeneratedSpeechItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        text: scriptSummary,
        voiceName: `${speakerA.name} (${speakerA.voice}) & ${speakerB.name} (${speakerB.voice})`,
        style: 'Dual-Speaker Dialogue',
        audioUrl: data.audioUrl,
        duration: data.duration || 0,
        sizeBytes: data.sizeBytes || 0,
        model: 'gemini-3.8-flash-tts',
        isDialogue: true,
      };

      setCurrentSpeech(newItem);
      saveHistory([newItem, ...historyItems]);
    } catch (err: any) {
      console.error('Dialogue error:', err);
      setError(err?.message || 'Failed to generate dialogue conversation.');
    } finally {
      setIsGenerating(false);
      fetchRateLimitStatus();
    }
  };

  // Download the currently rendered audio
  const handleDownloadCurrentSpeech = async () => {
    if (!currentSpeech) return;
    try {
      setIsDownloadingCurrent(true);
      await downloadAudioFile({
        audioUrl: currentSpeech.audioUrl,
        voiceName: currentSpeech.voiceName,
        style: currentSpeech.style,
      });
    } finally {
      setIsDownloadingCurrent(false);
    }
  };

  const handleApplySample = (sample: (typeof SAMPLE_TEXTS)[0]) => {
    setText(sample.text);
    setSelectedVoiceId(sample.recommendedVoice);
    const styleObj = PRESET_STYLES.find((s) => s.id === sample.recommendedStyle);
    if (styleObj) {
      setSelectedStyle(styleObj);
      setIsCustomActive(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(text);
    setHasCopiedText(true);
    setTimeout(() => setHasCopiedText(false), 2000);
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Hidden audio for authentic Gemini voice previews */}
      <audio ref={previewAudioRef} className="hidden" />

      {/* Top Header */}
      <Header
        currentMode={currentMode}
        onSelectMode={setCurrentMode}
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={historyItems.length}
        rateLimitStatus={rateLimitStatus}
        onOpenRateLimitInfo={() => setIsRateLimitModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error notification banner */}
        {error && (
          <div className="bg-red-950/80 border border-red-500/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-200 text-xs shadow-xl animate-in fade-in duration-200">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-red-100 mb-0.5">Synthesis Alert</span>
                <p className="leading-relaxed">{error}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => {
                  setCurrentMode('browser');
                  setError(null);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-md active:scale-95"
                title="Use instant local browser speech with zero rate limits"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Use Browser Engine</span>
              </button>
              <button
                type="button"
                onClick={() => setError(null)}
                className="px-2.5 py-1.5 rounded-xl bg-red-900/50 hover:bg-red-800/50 text-red-300 hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Audio Visualizer & Player Section */}
        <section className="space-y-4">
          <Visualizer
            audioElement={audioElement}
            isPlaying={isPlaying}
            mode={visualizerMode}
            onModeChange={setVisualizerMode}
          />

          {currentSpeech && (
            <AudioPlayer
              audioUrl={currentSpeech.audioUrl}
              voiceName={currentSpeech.voiceName}
              style={currentSpeech.style}
              model={currentSpeech.model}
              duration={currentSpeech.duration}
              sizeBytes={currentSpeech.sizeBytes}
              onAudioElementChange={setAudioElement}
              onPlayingChange={setIsPlaying}
            />
          )}
        </section>

        {/* MODE 1: GEMINI NEURAL AI STUDIO */}
        {currentMode === 'gemini' && (
          <div className="space-y-6">
            {/* Step 1: Voice Persona Selector (29 Authentic Gemini Voices with Concurrency Lock & Rate Limit Tracker) */}
            <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl">
              <VoiceSelector
                voices={GEMINI_VOICES}
                selectedVoiceId={selectedVoiceId}
                onSelectVoice={setSelectedVoiceId}
                onPreviewVoice={handlePreviewVoice}
                onStopPreview={handleStopPreview}
                isPreviewingId={previewingVoiceId}
                isGeneratingSampleId={isGeneratingSampleId}
                isProcessingAnySample={Boolean(isGeneratingSampleId || isGenerating)}
                rateLimitStatus={rateLimitStatus}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                cachedVoiceIds={cachedVoiceIds}
                warmupStatus={warmupStatus}
                onToggleWarmup={handleToggleWarmup}
              />
            </section>

            {/* Step 2: Voice Style & Emotion Selector */}
            <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl">
              <StyleSelector
                presetStyles={PRESET_STYLES}
                selectedStyleId={selectedStyle.id}
                onSelectStyle={(style) => {
                  setSelectedStyle(style);
                  setIsCustomActive(false);
                }}
                customStylePrompt={customStylePrompt}
                onCustomStyleChange={setCustomStylePrompt}
                isCustomActive={isCustomActive}
                onToggleCustom={setIsCustomActive}
              />
            </section>

            {/* Step 3: Text Input & Generation Deck */}
            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                    3. Script & Text Input
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    ({wordCount} words / {charCount} chars)
                  </span>
                </div>

                {/* Actions: Download Audio, Copy, Clear */}
                <div className="flex items-center space-x-2">
                  {currentSpeech && (
                    <button
                      type="button"
                      onClick={handleDownloadCurrentSpeech}
                      disabled={isDownloadingCurrent}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-700/20 transition-all active:scale-95"
                      title="Download the currently generated audio as .WAV"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isDownloadingCurrent ? 'Downloading...' : 'Download Audio (.WAV)'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-medium transition-colors"
                    title="Copy text"
                  >
                    {hasCopiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedText ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setText('')}
                    disabled={!text}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-red-400 text-xs font-medium transition-colors disabled:opacity-30"
                    title="Clear text"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste the words you want to convert into speech..."
                  rows={5}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
                />
              </div>

              {/* Sample Prompts Tray */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span>Try a curated sample:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_TEXTS.map((sample) => (
                    <button
                      key={sample.title}
                      type="button"
                      onClick={() => handleApplySample(sample)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-all shadow-sm group"
                    >
                      <span>{sample.icon}</span>
                      <span className="font-medium">{sample.title}</span>
                      <span className="text-[10px] text-slate-500 group-hover:text-slate-400 font-mono">
                        ({sample.recommendedVoice})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary Studio Generation Button with Rate Limit Notice & Cooldown Countdown */}
              <div className="pt-3 space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateSpeech}
                    disabled={isGenerating || !text.trim() || rateLimitStatus.isRateLimited}
                    className="flex-1 relative group overflow-hidden rounded-2xl p-px font-semibold shadow-2xl shadow-indigo-600/25 transition-all hover:scale-[1.006] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 group-hover:opacity-100 transition-opacity" />
                    <div className="relative px-6 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center space-x-3 text-white text-base">
                      {isGenerating ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Synthesizing Studio Speech with Gemini...</span>
                        </>
                      ) : rateLimitStatus.isRateLimited ? (
                        <>
                          <Clock className="w-5 h-5 text-amber-300 animate-pulse" />
                          <span>Rate Limit Pacing Active ({rateLimitStatus.cooldownRemaining}s remaining)...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          <span>Render Studio Speech with {selectedVoiceId}</span>
                          <span className="text-xs opacity-75 font-normal ml-2 hidden sm:inline">
                            (Ctrl + Enter)
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* Immediate Download Button next to Render */}
                  {currentSpeech && (
                    <button
                      type="button"
                      onClick={handleDownloadCurrentSpeech}
                      disabled={isDownloadingCurrent}
                      className="sm:w-auto px-5 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-md active:scale-95"
                      title="Download the currently rendered audio file as a standard WAV file"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Download .WAV</span>
                    </button>
                  )}
                </div>

                {/* Rate limit status card */}
                {rateLimitStatus.isRateLimited ? (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between text-xs text-amber-300 animate-pulse">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Rate limit pacing active: <strong>{rateLimitStatus.cooldownRemaining}s</strong> cooldown remaining before next API render.
                      </span>
                    </div>
                    <span className="text-[11px] text-amber-400/80 bg-amber-900/50 px-2 py-0.5 rounded-lg border border-amber-700/50">
                      Cached audio replays at 0ms
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Rate limit safe: {rateLimitStatus.requestsInLastMinute}/{rateLimitStatus.maxRequestsPerMinute} req/min used</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-indigo-400" />
                      <span>Previously rendered text is cached for instant replay</span>
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* MODE 2: DIALOGUE STUDIO */}
        {currentMode === 'dialogue' && (
          <DialogueStudio
            voices={GEMINI_VOICES}
            onGenerateDialogue={handleGenerateDialogue}
            isGenerating={isGenerating}
          />
        )}

        {/* MODE 3: BROWSER NATIVE SPEECH ENGINE */}
        {currentMode === 'browser' && (
          <BrowserSpeechEngine text={text} onTextChange={setText} />
        )}
      </main>

      {/* History Slide-out Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        items={historyItems}
        onPlayItem={(item: GeneratedSpeechItem) => {
          setCurrentSpeech(item);
          setIsHistoryOpen(false);
        }}
        onLoadText={(loadedText: string, voiceName: string, _style: string) => {
          setText(loadedText);
          if (voiceName) setSelectedVoiceId(voiceName);
          setIsHistoryOpen(false);
        }}
        onDeleteItem={(id) => saveHistory(historyItems.filter((i) => i.id !== id))}
        onClearAll={() => saveHistory([])}
      />
      {/* Rate Limit & Pacing Info Modal */}
      <RateLimitModal
        isOpen={isRateLimitModalOpen}
        onClose={() => setIsRateLimitModalOpen(false)}
        rateLimitStatus={rateLimitStatus}
        cachedVoicesCount={cachedVoiceIds.size}
      />
    </div>
  );
}
