import { useEffect, useMemo } from "react";
import { NOTE_LABELS, ToneType, useTinnitusAudio } from "./useTinnitusAudio";

const toneOptions: { label: string; value: ToneType }[] = [
  { label: "Sine", value: "sine" },
  { label: "Cicada", value: "cicada" },
  { label: "Cricket", value: "cricket" },
  { label: "Triangle", value: "triangle" },
  { label: "Sawtooth", value: "sawtooth" },
  { label: "Filtered", value: "filtered" },
  { label: "Noise", value: "noise" },
];

const MAX_HZ = 15000;
const marks = [0, 3000, 6000, 9000, 12000, 15000];

function hzToSlider(hz: number) {
  return hz / MAX_HZ;
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(hz));
}

export default function App() {
  const audio = useTinnitusAudio();

  useEffect(() => {
    const url = new URL(window.location.href);
    const rangeHz = url.searchParams.get("rangeHz");
    const note = url.searchParams.get("note");
    const toneQuality = url.searchParams.get("toneQuality");

    if (rangeHz) {
      const v = Number(rangeHz);
      if (v <= 1) audio.setHzFromSlider(v);
      else audio.setHz(v);
    }
    else if (note) audio.setNoteIndex(Number(note));

    if (toneQuality) {
      const map: Record<string, ToneType> = {
        buttonSine: "sine",
        buttonCicada: "cicada",
        buttonCricket: "cricket",
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
    u.searchParams.set("note", String(audio.noteIndex));
    const toneButtonId = {
      sine: "buttonSine",
      cicada: "buttonCicada",
      cricket: "buttonCricket",
      triangle: "buttonTriangle",
      sawtooth: "buttonSawtooth",
      filtered: "buttonFiltered",
      noise: "buttonNoise",
    }[audio.tone];
    u.searchParams.set("toneQuality", toneButtonId);
    return u.toString();
  }, [audio.noteIndex, audio.hz, audio.tone]);

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
        <h1>Tinnitus Pitch Matcher</h1>
        <p className="muted">Simple version inspired by your current matcher.</p>

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
          <input
            type="range"
            min={0}
            max={150000}
            step={10}
            value={Math.round(audio.hz * 10)}
            onInput={(e) => audio.setHz(Number((e.target as HTMLInputElement).value) / 10)}
          />
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

        <div className="select-row">
          <label>Note</label>
          <select value={audio.noteIndex} onChange={(e) => audio.setNoteIndex(Number(e.target.value))}>
            {NOTE_LABELS.map((label, i) => (
              <option value={i} key={i}>{label}</option>
            ))}
          </select>
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