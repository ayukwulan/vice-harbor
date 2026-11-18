// VICE HARBOR — procedural WebAudio: engine hum, siren, gunshots, pickups,
// and a looping bassline. No audio files; everything is synthesized.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    musicTimer: null,
    musicStep: 0,
    muted: false,
    enabled: false,
  };

  // Radio: three stations, each with its own bassline groove and track.
  // The loop below plays the current station's pattern; R switches station.
  const STATIONS = [
    { station: 'HARBOR 92.5', track: 'Sunset Drive — The Breakers', bass: [55, 0, 55, 65.4, 55, 0, 49, 58.3] },
    { station: 'NEON 104.1', track: 'Midnight Run — Velvet Static', bass: [49, 0, 58.3, 0, 49, 55, 0, 65.4] },
    { station: 'PALM 97.3', track: 'Golden Hour — Salt Air', bass: [65.4, 0, 55, 0, 65.4, 58.3, 49, 0] },
  ];
  let stationIndex = 0;

  function ensure() {
    if (audio.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      // Engine: low sawtooth whose pitch follows speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const engineFilter = audio.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      audio.engineOsc.connect(engineFilter);
      engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      // Siren: triangle wave wobbling between two tones.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'triangle';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.enabled = true;
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type = 'sine', vol = 0.25) {
    if (!audio.ctx || audio.muted) return;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audio.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start();
    osc.stop(audio.ctx.currentTime + dur);
  }

  function noiseBurst(dur, vol, lowpass = 1200) {
    if (!audio.ctx || audio.muted) return;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = audio.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start();
  }

  // Bassline loop: the current station's groove, 8 steps, one note per 0.22s.
  function startMusic() {
    if (audio.musicTimer || !audio.ctx) return;
    audio.musicTimer = setInterval(() => {
      if (audio.muted || !audio.ctx) return;
      const pattern = STATIONS[stationIndex].bass;
      const freq = pattern[audio.musicStep % pattern.length];
      audio.musicStep += 1;
      if (freq > 0) blip(freq, 0.2, 'square', 0.08);
      if (audio.musicStep % 16 === 0) blip(220, 0.12, 'sine', 0.05);
    }, 220);
  }

  return {
    audio,
    unlock() {
      if (ensure() && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    },
    setEngine(speedNorm, driving) {
      if (!audio.ctx || audio.muted) return;
      const target = driving ? 0.05 + speedNorm * 0.12 : 0;
      audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
      audio.engineOsc.frequency.setTargetAtTime(50 + speedNorm * 140, audio.ctx.currentTime, 0.08);
    },
    setSiren(on, t) {
      if (!audio.ctx || audio.muted) return;
      audio.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, audio.ctx.currentTime, 0.1);
      if (on) audio.sirenOsc.frequency.setTargetAtTime(Math.sin(t * 4) > 0 ? 720 : 540, audio.ctx.currentTime, 0.05);
    },
    gunshot() { noiseBurst(0.14, 0.5, 2400); },
    punch() { noiseBurst(0.08, 0.3, 700); },
    pickup() { blip(880, 0.12, 'sine', 0.25); setTimeout(() => blip(1320, 0.18, 'sine', 0.25), 90); },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110));
    },
    busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.2), i * 160)); },
    toggleMute() {
      audio.muted = !audio.muted;
      if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
      return audio.muted;
    },
    currentStation() {
      return STATIONS[stationIndex];
    },
    nextStation() {
      stationIndex = (stationIndex + 1) % STATIONS.length;
      return STATIONS[stationIndex];
    },
  };
}
