export interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  category: 'core' | 'female' | 'male' | 'expressive' | 'calm' | 'cinematic';
  tone: string;
  description: string;
  tag: string;
  avatarColor: string;
  isFeatured?: boolean;
}

export interface PresetStyle {
  id: string;
  name: string;
  prompt: string;
  iconName: string;
  description: string;
}

export interface DialogueTurn {
  id: string;
  speaker: string;
  text: string;
  style?: string;
}

export interface GeneratedSpeechItem {
  id: string;
  timestamp: number;
  text: string;
  voiceName: string;
  style: string;
  audioUrl: string;
  duration: number;
  sizeBytes: number;
  model: string;
  isDialogue?: boolean;
}

export type EngineMode = 'gemini' | 'browser' | 'dialogue';
export type VisualizerMode = 'bars' | 'wave' | 'pulse';
export type VoiceCategoryFilter = 'all' | 'featured' | 'female' | 'male' | 'expressive' | 'calm';
