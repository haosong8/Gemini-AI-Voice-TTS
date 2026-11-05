import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Square, Volume2, Sliders, Globe, Sparkles } from 'lucide-react';

interface BrowserSpeechEngineProps {
  text: string;
  onTextChange: (newText: string) => void;
}

export const BrowserSpeechEngine: React.FC<BrowserSpeechEngineProps> = ({
  text,
  onTextChange,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [volume, setVolume] = useState<number>(1);
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [highlightWordIndex, setHighlightWordIndex] = useState<number | null>(null);

  const words = React.useMemo(() => {
    return text.split(/(\s+)/);
  }, [text]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        if (availableVoices.length > 0 && !selectedVoiceURI) {
          // Default to first English voice or first voice
          const defaultVoice = availableVoices.find(
            (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.default),
          ) || availableVoices[0];
          setSelectedVoiceURI(defaultVoice.voiceURI);
        }
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    window.speechSynthesis.cancel();

    if (!text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const chosenVoice = voices.find((v) => v.voiceURI === selectedVoiceURI);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    utterance.onstart = () => {
      setSpeaking(true);
      setPaused(false);
      setHighlightWordIndex(0);
    };

    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      setHighlightWordIndex(null);
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setSpeaking(false);
      setPaused(false);
      setHighlightWordIndex(null);
    };

    // Track word boundaries
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const charIndex = event.charIndex;
        // Find which word corresponds to charIndex
        let currentLen = 0;
        for (let i = 0; i < words.length; i++) {
          const wordLen = words[i].length;
          if (charIndex >= currentLen && charIndex < currentLen + wordLen) {
            setHighlightWordIndex(i);
            break;
          }
          currentLen += wordLen;
        }
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handlePauseResume = () => {
    if (!('speechSynthesis' in window)) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const handleStop = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setHighlightWordIndex(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Title & Info */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Browser Native Speech Engine</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Offline & Zero Latency
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {voices.length} system voices detected
          </span>
        </div>

        {/* Voice Selector Dropdown */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center space-x-1.5">
            <span>System Voice:</span>
          </label>
          <select
            value={selectedVoiceURI}
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}) {v.default ? '— Default' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Sliders: Rate, Pitch, Volume */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {/* Rate */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>Speed: {rate}x</span>
              <span className="text-[10px] text-slate-500">(0.5x - 2x)</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Pitch */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>Pitch: {pitch}</span>
              <span className="text-[10px] text-slate-500">(0.5 - 2.0)</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Volume */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>Volume: {Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!speaking ? (
            <button
              onClick={handleSpeak}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Speak Instantly</span>
            </button>
          ) : (
            <>
              <button
                onClick={handlePauseResume}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all"
              >
                {paused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                <span>{paused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                onClick={handleStop}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-medium text-xs transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop</span>
              </button>
            </>
          )}

          {speaking && (
            <div className="flex items-center space-x-2 text-xs text-emerald-400 font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Speaking with word synchronization...</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-time word highlight preview */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium text-slate-300">Live Word Teleprompter</span>
          <span className="text-[11px] text-slate-500">Highlighted in real-time as words are spoken</span>
        </div>
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 min-h-[100px] text-sm leading-relaxed font-sans text-slate-300">
          {words.map((chunk, idx) => {
            const isHighlighted = highlightWordIndex === idx;
            return (
              <span
                key={idx}
                className={`transition-colors duration-100 ${
                  isHighlighted
                    ? 'bg-emerald-500 text-slate-950 font-bold px-1 rounded shadow-sm'
                    : ''
                }`}
              >
                {chunk}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
