import React from 'react';
import { X, Clock, ShieldCheck, Zap, HardDrive, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface RateLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  rateLimitStatus: {
    requestsInLastMinute: number;
    maxRequestsPerMinute: number;
    isRateLimited: boolean;
    cooldownRemaining: number;
    resetInSeconds?: number;
  };
  cachedVoicesCount: number;
}

export const RateLimitModal: React.FC<RateLimitModalProps> = ({
  isOpen,
  onClose,
  rateLimitStatus,
  cachedVoicesCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 overflow-hidden relative">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none -ml-10 -mb-10" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">Gemini API Rate Limit & Pacing</h3>
              <p className="text-[11px] text-slate-400">Quota protection and performance overview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Live Pacing Status Card */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            rateLimitStatus.isRateLimited
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              : 'bg-slate-950/70 border-slate-800 text-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[10px] text-slate-400">
              Current Rolling Pacing (Last 60s)
            </span>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                rateLimitStatus.isRateLimited
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {rateLimitStatus.isRateLimited ? 'Cooldown Active' : 'Normal / Ready'}
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono">
              {rateLimitStatus.requestsInLastMinute}
            </span>
            <span className="text-xs text-slate-400">
              / {rateLimitStatus.maxRequestsPerMinute} requests per minute
            </span>
          </div>

          {rateLimitStatus.isRateLimited ? (
            <div className="mt-2.5 pt-2.5 border-t border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Cooldown timer active</span>
              </span>
              <span className="font-mono font-bold text-sm bg-amber-900/60 px-2 py-0.5 rounded-lg border border-amber-700/60">
                {rateLimitStatus.cooldownRemaining}s
              </span>
            </div>
          ) : rateLimitStatus.requestsInLastMinute > 0 && rateLimitStatus.resetInSeconds ? (
            <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Window reset in progress:</span>
              </span>
              <span className="font-mono text-emerald-400 font-semibold">
                Oldest call expires in {rateLimitStatus.resetInSeconds}s
              </span>
            </div>
          ) : null}
        </div>

        {/* Key Features & Architecture Cards */}
        <div className="space-y-2.5 text-xs text-slate-300">
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-200 text-xs">Instant 0ms Audio Caching</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Every generated audio and voice sample is saved persistently in memory and on disk. When you replay or re-generate identical text, it returns in 0ms with <strong>0 API calls used</strong>!
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-200 text-xs">Concurrency Lock & Rate Limiting</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Prevents accidental double-clicks or rapid parallel calls from triggering Google API 429 quota exhaustion. Un-cached sample buttons lock while one is in flight.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <HardDrive className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-200 text-xs">Pre-Warmed Authentic Voices</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Core featured voices ({cachedVoicesCount} currently cached) are pre-rendered with genuine Gemini Neural audio and ready for instant playback anytime.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Gemini 3.8 Flash Neural Speech</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
