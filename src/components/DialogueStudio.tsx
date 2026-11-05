import React, { useState } from 'react';
import { DialogueTurn, VoiceOption } from '../types';
import { Users, Plus, Trash2, Sparkles, MessageSquare, Play, Flame } from 'lucide-react';

interface DialogueStudioProps {
  voices: VoiceOption[];
  onGenerateDialogue: (
    turns: DialogueTurn[],
    speakerA: { name: string; voice: string },
    speakerB: { name: string; voice: string },
  ) => void;
  isGenerating: boolean;
}

export const DialogueStudio: React.FC<DialogueStudioProps> = ({
  voices,
  onGenerateDialogue,
  isGenerating,
}) => {
  const [speakerA, setSpeakerA] = useState({ name: 'Alex', voice: 'Puck' });
  const [speakerB, setSpeakerB] = useState({ name: 'Sam', voice: 'Kore' });

  const [turns, setTurns] = useState<DialogueTurn[]>([
    {
      id: '1',
      speaker: 'Alex',
      text: 'Welcome back to the studio! <breath> Today we are diving into generative speech synthesis.',
      style: 'Enthusiastic podcast host',
    },
    {
      id: '2',
      speaker: 'Sam',
      text: "That's right, |yeah| it has been a huge week for speech models and natural inflections.",
      style: 'Curious, articulate co-host',
    },
    {
      id: '3',
      speaker: 'Alex',
      text: 'Have you heard how realistic the emotional bursts sound? <laugh> It feels almost uncanny!',
      style: 'Chuckling warmly with excitement',
    },
    {
      id: '4',
      speaker: 'Sam',
      text: "Totally. |mhm| Even subtle breath pauses make the conversation feel completely human.",
      style: 'Impressed and engaged',
    },
  ]);

  const addTurn = (speaker: string) => {
    const newTurn: DialogueTurn = {
      id: Date.now().toString(),
      speaker,
      text: '',
      style: speaker === speakerA.name ? 'Engaging and conversational' : 'Thoughtful and friendly',
    };
    setTurns([...turns, newTurn]);
  };

  const removeTurn = (id: string) => {
    if (turns.length <= 1) return;
    setTurns(turns.filter((t) => t.id !== id));
  };

  const updateTurnText = (id: string, text: string) => {
    setTurns(turns.map((t) => (t.id === id ? { ...t, text } : t)));
  };

  const updateTurnSpeaker = (id: string, speaker: string) => {
    setTurns(turns.map((t) => (t.id === id ? { ...t, speaker } : t)));
  };

  const insertTag = (id: string, tag: string) => {
    setTurns(
      turns.map((t) => {
        if (t.id === id) {
          return { ...t, text: `${t.text} ${tag}`.trim() };
        }
        return t;
      }),
    );
  };

  const loadSampleSciFi = () => {
    setSpeakerA({ name: 'Captain', voice: 'Fenrir' });
    setSpeakerB({ name: 'Navigator', voice: 'Zephyr' });
    setTurns([
      {
        id: '10',
        speaker: 'Captain',
        text: 'Report status on the jump drive. Did we clear the gravitational pull?',
        style: 'Urgent, commanding starship captain',
      },
      {
        id: '11',
        speaker: 'Navigator',
        text: 'Barely, sir. <breath> The quantum core stabilized just three seconds before collapse.',
        style: 'Relieved, breathless sci-fi officer',
      },
      {
        id: '12',
        speaker: 'Captain',
        text: 'Well done. |yeah| Plot a return vector immediately.',
        style: 'Decisive and resolute',
      },
    ]);
  };

  const handleGenerate = () => {
    const validTurns = turns.filter((t) => t.text.trim().length > 0);
    if (validTurns.length === 0) return;
    onGenerateDialogue(validTurns, speakerA, speakerB);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-slate-100 text-sm">Dialogue & Podcast Studio</h3>
                <span className="flex items-center space-x-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  <Flame className="w-3 h-3 text-pink-400" />
                  <span>Powered by Gemini 3.8 Flash TTS</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Compose natural back-and-forth conversations with scripted vocal bursts and distinct speakers.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadSampleSciFi}
            className="text-xs text-purple-300 hover:text-purple-200 bg-purple-950/50 hover:bg-purple-900/50 border border-purple-800/60 px-3 py-1.5 rounded-xl transition-all"
          >
            Load Sci-Fi Scene Sample
          </button>
        </div>

        {/* Speaker Setup Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Speaker A */}
          <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Speaker A (Primary)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Role 1</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Character Name</label>
                <input
                  type="text"
                  value={speakerA.name}
                  onChange={(e) => setSpeakerA({ ...speakerA, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Assigned Voice</label>
                <select
                  value={speakerA.voice}
                  onChange={(e) => setSpeakerA({ ...speakerA, voice: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender.split('/')[0].trim()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Speaker B */}
          <div className="bg-slate-950/80 border border-pink-500/30 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pink-400 uppercase tracking-wider">
                Speaker B (Co-Host)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Role 2</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Character Name</label>
                <input
                  type="text"
                  value={speakerB.name}
                  onChange={(e) => setSpeakerB({ ...speakerB, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Assigned Voice</label>
                <select
                  value={speakerB.voice}
                  onChange={(e) => setSpeakerB({ ...speakerB, voice: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender.split('/')[0].trim()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Script Lines Editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>Dialogue Lines ({turns.length} turns)</span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => addTurn(speakerA.name)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800 text-xs transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add {speakerA.name}</span>
            </button>
            <button
              type="button"
              onClick={() => addTurn(speakerB.name)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-pink-950/60 hover:bg-pink-900/60 text-pink-300 border border-pink-800 text-xs transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add {speakerB.name}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {turns.map((turn, index) => {
            const isSpeakerA = turn.speaker === speakerA.name;
            return (
              <div
                key={turn.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isSpeakerA
                    ? 'bg-slate-950/90 border-indigo-500/30'
                    : 'bg-slate-950/90 border-pink-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-500 font-mono">#{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => updateTurnSpeaker(turn.id, isSpeakerA ? speakerB.name : speakerA.name)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                        isSpeakerA
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          : 'bg-pink-500/20 text-pink-300 border-pink-500/40'
                      }`}
                    >
                      {turn.speaker} ⇄
                    </button>
                  </div>

                  <div className="flex items-center space-x-1">
                    {/* Vocal burst insert helpers */}
                    <span className="text-[10px] text-slate-500 mr-1 hidden sm:inline">Burst tags:</span>
                    {['<breath>', '<laugh>', '<gasp>', '|yeah|', '|mhm|'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertTag(turn.id, tag)}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors font-mono"
                        title={`Insert ${tag}`}
                      >
                        {tag}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => removeTurn(turn.id)}
                      disabled={turns.length <= 1}
                      className="p-1 rounded text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors ml-1"
                      title="Delete line"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <textarea
                  value={turn.text}
                  onChange={(e) => updateTurnText(turn.id, e.target.value)}
                  placeholder={`What does ${turn.speaker} say?`}
                  rows={2}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            );
          })}
        </div>

        {/* Generate Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-purple-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Synthesizing Multi-Speaker Dialogue...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Dual-Speaker Conversation</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
