import { useCallback, useEffect, useRef, useState } from "react";

export type ToneType = "sine" | "square" | "triangle" | "sawtooth" | "filtered" | "noise";

const MIN_HZ = 0;
const MAX_HZ = 15000;

function hzToSlider(hz: number) {
  return (hz - MIN_HZ) / (MAX_HZ - MIN_HZ);
}

function sliderToHz(v: number) {
  return MIN_HZ + (MAX_HZ - MIN_HZ) * v;
}

function hzToNoteIndex(hz: number) {
  let noteNumber = 12 * Math.log2(hz / 440);
  noteNumber = Math.round(noteNumber) + 36;
  if (Math.floor(hz) < 53) return 0;
  if (Math.floor(hz) > 14080) return 97;
  return Math.max(0, Math.min(97, noteNumber));
}

function noteIndexToHz(noteIndex: number) {
  const note = noteIndex - 36;
  return Math.pow(2, note / 12) * 440;
}

function buildNoteLabels() {
  const names = ["A", "A# / Bb", "B", "C", "C# / Db", "D", "D# / Eb", "E", "F", "F# / Gb", "G", "G# / Ab"];
  const labels: string[] = [];
  for (let i = 0; i <= 97; i++) {
    if (i === 97) {
      labels.push("> A8");
      continue;
    }
    const idx = i % 12;
    const octave = Math.floor((i + 9) / 12) + 1;
    labels.push(`${names[idx]} ${octave}`);
  }
  return labels;
}

export const NOTE_LABELS = buildNoteLabels();

function baseGainForTone(tone: ToneType): number {
  if (tone === "square") return 0.07;
  if (tone === "sawtooth") return 0.1;
  return 0.5;
}

export function useTinnitusAudio() {
  const [hz, setHzState] = useState(100);
  const [tone, setTone] = useState<ToneType>("sine");
  const [volume, setVolumeState] = useState(0.15);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);
  const bandpassRef = useRef<BiquadFilterNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);

  const ensureCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      const bufferSize = ctx.sampleRate * 10;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      noiseBufferRef.current = buffer;
    }
    return audioCtxRef.current!;
  }, []);

  const stopNodes = useCallback(() => {
    try { oscRef.current?.stop(); } catch {}
    try { lfoRef.current?.stop(); } catch {}
    try { noiseRef.current?.stop(); } catch {}
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    oscRef.current = null;
    lfoRef.current = null;
    noiseRef.current = null;
    lfoGainRef.current = null;
    bandpassRef.current = null;
  }, []);

  const start = useCallback(async (override?: { tone?: ToneType; hz?: number; volume?: number }) => {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    stopNodes();

    const useTone = override?.tone ?? tone;
    const useHz = override?.hz ?? hz;
    const useVolume = override?.volume ?? volume;

    const gain = ctx.createGain();
    const baseGain = baseGainForTone(useTone);
    gain.gain.value = baseGain * useVolume;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    if (useTone === "noise") {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufferRef.current!;
      noise.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(useHz, ctx.currentTime);
      bandpass.Q.value = 8;

      noise.connect(bandpass).connect(gain);
      noise.start();

      noiseRef.current = noise;
      bandpassRef.current = bandpass;
    } else {
      const osc = ctx.createOscillator();
      osc.type = useTone === "filtered" ? "sine" : useTone;
      osc.frequency.setValueAtTime(useHz, ctx.currentTime);

      osc.connect(gain);
      osc.start();
      oscRef.current = osc;

      if (useTone === "filtered") {
        const lfo = ctx.createOscillator();
        lfo.type = "triangle";
        lfo.frequency.value = 50;

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.125;

        lfo.connect(lfoGain).connect(gain.gain);
        lfo.start();

        lfoRef.current = lfo;
        lfoGainRef.current = lfoGain;
      }
    }
    setIsPlaying(true);
  }, [ensureCtx, hz, tone, volume, stopNodes]);

  const stop = useCallback(() => {
    stopNodes();
    setIsPlaying(false);
  }, [stopNodes]);

  const setHz = useCallback((next: number) => {
    const clamped = Math.max(MIN_HZ, Math.min(MAX_HZ, next));
    setHzState(clamped);

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (bandpassRef.current && noiseRef.current) {
      bandpassRef.current.frequency.cancelScheduledValues(ctx.currentTime);
      bandpassRef.current.frequency.setTargetAtTime(clamped, ctx.currentTime, 0.008);
    }
    if (oscRef.current) {
      oscRef.current.frequency.cancelScheduledValues(ctx.currentTime);
      oscRef.current.frequency.setTargetAtTime(clamped, ctx.currentTime, 0.008);
    }
  }, []);

  const setHzFromSlider = useCallback((v: number) => setHz(sliderToHz(v)), [setHz]);
  const sliderValue = hzToSlider(hz);
  const noteIndex = hzToNoteIndex(hz);

  const setNoteIndex = useCallback((i: number) => setHz(noteIndexToHz(i)), [setHz]);

  const half = useCallback(() => setHz(hz / 2), [hz, setHz]);
  const double = useCallback(() => setHz(hz * 2), [hz, setHz]);
  const plusOne = useCallback(() => setHz(hz + 1), [hz, setHz]);
  const minusOne = useCallback(() => setHz(hz - 1), [hz, setHz]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    const g = gainRef.current;
    if (g) g.gain.setTargetAtTime(baseGainForTone(tone) * clamped, audioCtxRef.current!.currentTime, 0.01);
  }, [tone]);

  useEffect(() => {
    return () => {
      stopNodes();
      audioCtxRef.current?.close();
    };
  }, [stopNodes]);

  return {
    hz,
    setHz,
    tone,
    setTone,
    volume,
    setVolume,
    isPlaying,
    start,
    stop,
    sliderValue,
    setHzFromSlider,
    noteIndex,
    setNoteIndex,
    half,
    double,
    plusOne,
    minusOne,
  };
}