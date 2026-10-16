/**
 * PWONYX - 4-Stem Adaptive Web Audio API Engine
 * Features:
 * 1. Sample-Accurate 4-Stem Synchronization (Drums, Bass, Arp/Synth, Lead)
 * 2. Built-in Procedural 4-Stem Synthesizer ("Popcorn [PWONYX Remix]" & "Cyber Overdrive")
 * 3. Custom Suno Stem Loader (Drag & Drop .mp3/.ogg/.wav into AudioBuffers synced to audioCtx.currentTime)
 * 4. Dynamic Stem Layering via GainNode.gain.linearRampToValueAtTime based on active ball count
 * 5. Real-time BiquadFilterNode (Low-Pass underwater effect on Pause / Slow-Mo / Miss)
 * 6. Real-time AnalyserNode FFT for beat-reactive neon graphics
 */
window.PWONYX = window.PWONYX || {};

(function () {
    const STEM_KEYS = ['drums', 'bass', 'arp', 'lead'];

    // MIDI note helper
    function midiToFreq(m) {
        return 440 * Math.pow(2, (m - 69) / 12);
    }

    // Track 1: Popcorn (EON / Pwong 2 Homage) in B Minor (138 BPM)
    // 32 16th-note steps (2 bars)
    const POPCORN_LEAD = [
        // Bar 1: B4 A4 B4 F#4 D4 F#4 B3 . | B4 A4 B4 F#4 D4 F#4 B3 .
        71, 69, 71, 66, 62, 66, 59, 0,
        71, 69, 71, 66, 62, 66, 59, 0,
        // Bar 2: B4 C#5 D5 C#5 D5 B4 C#5 B4 | C#5 A4 B4 A4 B4 G4 B4 .
        71, 73, 74, 73, 74, 71, 73, 71,
        73, 69, 71, 69, 71, 67, 71, 0
    ];

    const POPCORN_ARP = [
        59, 62, 66, 71, 59, 62, 66, 71,
        59, 62, 66, 71, 59, 62, 66, 71,
        62, 66, 69, 74, 61, 64, 69, 73,
        59, 62, 66, 71, 55, 59, 62, 67
    ];

    const POPCORN_BASS = [
        47, 47, 59, 47, 47, 47, 59, 47,
        47, 47, 59, 47, 47, 47, 59, 47,
        50, 50, 62, 50, 49, 49, 61, 49,
        47, 47, 59, 47, 43, 43, 55, 43
    ];

    // Track 2: Cyber Overdrive (ParagonX9 / Newgrounds 2009 Trance Style) in C Minor (144 BPM)
    const CYBER_LEAD = [
        72, 0, 75, 74, 72, 67, 70, 0,
        72, 74, 75, 77, 79, 75, 74, 70,
        68, 0, 72, 70, 68, 63, 67, 0,
        70, 72, 74, 75, 74, 70, 67, 74
    ];

    const CYBER_ARP = [
        60, 63, 67, 72, 60, 63, 67, 72,
        58, 62, 65, 70, 58, 62, 65, 70,
        56, 60, 63, 68, 56, 60, 63, 68,
        55, 59, 62, 67, 55, 62, 67, 71
    ];

    const CYBER_BASS = [
        48, 48, 60, 48, 48, 48, 60, 48,
        46, 46, 58, 46, 46, 46, 58, 46,
        44, 44, 56, 44, 44, 44, 56, 44,
        43, 43, 55, 43, 43, 43, 55, 43
    ];

    // Track 3: Flow (Creo Style - Melodic Glitch-Hop / Brass Groove) in D Minor (112 BPM)
    const FLOW_LEAD = [
        74, 0, 77, 76, 74, 69, 0, 72,
        0, 74, 76, 77, 81, 77, 76, 72,
        70, 0, 74, 72, 70, 65, 0, 69,
        0, 70, 72, 74, 76, 72, 69, 72
    ];

    const FLOW_ARP = [
        62, 65, 69, 74, 65, 69, 74, 77,
        60, 64, 67, 72, 64, 67, 72, 76,
        58, 62, 65, 70, 62, 65, 70, 74,
        57, 60, 64, 69, 60, 64, 69, 72
    ];

    const FLOW_BASS = [
        50, 0, 50, 0, 0, 50, 62, 0,
        48, 0, 48, 0, 0, 48, 60, 0,
        46, 0, 46, 0, 0, 46, 58, 0,
        45, 0, 45, 0, 0, 45, 57, 0
    ];

    class AdaptiveAudioEngine {
        constructor() {
            this.ctx = null;
            this.isInitialized = false;
            this.isPlaying = false;
            this.isMuted = false;
            this.autoLayering = true; // Automatically control stem levels by ball count
            this.currentTrack = 'popcorn'; // 'popcorn' | 'cyber' | 'suno'

            // Master chain nodes
            this.masterGain = null;
            this.filterNode = null;
            this.analyser = null;
            this.sfxGain = null;

            // 4 Stem GainNodes + Analysers for visual meters
            this.stemGains = {};
            this.stemLevels = { drums: 1.0, bass: 0.35, arp: 0.0, lead: 0.0 };
            this.manualStemLevels = { drums: 1.0, bass: 1.0, arp: 1.0, lead: 1.0 };

            // Custom Suno AudioBuffers & active source nodes
            this.customBuffers = { drums: null, bass: null, arp: null, lead: null };
            this.customFileNames = { drums: null, bass: null, arp: null, lead: null };
            this.customSources = {};

            // Procedural Sequencer state
            this.stepIndex = 0;
            this.nextNoteTime = 0;
            this.schedulerTimer = null;
            this.noiseBuffer = null;

            // FFT Data
            this.freqData = new Uint8Array(128);
            this.bassEnergy = 0;
            this.midEnergy = 0;
            this.highEnergy = 0;
            this.beatPulse = 0;
        }

        init() {
            if (this.isInitialized) {
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
                return;
            }

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();

            // Master Filter (BiquadFilterNode for pause/slow-mo/hit low-pass effects)
            this.filterNode = this.ctx.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.value = 20000;
            this.filterNode.Q.value = 1.2;

            // Master Analyser (AnalyserNode for audio-reactive visuals)
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.78;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

            // Master Gain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.8;

            // SFX Gain (separate from music filter or post-filter so hits always punch)
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.75;

            // Create the 4 Stem GainNodes -> Filter -> Analyser -> Master -> Destination
            STEM_KEYS.forEach((key) => {
                const g = this.ctx.createGain();
                g.gain.value = this.stemLevels[key];
                g.connect(this.filterNode);
                this.stemGains[key] = g;
            });

            this.filterNode.connect(this.analyser);
            this.analyser.connect(this.masterGain);
            this.sfxGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            // Pre-generate white noise buffer for snare/hi-hats
            const bufSize = this.ctx.sampleRate * 0.25;
            this.noiseBuffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            this.isInitialized = true;
        }

        startMusic() {
            this.init();
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.stopMusic();
            this.isPlaying = true;

            if (this.currentTrack === 'suno' && this.hasAnyCustomStems()) {
                this.startCustomStemsSampleAccurate();
            } else {
                this.stepIndex = 0;
                this.nextNoteTime = this.ctx.currentTime + 0.04;
                this.schedulerTimer = setInterval(() => this.scheduleProceduralStep(), 25);
            }
        }

        stopMusic() {
            this.isPlaying = false;
            if (this.schedulerTimer) {
                clearInterval(this.schedulerTimer);
                this.schedulerTimer = null;
            }
            this.stopCustomStemSources();
        }

        setTrack(trackId) {
            this.currentTrack = trackId;
            if (this.isPlaying) {
                this.startMusic();
            }
        }

        hasAnyCustomStems() {
            return STEM_KEYS.some((k) => !!this.customBuffers[k]);
        }

        /**
         * Sample-accurate playback of all 4 Suno stems simultaneously
         */
        startCustomStemsSampleAccurate() {
            this.stopCustomStemSources();
            if (!this.ctx) return;

            // Pick a reference loop duration if buffers differ slightly
            const startTime = this.ctx.currentTime + 0.05;
            STEM_KEYS.forEach((key) => {
                const buffer = this.customBuffers[key];
                if (!buffer) return;
                const source = this.ctx.createBufferSource();
                source.buffer = buffer;
                source.loop = true;
                source.connect(this.stemGains[key]);
                source.start(startTime);
                this.customSources[key] = source;
            });
        }

        stopCustomStemSources() {
            STEM_KEYS.forEach((key) => {
                const src = this.customSources[key];
                if (src) {
                    try {
                        src.stop();
                        src.disconnect();
                    } catch (e) {
                        // Ignore already stopped
                    }
                    this.customSources[key] = null;
                }
            });
        }

        /**
         * Decode a user-uploaded Suno Stem file (.mp3, .ogg, .wav) into an AudioBuffer
         */
        async loadCustomStemFile(stemKey, file) {
            this.init();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.customBuffers[stemKey] = audioBuffer;
            this.customFileNames[stemKey] = file.name;

            // Automatically switch to Suno mode and re-sync all stems sample-accurately
            this.currentTrack = 'suno';
            if (this.isPlaying) {
                this.startMusic();
            }
            return {
                duration: audioBuffer.duration,
                sampleRate: audioBuffer.sampleRate,
                channels: audioBuffer.numberOfChannels,
                name: file.name
            };
        }

        /**
         * Dynamically ramp the 4 Stem GainNodes based on active ball count in the arena
         */
        updateAdaptiveLayers(ballCount) {
            if (!this.isInitialized) return;

            let targetDrums = 1.0;
            let targetBass = 0.35;
            let targetArp = 0.0;
            let targetLead = 0.0;

            if (!this.autoLayering) {
                targetDrums = this.manualStemLevels.drums;
                targetBass = this.manualStemLevels.bass;
                targetArp = this.manualStemLevels.arp;
                targetLead = this.manualStemLevels.lead;
            } else {
                // Progressive layering as balls multiply from 1 to 20:
                // 1-2 balls: Drums + subtle Bass
                // 3-6 balls: Full Bass + rising Synth Arp
                // 7-11 balls: Full Arp + rising Lead melody
                // 12-20 balls: All 4 stems at 100% Rave Overdrive
                targetDrums = 1.0;
                targetBass = Math.min(1.0, 0.35 + (ballCount - 1) * 0.22);
                targetArp = ballCount < 3 ? 0.0 : Math.min(1.0, (ballCount - 2) * 0.2);
                targetLead = ballCount < 6 ? 0.0 : Math.min(1.0, (ballCount - 5) * 0.14);
            }

            this.stemLevels.drums = targetDrums;
            this.stemLevels.bass = targetBass;
            this.stemLevels.arp = targetArp;
            this.stemLevels.lead = targetLead;

            const now = this.ctx.currentTime;
            const rampTime = 0.25;
            STEM_KEYS.forEach((key) => {
                const g = this.stemGains[key].gain;
                g.cancelScheduledValues(now);
                g.setValueAtTime(g.value, now);
                g.linearRampToValueAtTime(this.stemLevels[key], now + rampTime);
            });
        }

        setManualStemLevel(stemKey, value) {
            this.manualStemLevels[stemKey] = Math.max(0, Math.min(1, value));
            this.updateAdaptiveLayers(1);
        }

        /**
         * Real-time Low-Pass Filter control (Paused / Slow-Motion / Underwater effect)
         */
        setLowPassEffect(mode) {
            if (!this.isInitialized) return;
            const now = this.ctx.currentTime;
            const freq = this.filterNode.frequency;
            const q = this.filterNode.Q;
            freq.cancelScheduledValues(now);
            q.cancelScheduledValues(now);
            freq.setValueAtTime(freq.value, now);
            q.setValueAtTime(q.value, now);

            if (mode === 'paused') {
                freq.exponentialRampToValueAtTime(380, now + 0.18);
                q.linearRampToValueAtTime(4.0, now + 0.18);
            } else if (mode === 'slowmo') {
                freq.exponentialRampToValueAtTime(680, now + 0.15);
                q.linearRampToValueAtTime(3.2, now + 0.15);
            } else if (mode === 'damage') {
                // Quick muffled dip then recover
                freq.exponentialRampToValueAtTime(450, now + 0.04);
                freq.exponentialRampToValueAtTime(19500, now + 0.38);
            } else {
                // 'normal'
                freq.exponentialRampToValueAtTime(20000, now + 0.2);
                q.linearRampToValueAtTime(1.2, now + 0.2);
            }
        }

        toggleMute() {
            this.init();
            this.isMuted = !this.isMuted;
            const now = this.ctx.currentTime;
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.8, now);
            return this.isMuted;
        }

        /**
         * Procedural 4-Stem Lookahead Sequencer
         */
        scheduleProceduralStep() {
            if (!this.isPlaying || !this.ctx) return;
            const bpm = this.currentTrack === 'flow' ? 112 : (this.currentTrack === 'cyber' ? 144 : 138);
            const secondsPerStep = 60 / bpm / 4; // 16th note

            while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
                this.triggerProceduralNotes(this.stepIndex, this.nextNoteTime, secondsPerStep);
                this.nextNoteTime += secondsPerStep;
                this.stepIndex = (this.stepIndex + 1) % 32;
            }
        }

        triggerProceduralNotes(step, time, stepDur) {
            const isCyber = this.currentTrack === 'cyber';
            const isFlow = this.currentTrack === 'flow';

            // --- STEM 1: DRUMS ---
            if (isFlow) {
                // Midtempo Glitch-Hop / Electro beat: kick on 0, 10, 16, 26; snappy snare on 8 and 24
                if (step === 0 || step === 10 || step === 16 || step === 26) {
                    this.synthKick(time);
                    this.beatPulse = 1.0;
                }
                if (step === 8 || step === 24) {
                    this.synthSnare(time);
                }
                if (step % 2 === 1 || step % 4 === 2) {
                    this.synthHiHat(time, 0.04);
                }
            } else {
                // 4-on-the-floor Kick, Off-beat Open Hat, Snare on 4 & 12
                if (step % 4 === 0) {
                    this.synthKick(time);
                    this.beatPulse = 1.0;
                }
                if (step % 8 === 4) {
                    this.synthSnare(time);
                }
                if (step % 2 === 1) {
                    this.synthHiHat(time, step % 4 === 2 ? 0.11 : 0.05);
                }
            }

            // --- STEM 2: BASS ---
            const bassArr = isFlow ? FLOW_BASS : (isCyber ? CYBER_BASS : POPCORN_BASS);
            const bassMidi = bassArr[step];
            if (bassMidi > 0) {
                const accent = isFlow ? 0.38 : (step % 4 === 2 ? 0.34 : 0.22);
                this.synthBass(time, midiToFreq(bassMidi), stepDur * (isFlow ? 1.2 : 0.85), accent);
            }

            // --- STEM 3: SYNTH ARP ---
            const arpArr = isFlow ? FLOW_ARP : (isCyber ? CYBER_ARP : POPCORN_ARP);
            const arpMidi = arpArr[step];
            if (arpMidi > 0) {
                this.synthArp(time, midiToFreq(arpMidi), stepDur * 0.75);
            }

            // --- STEM 4: LEAD MELODY ---
            const leadArr = isFlow ? FLOW_LEAD : (isCyber ? CYBER_LEAD : POPCORN_LEAD);
            const leadMidi = leadArr[step];
            if (leadMidi > 0) {
                this.synthLead(time, midiToFreq(leadMidi), stepDur * 0.7);
            }
        }

        synthKick(time) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(145, time);
            osc.frequency.exponentialRampToValueAtTime(38, time + 0.13);

            g.gain.setValueAtTime(0.85, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

            osc.connect(g);
            g.connect(this.stemGains.drums);
            osc.start(time);
            osc.stop(time + 0.21);
        }

        synthSnare(time) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(750, time);

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.32, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

            noise.connect(filter);
            filter.connect(g);
            g.connect(this.stemGains.drums);
            noise.start(time);
            noise.stop(time + 0.15);
        }

        synthHiHat(time, dur) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6500, time);

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.14, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);

            noise.connect(filter);
            filter.connect(g);
            g.connect(this.stemGains.drums);
            noise.start(time);
            noise.stop(time + dur + 0.01);
        }

        synthBass(time, freq, dur, vol) {
            const osc = this.ctx.createOscillator();
            const filt = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);

            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(freq * 4.5, time);
            filt.frequency.exponentialRampToValueAtTime(freq * 1.4, time + dur);
            filt.Q.value = 3.5;

            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);

            osc.connect(filt);
            filt.connect(g);
            g.connect(this.stemGains.bass);
            osc.start(time);
            osc.stop(time + dur + 0.01);
        }

        synthArp(time, freq, dur) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, time);

            g.gain.setValueAtTime(0.13, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);

            osc.connect(g);
            g.connect(this.stemGains.arp);
            osc.start(time);
            osc.stop(time + dur + 0.01);
        }

        synthLead(time, freq, dur) {
            // Iconic Popcorn plucky dual-oscillator synth
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const filt = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();

            osc1.type = 'sawtooth';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(freq, time);
            osc2.frequency.setValueAtTime(freq * 2, time); // Octave pluck harmonic
            osc1.detune.value = -6;
            osc2.detune.value = 6;

            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(freq * 6, time);
            filt.frequency.exponentialRampToValueAtTime(freq * 1.8, time + dur);
            filt.Q.value = 2.8;

            g.gain.setValueAtTime(0.24, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);

            osc1.connect(filt);
            osc2.connect(filt);
            filt.connect(g);
            g.connect(this.stemGains.lead);

            osc1.start(time);
            osc2.start(time);
            osc1.stop(time + dur + 0.01);
            osc2.stop(time + dur + 0.01);
        }

        // --- Arcade Sound Effects ---
        playBounce(pitchFactor = 1.0, isCurve = false) {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();

            osc.type = isCurve ? 'sawtooth' : 'triangle';
            const base = 320 * pitchFactor;
            osc.frequency.setValueAtTime(base, now);
            osc.frequency.exponentialRampToValueAtTime(base * (isCurve ? 2.1 : 1.45), now + 0.075);

            g.gain.setValueAtTime(0.18, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.085);
        }

        playGhostLaunch() {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);

            g.gain.setValueAtTime(0.24, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.18);
        }

        playPowerUp() {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, now + i * 0.045);
                g.gain.setValueAtTime(0.18, now + i * 0.045);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.11);
                osc.connect(g);
                g.connect(this.sfxGain);
                osc.start(now + i * 0.045);
                osc.stop(now + i * 0.045 + 0.12);
            });
        }

        playScoreGoal() {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.setValueAtTime(880, now + 0.06);

            g.gain.setValueAtTime(0.22, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.19);
        }

        playMissPenalty() {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);

            g.gain.setValueAtTime(0.22, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.2);
        }

        /**
         * Called every animation frame to compute FFT bass/mid/high energy for reactive visuals
         */
        updateAnalysis(dt) {
            this.beatPulse = Math.max(0, this.beatPulse - dt * 4.5);
            if (!this.isInitialized || !this.analyser) return;

            this.analyser.getByteFrequencyData(this.freqData);

            let bassSum = 0;
            for (let i = 0; i < 8; i++) bassSum += this.freqData[i];
            this.bassEnergy = bassSum / (8 * 255);

            let midSum = 0;
            for (let i = 8; i < 32; i++) midSum += this.freqData[i];
            this.midEnergy = midSum / (24 * 255);

            let highSum = 0;
            for (let i = 32; i < 72; i++) highSum += this.freqData[i];
            this.highEnergy = highSum / (40 * 255);
        }
    }

    window.PWONYX.AudioEngine = new AdaptiveAudioEngine();
})();
