import React, { useState, useMemo } from 'react';
import { VoiceOption, VoiceCategoryFilter } from '../types';
import {
  Volume2,
  Sparkles,
  Check,
  Flame,
  Search,
  Info,
  X,
  Zap,
  Square,
  Loader2,
  ShieldCheck,
  Clock,
  DownloadCloud,
  Play,
  Pause,
} from 'lucide-react';

export interface WarmupStatusInfo {
  isActive: boolean;
  totalVoices: number;
  cachedCount: number;
  currentVoice: string | null;
  status: 'idle' | 'running' | 'paused_cooldown' | 'completed' | 'error';
  lastMessage: string;
  cachedVoices: string[];
  pendingVoices: string[];
}

interface VoiceSelectorProps {
  voices: VoiceOption[];
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string) => void;
  onPreviewVoice: (voice: VoiceOption) => void;
  onStopPreview: () => void;
  isPreviewingId?: string | null;
  isGeneratingSampleId?: string | null;
  isProcessingAnySample?: boolean;
  rateLimitStatus?: {
    requestsInLastMinute: number;
    maxRequestsPerMinute: number;
    isRateLimited: boolean;
    cooldownRemaining: number;
    resetInSeconds?: number;
  };
  selectedModel: string;
  onSelectModel: (model: string) => void;
  cachedVoiceIds?: Set<string>;
  warmupStatus?: WarmupStatusInfo | null;
  onToggleWarmup?: () => void;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  voices,
  selectedVoiceId,
  onSelectVoice,
  onPreviewVoice,
  onStopPreview,
  isPreviewingId,
  isGeneratingSampleId,
  isProcessingAnySample = false,
  rateLimitStatus,
  selectedModel,
  onSelectModel,
  cachedVoiceIds = new Set(),
  warmupStatus,
  onToggleWarmup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<VoiceCategoryFilter>('all');
  const [isAccountInfoOpen, setIsAccountInfoOpen] = useState(false);

  // Filter voices based on category and search query
  const filteredVoices = useMemo(() => {
    return voices.filter((voice) => {
      // Category match
      let matchesCategory = true;
      if (selectedCategory === 'featured') {
        matchesCategory = Boolean(voice.isFeatured);
      } else if (selectedCategory === 'female') {
        matchesCategory = voice.gender.toLowerCase().includes('female');
      } else if (selectedCategory === 'male') {
        matchesCategory = voice.gender.toLowerCase().includes('male');
      } else if (selectedCategory === 'expressive') {
        matchesCategory = voice.category === 'expressive' || voice.tag.toLowerCase().includes('lively');
      } else if (selectedCategory === 'calm') {
        matchesCategory = voice.category === 'calm' || voice.tag.toLowerCase().includes('calm');
      }

      // Search query match
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        matchesSearch =
          voice.name.toLowerCase().includes(query) ||
          voice.tone.toLowerCase().includes(query) ||
          voice.description.toLowerCase().includes(query) ||
          voice.tag.toLowerCase().includes(query) ||
          voice.gender.toLowerCase().includes(query);
      }

      return matchesCategory && matchesSearch;
    });
  }, [voices, selectedCategory, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80">
        {/* Title and Account Voices Badge */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-100 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>1. Voice Persona</span>
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 font-mono">
            {voices.length} Available in Account
          </span>

          {/* Rate Limit Guard & Pacing Tracker */}
          {rateLimitStatus && (
            <div
              className={`flex items-center space-x-1.5 text-[11px] px-2.5 py-0.5 rounded-full border transition-all ${
                rateLimitStatus.isRateLimited
                  ? 'bg-amber-950/80 border-amber-500/50 text-amber-300 animate-pulse'
                  : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              }`}
              title="Monitors calls to protect your project against Gemini free-tier rate limits"
            >
              <Clock className="w-3 h-3" />
              <span>
                {rateLimitStatus.isRateLimited
                  ? `Cooldown: ${rateLimitStatus.cooldownRemaining}s (Pacing)`
                  : `Pacing: ${rateLimitStatus.requestsInLastMinute}/${rateLimitStatus.maxRequestsPerMinute} req/min`}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsAccountInfoOpen(true)}
            className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-indigo-300 bg-slate-800/70 hover:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/60 transition-colors"
            title="View details about voices included with your account"
          >
            <Info className="w-3 h-3 text-indigo-400" />
            <span>Account Voice Details</span>
          </button>

          {/* Background Cache Warmup Button */}
          {onToggleWarmup && (
            <button
              type="button"
              onClick={onToggleWarmup}
              className={`flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all shadow-sm ${
                warmupStatus?.isActive
                  ? 'bg-amber-950/80 border-amber-500/60 text-amber-200 animate-pulse'
                  : cachedVoiceIds.size >= voices.length
                  ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                  : 'bg-indigo-950/70 hover:bg-indigo-900 border-indigo-700/60 text-indigo-200'
              }`}
              title="Cache all 29 voice samples in the background so auditions play instantly without API delays"
            >
              {warmupStatus?.isActive ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>
                    Caching All ({warmupStatus.cachedCount}/{voices.length})...
                  </span>
                </>
              ) : cachedVoiceIds.size >= voices.length ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>All {voices.length} Voices Cached (100%)</span>
                </>
              ) : (
                <>
                  <DownloadCloud className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    Pre-warm All Voices ({cachedVoiceIds.size}/{voices.length})
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right Controls: Model Switch */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => onSelectModel('gemini-3.8-flash-lite-tts')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                selectedModel === 'gemini-3.8-flash-lite-tts'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Fast low-latency neural TTS (recommended for general text)"
            >
              Flash-Lite TTS
            </button>
            <button
              type="button"
              onClick={() => onSelectModel('gemini-3.8-flash-tts')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                selectedModel === 'gemini-3.8-flash-tts'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Studio Flagship model with expressive voice design"
            >
              <Flame className="w-3 h-3 text-pink-300 mr-0.5" />
              <span>Flash Flagship</span>
            </button>
          </div>
        </div>
      </div>

      {/* Background Cache Warmup Progress Banner */}
      {warmupStatus?.isActive && (
        <div className="bg-indigo-950/60 border border-indigo-500/40 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-indigo-200">
          <div className="flex items-center space-x-2.5">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <div>
              <span className="font-semibold text-white">
                Background Voice Cache Warmup Active ({warmupStatus.cachedCount}/{voices.length} Cached)
              </span>
              <p className="text-[11px] text-indigo-300/80 mt-0.5">
                {warmupStatus.lastMessage}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Progress bar */}
            <div className="w-24 sm:w-32 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/60">
              <div
                className="bg-gradient-to-r from-indigo-500 to-pink-500 h-full transition-all duration-300"
                style={{
                  width: `${Math.round((warmupStatus.cachedCount / voices.length) * 100)}%`,
                }}
              />
            </div>
            <span className="text-[11px] font-mono font-medium text-indigo-300">
              {Math.round((warmupStatus.cachedCount / voices.length) * 100)}%
            </span>
            {onToggleWarmup && (
              <button
                type="button"
                onClick={onToggleWarmup}
                className="ml-2 px-2 py-0.5 rounded-lg bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 text-[11px] font-medium border border-indigo-700/50"
              >
                Pause
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Voices ({voices.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('featured')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'featured'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            ★ Featured ({voices.filter((v) => v.isFeatured).length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('female')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'female'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Female ({voices.filter((v) => v.gender.toLowerCase().includes('female')).length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('male')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'male'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Male / Deep ({voices.filter((v) => v.gender.toLowerCase().includes('male')).length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('expressive')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'expressive'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Lively & Playful
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('calm')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'calm'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Calm & Story
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search 29 voices..."
            className="w-full pl-8 pr-7 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Voice Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 max-h-[460px] overflow-y-auto pr-1">
        {filteredVoices.map((voice) => {
          const isSelected = voice.id === selectedVoiceId;
          const isPreviewing = isPreviewingId === voice.id;
          const isGenerating = isGeneratingSampleId === voice.id;
          const isCached = cachedVoiceIds.has(voice.id);
          // Concurrency lock: disable other uncached sample buttons while one is generating
          const isLockedByOther = isProcessingAnySample && !isGenerating && !isCached;
          const isRateLimitedLocked = Boolean(rateLimitStatus?.isRateLimited && !isCached && !isGenerating);
          const isButtonDisabled = isLockedByOther || isRateLimitedLocked;

          return (
            <div
              key={voice.id}
              onClick={() => onSelectVoice(voice.id)}
              className={`relative group rounded-2xl p-3 border transition-all cursor-pointer flex flex-col justify-between text-left select-none ${
                isSelected
                  ? 'bg-slate-900/95 border-indigo-500 shadow-lg shadow-indigo-500/15 ring-2 ring-indigo-500/30'
                  : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Top row: Avatar, Name & Check / Tag */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-8 h-8 rounded-xl bg-gradient-to-br ${voice.avatarColor} flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0`}
                    >
                      {voice.name[0]}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-semibold text-slate-100 text-sm flex items-center space-x-1 truncate">
                        <span>{voice.name}</span>
                        {voice.isFeatured && (
                          <span className="text-[10px] text-amber-400 font-normal ml-0.5" title="Core featured voice">
                            ★
                          </span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 inline ml-1 shrink-0" />}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate">{voice.gender}</p>
                    </div>
                  </div>
                </div>

                {/* Tone tag */}
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/60 truncate max-w-full inline-block">
                    {voice.tag}
                  </span>
                  {isCached && (
                    <span
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 shrink-0 flex items-center gap-1"
                      title="Audio cached permanently (0ms replay)"
                    >
                      <Zap className="w-2.5 h-2.5" />
                      <span>Cached</span>
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {voice.description}
                </p>
              </div>

              {/* Bottom preview button */}
              <div className="pt-2.5 mt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[80px]">
                  {voice.tone.split(',')[0]}
                </span>

                <button
                  type="button"
                  disabled={isButtonDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isPreviewing) {
                      onStopPreview();
                    } else {
                      onPreviewVoice(voice);
                    }
                  }}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    isPreviewing
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/30'
                      : isGenerating
                      ? 'bg-indigo-900/70 text-indigo-200 border border-indigo-500/50 animate-pulse'
                      : isCached
                      ? 'bg-indigo-950/80 text-indigo-300 hover:bg-indigo-900/80 border border-indigo-800/50'
                      : isButtonDisabled
                      ? 'bg-slate-900/40 text-slate-600 border border-slate-900 cursor-not-allowed'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title={
                    isGenerating
                      ? 'Generating genuine Gemini voice sample...'
                      : isLockedByOther
                      ? 'Waiting for current audio sample to finish...'
                      : isRateLimitedLocked
                      ? `Gemini free tier pacing active (${rateLimitStatus?.cooldownRemaining}s cooldown)`
                      : isPreviewing
                      ? 'Click to stop sample'
                      : isCached
                      ? `Play cached Gemini sample for ${voice.name} (0ms)`
                      : `Generate and audition Gemini sample for ${voice.name}`
                  }
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />
                      <span>Generating...</span>
                    </>
                  ) : isPreviewing ? (
                    <>
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>Stop</span>
                    </>
                  ) : isRateLimitedLocked ? (
                    <>
                      <Clock className="w-3 h-3 text-amber-500/70" />
                      <span>{rateLimitStatus?.cooldownRemaining}s</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3 h-3" />
                      <span>{isCached ? 'Play Sample' : 'Sample'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filteredVoices.length === 0 && (
          <div className="col-span-full py-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800/60">
            <p className="text-slate-400 text-sm">No voices match "{searchQuery}"</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-2 text-xs text-indigo-400 hover:underline"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Account Voices Details Modal */}
      {isAccountInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-slate-100 text-base">Voices Included With Your Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountInfoOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <h4 className="font-semibold text-indigo-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>29 Prebuilt Gemini Neural Voices</span>
                </h4>
                <p className="text-slate-400">
                  Your Gemini API account includes <strong>all 29 prebuilt celestial neural voices</strong> (`Kore`, `Puck`, `Charon`, `Fenrir`, `Zephyr`, `Aoede`, `Despina`, `Enceladus`, etc.) with zero per-voice unlock fees. They are all unlocked in this selector.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <h4 className="font-semibold text-purple-300 mb-1 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Voice Persona & Style Direction</span>
                </h4>
                <p className="text-slate-400">
                  Using <code>gemini-3.8-flash-tts</code>, you are not limited to fixed tones. You can direct each voice using natural language prompts (e.g. <em>"Whispering bedtime story"</em>, <em>"Energetic sports announcer"</em>, <em>"Posh British documentary"</em>) or add pauses and vocal bursts (<code>&lt;laugh&gt;</code>, <code>&lt;gasp&gt;</code>).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <h4 className="font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Permanent Audio Caching & Safe Pacing</span>
                </h4>
                <p className="text-slate-400">
                  All audio samples generated with Gemini are automatically saved to permanent cache. Once cached, clicking <strong>Play Sample</strong> is instant (0ms latency, zero API calls). A rate-limit guard enforces one request at a time to prevent quota collisions on free tier keys.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAccountInfoOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-xs transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
