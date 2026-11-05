import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  Volume2,
  VolumeX,
  Repeat,
  Sparkles,
  Check,
  Copy,
} from 'lucide-react';
import { formatFileSize, formatTime } from '../utils/audio';
import { downloadAudioFile } from '../utils/audioDownloader';

interface AudioPlayerProps {
  audioUrl: string;
  voiceName: string;
  style: string;
  model: string;
  duration?: number;
  sizeBytes?: number;
  onAudioElementChange?: (element: HTMLAudioElement | null) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  onSaveBookmark?: () => void;
  isBookmarked?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  voiceName,
  style,
  model,
  duration = 0,
  sizeBytes = 0,
  onAudioElementChange,
  onPlayingChange,
  onSaveBookmark,
  isBookmarked = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      onAudioElementChange?.(audioRef.current);
    }
  }, [audioUrl, onAudioElementChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      if (!isLooping) {
        setIsPlaying(false);
        onPlayingChange?.(false);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayingChange?.(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPlayingChange?.(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    // Auto-play when new audio is generated
    audio.play().catch(() => {
      // Browser autoplay restriction
      setIsPlaying(false);
      onPlayingChange?.(false);
    });

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [audioUrl, isLooping, onPlayingChange]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(console.error);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audio.muted = newMuted;
  };

  const cyclePlaybackRate = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleLoop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    audio.loop = newLoop;
  };

  const handleDownload = () => {
    downloadAudioFile({
      audioUrl,
      voiceName,
      style,
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(audioUrl);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Header with specs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-slate-100 text-base">{voiceName}</h3>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {model === 'gemini-3.8-flash-tts' ? 'Studio Flagship' : 'Neural 24kHz'}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-xs md:max-w-md">
              Style: <span className="text-slate-300 italic">{style || 'Natural'}</span>
            </p>
          </div>
        </div>

        {/* Action badges: Download, Copy, Bookmark */}
        <div className="flex items-center space-x-2">
          {onSaveBookmark && (
            <button
              onClick={onSaveBookmark}
              className={`p-2 rounded-xl text-xs font-medium border transition-all ${
                isBookmarked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700'
              }`}
              title="Save to favorites"
            >
              ★
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium transition-all"
            title="Copy Audio Data URI"
          >
            {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{hasCopied ? 'Copied' : 'Data URI'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs shadow-md shadow-indigo-600/20 transition-all active:scale-95"
            title="Download high-fidelity WAV file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .WAV</span>
            {sizeBytes > 0 && <span className="opacity-75 text-[10px]">({formatFileSize(sizeBytes)})</span>}
          </button>
        </div>
      </div>

      {/* Scrub Bar */}
      <div className="space-y-1 mb-4">
        <div className="relative group cursor-pointer">
          {/* Background track */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-75 relative"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 rounded-full animate-pulse" />
            </div>
          </div>
          {/* Range input for scrubbing */}
          <input
            type="range"
            min={0}
            max={totalDuration || 1}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Seek audio timeline"
          />
        </div>

        {/* Time stamps */}
        <div className="flex justify-between items-center text-xs text-slate-400 font-mono pt-1">
          <span>{formatTime(currentTime)}</span>
          <span className="text-[11px] text-slate-500">
            {totalDuration > 0 ? formatTime(totalDuration) : '--:--'}
          </span>
        </div>
      </div>

      {/* Main Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-slate-800/60">
        <div className="flex items-center space-x-3">
          {/* Restart */}
          <button
            onClick={handleRestart}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            title="Restart from beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Primary Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Loop toggle */}
          <button
            onClick={toggleLoop}
            className={`p-2 rounded-xl transition-colors ${
              isLooping ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title={isLooping ? 'Looping enabled' : 'Enable loop'}
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Speed Selector */}
          <button
            onClick={cyclePlaybackRate}
            className="px-2.5 py-1 rounded-xl text-xs font-mono font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-colors"
            title="Playback speed"
          >
            {playbackRate}x
          </button>
        </div>

        {/* Volume controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMute}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 md:w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            aria-label="Volume slider"
          />
        </div>
      </div>
    </div>
  );
};
