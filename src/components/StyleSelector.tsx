import React, { useState } from 'react';
import { PresetStyle } from '../types';
import {
  Sparkles,
  BookOpen,
  Newspaper,
  Zap,
  Moon,
  Film,
  Volume1,
  Briefcase,
  GraduationCap,
  Radio,
  Sliders,
  Wand2,
} from 'lucide-react';

interface StyleSelectorProps {
  presetStyles: PresetStyle[];
  selectedStyleId: string;
  onSelectStyle: (style: PresetStyle) => void;
  customStylePrompt: string;
  onCustomStyleChange: (prompt: string) => void;
  isCustomActive: boolean;
  onToggleCustom: (active: boolean) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4" />,
  BookOpen: <BookOpen className="w-4 h-4" />,
  Newspaper: <Newspaper className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  Moon: <Moon className="w-4 h-4" />,
  Film: <Film className="w-4 h-4" />,
  Volume1: <Volume1 className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  GraduationCap: <GraduationCap className="w-4 h-4" />,
  Radio: <Radio className="w-4 h-4" />,
};

export const StyleSelector: React.FC<StyleSelectorProps> = ({
  presetStyles,
  selectedStyleId,
  onSelectStyle,
  customStylePrompt,
  onCustomStyleChange,
  isCustomActive,
  onToggleCustom,
}) => {
  const [quickPills] = useState([
    'Energetic sports caster',
    'Whispering secretively',
    'Pirate captain',
    'Sarcastic robot',
    'Warm grandfather',
    'Dramatic thriller narrator',
  ]);

  return (
    <div className="space-y-3">
      {/* Header and custom toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            2. Choose Voice Style & Emotion
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {isCustomActive ? '(Custom Persona Prompt)' : '(Curated Styles)'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onToggleCustom(!isCustomActive)}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium border transition-all ${
            isCustomActive
              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 shadow-sm'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{isCustomActive ? 'Use Presets' : 'Custom Style Prompt'}</span>
        </button>
      </div>

      {/* Preset pills grid if not custom */}
      {!isCustomActive ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {presetStyles.map((style) => {
            const isSelected = selectedStyleId === style.id;
            return (
              <button
                type="button"
                key={style.id}
                onClick={() => onSelectStyle(style)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-start space-x-2.5 group ${
                  isSelected
                    ? 'bg-indigo-950/70 border-indigo-500/80 shadow-md shadow-indigo-600/15 ring-1 ring-indigo-500/40 text-slate-100'
                    : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg transition-colors ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  {ICON_MAP[style.iconName] || <Sparkles className="w-4 h-4" />}
                </div>
                <div className="overflow-hidden">
                  <div className="font-medium text-xs truncate">{style.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{style.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Custom prompt input box */
        <div className="bg-slate-950/80 border border-purple-500/40 rounded-2xl p-3.5 space-y-2.5 shadow-inner">
          <div className="flex items-center space-x-2 text-xs text-purple-300 font-medium">
            <Wand2 className="w-4 h-4 text-purple-400" />
            <span>Describe the exact voice style, mood, emotion, or persona:</span>
          </div>

          <textarea
            value={customStylePrompt}
            onChange={(e) => onCustomStyleChange(e.target.value)}
            placeholder="e.g. Warm, nostalgic storyteller by the fireplace with a soft chuckle in their voice, gentle cadence..."
            rows={2}
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          />

          {/* Quick inspiration ideas */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-500 mr-1">Inspirations:</span>
            {quickPills.map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => onCustomStyleChange(pill)}
                className="px-2 py-0.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                + {pill}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
