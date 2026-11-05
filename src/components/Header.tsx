import React from 'react';
import { EngineMode } from '../types';
import { Sparkles, Users, Globe, Clock, Radio, Activity } from 'lucide-react';

interface HeaderProps {
  currentMode: EngineMode;
  onSelectMode: (mode: EngineMode) => void;
  onOpenHistory: () => void;
  historyCount: number;
  rateLimitStatus?: {
    requestsInLastMinute: number;
    maxRequestsPerMinute: number;
    isRateLimited: boolean;
    cooldownRemaining: number;
    resetInSeconds?: number;
  };
  onOpenRateLimitInfo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentMode,
  onSelectMode,
  onOpenHistory,
  historyCount,
  rateLimitStatus,
  onOpenRateLimitInfo,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo and title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-extrabold text-base md:text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
                VoxCraft
              </h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                AI Studio
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Lifelike Speech Synthesis & Voice Stylization
            </p>
          </div>
        </div>

        {/* Engine mode switcher */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-2xl border border-slate-800/80 shadow-inner">
          <button
            type="button"
            onClick={() => onSelectMode('gemini')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentMode === 'gemini'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
            <span>Gemini Neural</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('dialogue')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentMode === 'dialogue'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-pink-200" />
            <span className="hidden md:inline">Dialogue Studio</span>
            <span className="md:hidden">Dialogue</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('browser')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentMode === 'browser'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-200" />
            <span className="hidden md:inline">Browser Native</span>
            <span className="md:hidden">Browser</span>
          </button>
        </div>

        {/* Right side: Rate limit status, 24kHz badge, History button */}
        <div className="flex items-center space-x-2.5">
          {rateLimitStatus && (
            <button
              type="button"
              onClick={onOpenRateLimitInfo}
              className={`hidden sm:flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-xl border transition-all ${
                rateLimitStatus.isRateLimited
                  ? 'bg-amber-950/70 border-amber-500/50 text-amber-300 animate-pulse'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
              title="View Gemini API Rate Limit & Pacing details"
            >
              <Clock className={`w-3 h-3 ${rateLimitStatus.isRateLimited ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span>
                {rateLimitStatus.isRateLimited
                  ? `Cooldown: ${rateLimitStatus.cooldownRemaining}s`
                  : `Pacing: ${rateLimitStatus.requestsInLastMinute}/${rateLimitStatus.maxRequestsPerMinute} req/m`}
              </span>
            </button>
          )}

          <div className="hidden xl:flex items-center space-x-1.5 text-[11px] text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded-xl border border-slate-800">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>24kHz Studio</span>
          </div>

          <button
            type="button"
            onClick={onOpenHistory}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium transition-all"
            title="View generated clips history"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">History</span>
            {historyCount > 0 && (
              <span className="px-1.5 py-0.2 bg-indigo-600 text-white text-[10px] rounded-full font-mono font-semibold">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
