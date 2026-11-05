import React, { useEffect, useRef } from 'react';
import { VisualizerMode } from '../types';

interface VisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  mode: VisualizerMode;
  onModeChange?: (mode: VisualizerMode) => void;
  accentColor?: string;
}

// Global cache for MediaElementAudioSourceNode to avoid "already connected" DOMException
const sourceNodesMap = new WeakMap<HTMLAudioElement, { source: MediaElementAudioSourceNode; analyser: AnalyserNode }>();
let sharedAudioCtx: AudioContext | null = null;

export const Visualizer: React.FC<VisualizerProps> = ({
  audioElement,
  isPlaying,
  mode,
  onModeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let analyser: AnalyserNode | null = null;

    if (audioElement) {
      try {
        if (!sharedAudioCtx) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            sharedAudioCtx = new AudioContextClass();
          }
        }

        if (sharedAudioCtx) {
          if (sharedAudioCtx.state === 'suspended' && isPlaying) {
            sharedAudioCtx.resume();
          }

          let cached = sourceNodesMap.get(audioElement);
          if (!cached) {
            const source = sharedAudioCtx.createMediaElementSource(audioElement);
            const nodeAnalyser = sharedAudioCtx.createAnalyser();
            nodeAnalyser.fftSize = 128;
            nodeAnalyser.smoothingTimeConstant = 0.8;
            source.connect(nodeAnalyser);
            nodeAnalyser.connect(sharedAudioCtx.destination);
            cached = { source, analyser: nodeAnalyser };
            sourceNodesMap.set(audioElement, cached);
          }
          analyser = cached.analyser;
        }
      } catch (err) {
        console.warn('AudioContext visualization setup notice:', err);
      }
    }

    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(64);
    let time = 0;

    const render = () => {
      time += 0.05;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Ambient idle animation
        for (let i = 0; i < dataArray.length; i++) {
          const val = Math.sin(time + i * 0.2) * 15 + Math.cos(time * 0.7 + i * 0.1) * 10 + 25;
          dataArray[i] = isPlaying ? Math.max(val * 2, 40) : Math.max(val * 0.5, 8);
        }
      }

      if (mode === 'bars') {
        const barCount = 48;
        const totalGap = 3;
        const barWidth = (width - barCount * totalGap) / barCount;

        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor((i / barCount) * dataArray.length * 0.8);
          const rawValue = dataArray[dataIndex] || 0;
          const normalized = rawValue / 255;
          const barHeight = Math.max(4, normalized * (height * 0.85));

          const x = i * (barWidth + totalGap) + totalGap / 2;
          const y = height - barHeight;

          // Vibrant neon gradient: Indigo -> Violet -> Fuchsia -> Cyan
          const grad = ctx.createLinearGradient(0, height, 0, y);
          grad.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
          grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.75)');
          grad.addColorStop(1, 'rgba(236, 72, 153, 0.95)');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();

          // Crisp glowing cap dot (crisp solid drawing without expensive GPU shadowBlur)
          if (barHeight > 10) {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(x + barWidth / 2, y - 2, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (mode === 'wave') {
        // Fluid glowing oscilloscope wave
        ctx.beginPath();
        const sliceWidth = width / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);

        const waveGrad = ctx.createLinearGradient(0, 0, width, 0);
        waveGrad.addColorStop(0, '#6366f1');
        waveGrad.addColorStop(0.5, '#ec4899');
        waveGrad.addColorStop(1, '#06b6d4');

        ctx.strokeStyle = waveGrad;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Fill subtle mirror glow under wave
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.fill();
      } else if (mode === 'pulse') {
        // Circular radial pulse
        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.28;

        let avgLevel = 0;
        for (let i = 0; i < dataArray.length; i++) {
          avgLevel += dataArray[i];
        }
        avgLevel /= dataArray.length;
        const pulse = (avgLevel / 255) * 25;

        // Outer glow circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + pulse * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner dynamic circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + pulse, 0, Math.PI * 2);
        const circleGrad = ctx.createRadialGradient(
          centerX,
          centerY,
          baseRadius * 0.5,
          centerX,
          centerY,
          baseRadius + pulse,
        );
        circleGrad.addColorStop(0, 'rgba(79, 70, 229, 0.2)');
        circleGrad.addColorStop(1, 'rgba(236, 72, 153, 0.8)');
        ctx.strokeStyle = circleGrad;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Orbiting particles
        const numParticles = 16;
        for (let p = 0; p < numParticles; p++) {
          const angle = (p / numParticles) * Math.PI * 2 + time * 0.5;
          const pDist = baseRadius + pulse + 12 + Math.sin(time * 2 + p) * 6;
          const px = centerX + Math.cos(angle) * pDist;
          const py = centerY + Math.sin(angle) * pDist;

          ctx.fillStyle = p % 2 === 0 ? '#38bdf8' : '#f43f5e';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioElement, isPlaying, mode]);

  // Adjust canvas size smoothly with ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative w-full h-32 md:h-36 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-end p-2 shadow-inner">
      <div className="absolute top-2.5 right-3 z-10 flex items-center space-x-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700/70 text-xs shadow-md">
        <span className="text-slate-400 mr-1 text-[11px] font-medium hidden sm:inline">Visualizer:</span>
        <button
          type="button"
          onClick={() => onModeChange?.('bars')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            mode === 'bars' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Spectrum Bars"
        >
          Bars
        </button>
        <button
          type="button"
          onClick={() => onModeChange?.('wave')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            mode === 'wave' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Smooth Wave"
        >
          Wave
        </button>
        <button
          type="button"
          onClick={() => onModeChange?.('pulse')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            mode === 'pulse' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Radial Pulse"
        >
          Pulse
        </button>
      </div>

      <div className="absolute top-2.5 left-3 z-10 flex items-center space-x-2 text-xs text-slate-400">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${isPlaying ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50' : 'bg-slate-600'}`} />
        <span className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
          {isPlaying ? 'Audio Output Active (24kHz)' : 'Studio Audio Visualizer'}
        </span>
      </div>

      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
