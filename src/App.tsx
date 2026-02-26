import { useCallback, useEffect, useMemo, useRef } from "react";
import { ToneType, useTinnitusAudio } from "./useTinnitusAudio";

const toneOptions: { label: string; value: ToneType }[] = [
  { label: "Sine", value: "sine" },
  { label: "Cicada", value: "cicada" },
  { label: "Cricket", value: "cricket" },
  { label: "BB noise", value: "bbnoise" },
  { label: "Triangle", value: "triangle" },
  { label: "Sawtooth", value: "sawtooth" },
  { label: "Filtered", value: "filtered" },
  { label: "Noise", value: "noise" },
];

const MAX_HZ = 15000;
const marks = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000];

function hzToSlider(hz: number) {
  return hz / MAX_HZ;
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(hz));
}

export default function App() {
  const audio = useTinnitusAudio();
  const trackRef = useRef<HTMLDivElement>(null);

  const getHzFromPosition = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return audio.hz;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * MAX_HZ;
  }, [audio.hz]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    audio.setHz(getHzFromPosition(e.clientX));
  }, [audio, getHzFromPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.buttons !== 1) return;
    audio.setHz(getHzFromPosition(e.clientX));
  }, [audio, getHzFromPosition]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const rangeHz = url.searchParams.get("rangeHz");
    const toneQuality = url.searchParams.get("toneQuality");

    if (rangeHz) {
      const v = Number(rangeHz);
      if (v <= 1) audio.setHzFromSlider(v);
      else audio.setHz(v);
    }

    if (toneQuality) {
      const map: Record<string, ToneType> = {
        buttonSine: "sine",
        buttonCicada: "cicada",
        buttonCricket: "cricket",
        buttonBbnoise: "bbnoise",
        buttonTriangle: "triangle",
        buttonSawtooth: "sawtooth",
        buttonFiltered: "filtered",
        buttonNoise: "noise",
      };
      if (map[toneQuality]) audio.setTone(map[toneQuality]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl = useMemo(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("rangeHz", String(Math.round(audio.hz)));
    const toneButtonId = {
      sine: "buttonSine",
      cicada: "buttonCicada",
      cricket: "buttonCricket",
      bbnoise: "buttonBbnoise",
      triangle: "buttonTriangle",
      sawtooth: "buttonSawtooth",
      filtered: "buttonFiltered",
      noise: "buttonNoise",
    }[audio.tone];
    u.searchParams.set("toneQuality", toneButtonId);
    return u.toString();
  }, [audio.hz, audio.tone]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Settings link copied!");
    } catch {
      alert("Could not copy link.");
    }
  };

  return (
    <div className="page">
      <div className="card">
        <header className="app-header">
          <div className="logo-wrap">
            <img src="/logo-borgaa.png" alt="Borgaa" className="logo" />
          </div>
          <div className="header-text">
            <h1>Borgaa Clinic Tinnitus Pitch Matcher</h1>
            <p className="tagline">developed by the Borgaa Tinnitus Clinic</p>
          </div>
        </header>

        <div className="controls-row">
          <button
            className={audio.isPlaying ? "danger" : "primary"}
            onClick={() => (audio.isPlaying ? audio.stop() : audio.start())}
          >
            {audio.isPlaying ? "Stop" : "Play"}
          </button>
          <button className="secondary" onClick={copyLink}>Save Settings</button>
        </div>

        <div className="volume-row">
          <label>Volume</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={audio.volume}
            onChange={(e) => audio.setVolume(Number(e.target.value))}
          />
          <span className="volume-value">{Math.round(audio.volume * 100)}%</span>
        </div>

        <div className="slider-wrap">
          <div
            ref={trackRef}
            className="slider-track"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={MAX_HZ}
            aria-valuenow={Math.round(audio.hz)}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => (e.target as Element).releasePointerCapture(e.pointerId)}
            onPointerCancel={(e) => (e.target as Element).releasePointerCapture(e.pointerId)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 100 : 1;
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") audio.setHz(Math.max(0, audio.hz - step));
              if (e.key === "ArrowRight" || e.key === "ArrowUp") audio.setHz(Math.min(MAX_HZ, audio.hz + step));
            }}
          >
            <div className="slider-thumb" style={{ left: `${(audio.hz / MAX_HZ) * 100}%` }} />
          </div>
          <div className="marks">
            {marks.map((m) => (
              <button
                key={m}
                className="mark"
                style={{ left: `${hzToSlider(m) * 100}%` }}
                onClick={() => audio.setHz(m)}
              >
                {formatHz(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="hz-row">
          <button onClick={audio.half}>½</button>
          <button onClick={audio.minusOne}>−</button>
          <div className="hz-display">
            <input
              type="number"
              min={0}
              max={15000}
              step={1}
              value={Math.round(audio.hz)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v)) audio.setHz(Math.max(0, Math.min(15000, v)));
              }}
              className="hz-input"
            />
            {" Hz"}
          </div>
          <button onClick={audio.plusOne}>+</button>
          <button onClick={audio.double}>×2</button>
        </div>

        <div className="tone-grid">
          {toneOptions.map((opt) => (
            <button
              key={opt.value}
              className={audio.tone === opt.value ? "tone active" : "tone"}
              onClick={() => {
                const newTone = opt.value;
                audio.setTone(newTone);
                if (audio.isPlaying) void audio.start({ tone: newTone });
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="small">
          Tip: Use headphones at low volume and increase slowly.
        </p>
      </div>
    </div>
  );
}