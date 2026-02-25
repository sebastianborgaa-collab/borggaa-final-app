import { useCallback, useEffect, useRef, useState } from "react";

export type ToneType = "sine" | "cicada" | "cricket" | "triangle" | "sawtooth" | "filtered" | "noise";

const MIN_HZ = 0;
const MAX_HZ = 15000;

function hzToSlider(hz: number) {
  return (hz - MIN_HZ) / (MAX_HZ - MIN_HZ);
}

function sliderToHz(v: number) {
  return MIN_HZ + (MAX_HZ - MIN_HZ) * v;
}

function baseGainForTone(tone: ToneType): number {
  if (tone === "cicada" || tone === "cricket") return 0.2;
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
  const lfo2Ref = useRef<OscillatorNode | null>(null);

  const ensureCtx = useCallback(() => {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = null;
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
    try { lfo2Ref.current?.stop(); } catch {}
    try { noiseRef.current?.stop(); } catch {}
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    oscRef.current = null;
    lfoRef.current = null;
    lfo2Ref.current = null;
    noiseRef.current = null;
    lfoGainRef.current = null;
    bandpassRef.current = null;
  }, []);

  const start = useCallback(async (override?: { tone?: ToneType; hz?: number; volume?: number }) => {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    stopNodes();

    const useTone = override?.tone ?? tone;
    const useHz = Math.max(1, override?.hz ?? hz);
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
    } else if (useTone === "cicada") {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufferRef.current!;
      noise.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(useHz, ctx.currentTime);
      bandpass.Q.value = 4;

      const cicadaLfo = ctx.createOscillator();
      cicadaLfo.type = "sine";
      cicadaLfo.frequency.value = 90;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;

      noise.connect(bandpass).connect(gain);
      cicadaLfo.connect(lfoGain).connect(gain.gain);
      noise.start();
      cicadaLfo.start();

      noiseRef.current = noise;
      bandpassRef.current = bandpass;
      lfoRef.current = cicadaLfo;
      lfoGainRef.current = lfoGain;
    } else if (useTone === "cricket") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(useHz, ctx.currentTime);
      osc.connect(gain);
      osc.start();
      oscRef.current = osc;

      const buzzLfo = ctx.createOscillator();
      buzzLfo.type = "triangle";
      buzzLfo.frequency.value = 48;
      const buzzGain = ctx.createGain();
      buzzGain.gain.value = 0.028;
      buzzLfo.connect(buzzGain).connect(gain.gain);

      const chirpSaw = ctx.createOscillator();
      chirpSaw.type = "sawtooth";
      chirpSaw.frequency.value = 3.2;
      const curveLength = 256;
      const chirpCurve = new Float32Array(curveLength);
      for (let i = 0; i < curveLength; i++) {
        const x = (i / (curveLength - 1)) * 2 - 1;
        if (x < 0.72) chirpCurve[i] = 0;
        else chirpCurve[i] = Math.pow((x - 0.72) / 0.28, 0.5) * 0.06;
      }
      const chirpShaper = ctx.createWaveShaper();
      chirpShaper.curve = chirpCurve;
      const chirpGain = ctx.createGain();
      chirpGain.gain.value = 1;
      chirpSaw.connect(chirpShaper).connect(chirpGain).connect(gain.gain);

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufferRef.current!;
      noise.loop = true;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(useHz, ctx.currentTime);
      bandpass.Q.value = 3;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.025;
      noise.connect(bandpass).connect(noiseGain).connect(gain);
      noise.start();

      buzzLfo.start();
      chirpSaw.start();
      lfoRef.current = buzzLfo;
      lfo2Ref.current = chirpSaw;
      lfoGainRef.current = chirpGain;
      noiseRef.current = noise;
      bandpassRef.current = bandpass;
    } else if (useTone === "filtered") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(useHz, ctx.currentTime);
      osc.connect(gain);
      osc.start();
      oscRef.current = osc;

      const lfo = ctx.createOscillator();
      lfo.type = "triangle";
      lfo.frequency.value = 2.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.2;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      lfoRef.current = lfo;
      lfoGainRef.current = lfoGain;
    } else {
      const osc = ctx.createOscillator();
      osc.type = useTone;
      osc.frequency.setValueAtTime(useHz, ctx.currentTime);
      osc.connect(gain);
      osc.start();
      oscRef.current = osc;
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
    half,
    double,
    plusOne,
    minusOne,
  };
}