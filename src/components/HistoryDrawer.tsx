import React from 'react';
import { GeneratedSpeechItem } from '../types';
import { Play, Download, Trash2, Clock, RotateCcw, X, Volume2, Sparkles } from 'lucide-react';
import { formatFileSize, formatTime } from '../utils/audio';
import { downloadAudioFile } from '../utils/audioDownloader';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: GeneratedSpeechItem[];
  onPlayItem: (item: GeneratedSpeechItem) => void;
  onLoadText: (text: string, voiceName: string, style: string) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  activePlayingId?: string | null;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onPlayItem,
  onLoadText,
  onDeleteItem,
  onClearAll,
  activePlayingId,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-slate-100 text-base">Generation History</h3>
            <span className="text-xs text-slate-400 font-mono">({items.length})</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
          {items.length === 0 ? (
            <div className="text-center py-16 text-slate-500 space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm">No speech clips generated yet.</p>
              <p className="text-xs text-slate-600">Type some text and hit Generate!</p>
            </div>
          ) : (
            items.map((item) => {
              const isPlaying = activePlayingId === item.id;
              const dateStr = new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isPlaying
                      ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/30'
                      : 'bg-slate-950/70 border-slate-800/80 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-slate-200">{item.voiceName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                        {item.style || 'Natural'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{dateStr}</span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3">
                    "{item.text}"
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onPlayItem(item)}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          isPlaying
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {isPlaying ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlaying ? 'Playing' : 'Play'}</span>
                        <span className="text-[10px] opacity-75">({formatTime(item.duration)})</span>
                      </button>

                      <button
                        onClick={() => onLoadText(item.text, item.voiceName, item.style)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Load into Editor"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() =>
                          downloadAudioFile({
                            audioUrl: item.audioUrl,
                            voiceName: item.voiceName,
                            style: item.style,
                          })
                        }
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                        title={`Download WAV (${formatFileSize(item.sizeBytes)})`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                        title="Delete from history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-500">Stored locally in your browser</span>
            <button
              onClick={onClearAll}
              className="text-red-400 hover:text-red-300 text-xs font-medium hover:underline transition-all"
            >
              Clear All History
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
