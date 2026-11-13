/**
 * PWONYX - 4-Stem Adaptive Web Audio API Engine
 * Features:
 * 1. Sample-Accurate 4-Stem Synchronization (Drums, Bass, Arp/Synth, Lead)
 * 2. Built-in 128-Step (8-Bar) Procedural 4-Stem Synthesizers with Build-up & Drop ("Popcorn", "Cyber Overdrive", "Flow")
 * 3. Custom Suno Stem Loader (.mp3/.ogg/.wav into AudioBuffers synced to audioCtx.currentTime)
 * 4. Dynamic Stem Layering via GainNode.gain.linearRampToValueAtTime based on active ball count
 * 5. Real-time BiquadFilterNode (Low-Pass underwater effect on Pause / Slow-Mo / Miss)
 * 6. High-Resolution 1024-FFT AnalyserNode with Adaptive Spectral Flux Beat & Drop Detection
 * 7. Scale-Quantized Harmonic Arcade SFX (bounces, goals, and rhythm hits tuned to the active track's musical key)
 */
window.PWONYX = window.PWONYX || {};

(function () {
    const STEM_KEYS = ['drums', 'bass', 'arp', 'lead'];
    const STEM_DB_NAME = 'pwonyx_stems_v1';
    const STEM_STORE = 'stems';

    function openStemDB() {
        return new Promise((resolve, reject) => {
            if (typeof window.indexedDB === 'undefined') {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = window.indexedDB.open(STEM_DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STEM_STORE)) {
                    db.createObjectStore(STEM_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveStemToDB(key, name, arrayBuffer) {
        try {
            const db = await openStemDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STEM_STORE, 'readwrite');
                tx.objectStore(STEM_STORE).put({ key, name, buffer: arrayBuffer });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (e) {
            // Ignore IndexedDB quota/privacy mode errors
        }
    }

    async function loadAllStemsFromDB() {
        try {
            const db = await openStemDB();
            const records = await new Promise((resolve, reject) => {
                const tx = db.transaction(STEM_STORE, 'readonly');
                const req = tx.objectStore(STEM_STORE).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
            db.close();
            return records;
        } catch (e) {
            return [];
        }
    }

    async function clearStemsFromDB() {
        try {
            const db = await openStemDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STEM_STORE, 'readwrite');
                tx.objectStore(STEM_STORE).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (e) {}
    }

    // MIDI note helper
    function midiToFreq(m) {
        return 440 * Math.pow(2, (m - 69) / 12);
    }

    // Musical scales (MIDI notes) for each track so gameplay SFX harmonize with the music
    const TRACK_SCALES = {
        // Chaoz Fantasy (ParagonX9) - F# Minor / A Major (142 BPM)
        chaoz: [66, 68, 69, 71, 73, 74, 76, 78, 80, 81, 85],
        // Popcorn (PWONYX Remix) - B Minor (138 BPM)
        popcorn: [59, 61, 62, 64, 66, 67, 69, 71, 73, 74, 78],
        // Cyber Overdrive - C Minor (144 BPM)
        cyber: [60, 62, 63, 65, 67, 68, 70, 72, 74, 75, 79],
        // Flow (Creo Style) - D Minor (112 BPM)
        flow: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 81],
        // Suno Custom Stems - Universal C Minor Pentatonic / Dorian consonant intervals
        suno: [60, 63, 65, 67, 70, 72, 75, 77, 79, 82, 84]
    };

    // Track 1: Popcorn (EON / Pwong 2 Homage) in B Minor (138 BPM)
    // Base 32-step motif (expanded dynamically across 128 steps / 8 bars with variations & build-up)
    const POPCORN_LEAD = [
        // Bar 1: B4 A4 B4 F#4 D4 F#4 B3 . | B4 A4 B4 F#4 D4 F#4 B3 .
        71, 69, 71, 66, 62, 66, 59, 0,
        71, 69, 71, 66, 62, 66, 59, 0,
        // Bar 2: B4 C#5 D5 C#5 D5 B4 C#5 B4 | C#5 A4 B4 A4 B4 G4 B4 .
        71, 73, 74, 73, 74, 71, 73, 71,
        73, 69, 71, 69, 71, 67, 71, 0
    ];

    const POPCORN_LEAD_B = [
        // Bar 5-6 Counter-phrase (D Major / F# Minor lift)
        74, 73, 74, 69, 66, 69, 62, 0,
        74, 73, 74, 69, 66, 69, 62, 0,
        74, 76, 78, 76, 78, 74, 76, 74,
        76, 73, 74, 73, 71, 69, 66, 0
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

    const CYBER_LEAD_B = [
        75, 0, 79, 77, 75, 72, 74, 0,
        75, 77, 79, 80, 84, 79, 77, 74,
        72, 0, 75, 74, 72, 68, 70, 0,
        74, 75, 77, 79, 77, 74, 71, 79
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

    const FLOW_LEAD_B = [
        77, 0, 81, 79, 77, 74, 0, 76,
        0, 77, 79, 81, 86, 81, 79, 76,
        74, 0, 77, 76, 74, 69, 0, 72,
        0, 74, 76, 77, 81, 79, 76, 74
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
            this.currentTrack = 'chaoz'; // 'chaoz' | 'flow' | 'popcorn' | 'cyber' | 'suno'

            // Master chain nodes
            this.masterGain = null;
            this.filterNode = null;
            this.analyser = null;
            this.sfxGain = null;
            this.trackGain = null;

            // Built-in MP3 Track ("assets/musics/Chaoz Fantasy.mp3")
            this.chaozUrl = 'assets/musics/Chaoz Fantasy.mp3';
            this.chaozDuration = 133.9;
            this.chaozBuffer = null;
            this.chaozSource = null;
            this.chaozMediaEl = null;
            this.chaozLoading = false;
            this.chaozStartTime = 0;
            this.chaozPlaying = false;

            // Pause-aware track clock state
            this._pauseStartedCtxTime = null;
            this._pausedMediaTime = null;
            this.totalPausedDuration = 0;
            this._isGamePaused = false;

            // 4 Stem GainNodes + Analysers for visual meters
            this.stemGains = {};
            this.stemLevels = { drums: 1.0, bass: 0.35, arp: 0.0, lead: 0.0 };
            this.manualStemLevels = { drums: 1.0, bass: 1.0, arp: 1.0, lead: 1.0 };

            // Custom Suno AudioBuffers & active source nodes
            this.customBuffers = { drums: null, bass: null, arp: null, lead: null };
            this.customFileNames = { drums: null, bass: null, arp: null, lead: null };
            this.customSources = {};
            this.customStartTime = 0;

            // Procedural Sequencer state (128 steps = 8 bars)
            this.stepIndex = 0;
            this.totalBarsPlayed = 0;
            this.nextNoteTime = 0;
            this.schedulerTimer = null;
            this.noiseBuffer = null;
            this.scaleCursor = 0;

            // High-Resolution FFT (1024 FFT = 512 frequency bins, ~46.8 Hz per bin)
            this.freqData = new Uint8Array(512);
            this.subBassEnergy = 0;
            this.bassEnergy = 0;
            this.prevBassEnergy = 0;
            this.avgBassEnergy = 0.25;
            this.midEnergy = 0;
            this.highEnergy = 0;
            this.totalEnergy = 0;
            this.avgTotalEnergy = 0.25;
            this.beatPulse = 0;
            this.beatCooldown = 0;
            this.beatCount = 0;
            this.musicElapsed = 0;
            this.musicIntensity = 0.25;

            // Build-up & Climax Drop state exposed to PwonyxGame
            this.buildUpCharge = 0; // 0.0 to 1.0 when approaching a drop
            this.dynamicDropTriggered = false;
            this.lastDynamicDropTime = -999;
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

            // Master Analyser (1024 FFT for accurate sub-bass kick isolation)
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 1024;
            this.analyser.smoothingTimeConstant = 0.72;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

            // Master Gain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.isMuted ? 0 : 0.8;

            // Dedicated gain node for full MP3 track (Chaoz Fantasy)
            this.trackGain = this.ctx.createGain();
            this.trackGain.gain.value = 0.92;
            this.trackGain.connect(this.filterNode);

            // SFX Gain (separate from music filter so hits always punch clearly)
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

            // Pre-generate white noise buffer & shared drum filters for snare/hi-hats
            const bufSize = this.ctx.sampleRate * 0.35;
            this.noiseBuffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            this.snareFilter = this.ctx.createBiquadFilter();
            this.snareFilter.type = 'highpass';
            this.snareFilter.frequency.value = 750;
            this.snareFilter.connect(this.stemGains.drums);

            this.hatFilter = this.ctx.createBiquadFilter();
            this.hatFilter.type = 'highpass';
            this.hatFilter.frequency.value = 6500;
            this.hatFilter.connect(this.stemGains.drums);

            this.isInitialized = true;
        }

        /**
         * Schedule a one-shot oscillator envelope and auto-disconnect nodes on end.
         */
        scheduleOsc(type, startFreq, endFreq, startTime, dur, gainPeak, dest, detune = 0) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, startTime);
            if (endFreq !== null && endFreq !== startFreq) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), startTime + dur);
            }
            if (detune) osc.detune.value = detune;

            g.gain.setValueAtTime(gainPeak, startTime);
            g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

            osc.connect(g);
            g.connect(dest);
            osc.onended = () => {
                try { osc.disconnect(); g.disconnect(); } catch (e) {}
            };
            osc.start(startTime);
            osc.stop(startTime + dur + 0.015);
            return osc;
        }

        scheduleNoiseHit(startTime, dur, gainPeak, filterDest) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(gainPeak, startTime);
            g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

            noise.connect(g);
            g.connect(filterDest);
            noise.onended = () => {
                try { noise.disconnect(); g.disconnect(); } catch (e) {}
            };
            noise.start(startTime);
            noise.stop(startTime + dur + 0.015);
        }

        getActiveScale() {
            return TRACK_SCALES[this.currentTrack] || TRACK_SCALES.chaoz;
        }

        async startChaozTrack() {
            if (!this.ctx) return;

            // 1. If already decoded into Web Audio buffer, play directly via BufferSource
            if (this.chaozBuffer) {
                this.stopChaozTrack();
                const src = this.ctx.createBufferSource();
                src.buffer = this.chaozBuffer;
                src.loop = true;
                src.connect(this.trackGain);
                src.start(0);
                this.chaozSource = src;
                this.chaozStartTime = this.ctx.currentTime;
                this.chaozPlaying = true;
                return;
            }

            // 2. Try fetching & decoding into Web Audio API AudioBuffer (works on http/https)
            if (!this.chaozLoading && window.location && window.location.protocol !== 'file:') {
                this.chaozLoading = true;
                try {
                    const res = await fetch(encodeURI(this.chaozUrl));
                    if (res.ok) {
                        const arr = await res.arrayBuffer();
                        this.chaozBuffer = await this.ctx.decodeAudioData(arr);
                        if (this.chaozBuffer && this.chaozBuffer.duration > 10) {
                            this.chaozDuration = this.chaozBuffer.duration;
                        }
                        this.chaozLoading = false;
                        if (this.isPlaying && this.currentTrack === 'chaoz') {
                            this.startChaozTrack();
                        }
                        return;
                    }
                } catch (e) {
                    // Fallback to HTMLAudioElement below
                }
                this.chaozLoading = false;
            }

            // 3. Fallback for local file:// protocol: use HTMLAudioElement
            if (!this.chaozMediaEl && typeof window.Audio !== 'undefined') {
                this.chaozMediaEl = new window.Audio(this.chaozUrl);
                this.chaozMediaEl.loop = true;
                this.chaozMediaEl.volume = this.isMuted ? 0 : 0.78;
                this.chaozMediaEl.addEventListener('loadedmetadata', () => {
                    if (Number.isFinite(this.chaozMediaEl.duration) && this.chaozMediaEl.duration > 10) {
                        this.chaozDuration = this.chaozMediaEl.duration;
                    }
                });
                try {
                    if (window.location && window.location.protocol !== 'file:') {
                        const mediaSrc = this.ctx.createMediaElementSource(this.chaozMediaEl);
                        mediaSrc.connect(this.trackGain);
                    }
                } catch (e) {
                    // Direct element playback if MediaElementSource is restricted
                }
            }

            if (this.chaozMediaEl) {
                this.chaozMediaEl.currentTime = 0;
                this.chaozMediaEl.volume = this.isMuted ? 0 : 0.78;
                this.chaozMediaEl.play().then(() => {
                    this.chaozStartTime = this.ctx ? this.ctx.currentTime : 0;
                    this.chaozPlaying = true;
                }).catch(() => {});
            }
        }

        stopChaozTrack() {
            this.chaozPlaying = false;
            if (this.chaozSource) {
                try {
                    this.chaozSource.stop();
                    this.chaozSource.disconnect();
                } catch (e) {}
                this.chaozSource = null;
            }
            if (this.chaozMediaEl) {
                try {
                    this.chaozMediaEl.pause();
                } catch (e) {}
            }
        }

        startMusic() {
            this.init();
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.stopMusic();
            this.isPlaying = true;
            this.musicElapsed = 0;
            this.beatCount = 0;
            this.buildUpCharge = 0;
            this.dynamicDropTriggered = false;
            this.lastDynamicDropTime = 0;
            this._pauseStartedCtxTime = null;
            this._pausedMediaTime = null;
            this.totalPausedDuration = 0;
            this._isGamePaused = false;

            if (this.currentTrack === 'chaoz') {
                this.startChaozTrack();
            } else if (this.currentTrack === 'suno' && this.hasAnyCustomStems()) {
                this.startCustomStemsSampleAccurate();
            } else {
                this.stepIndex = 0;
                this.totalBarsPlayed = 0;
                this.nextNoteTime = this.ctx.currentTime + 0.04;
                this.schedulerTimer = setInterval(() => this.scheduleProceduralStep(), 25);
            }
        }

        stopMusic() {
            this.isPlaying = false;
            this.buildUpCharge = 0;
            if (this.schedulerTimer) {
                clearInterval(this.schedulerTimer);
                this.schedulerTimer = null;
            }
            this.stopCustomStemSources();
            this.stopChaozTrack();
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

            const startTime = this.ctx.currentTime + 0.05;
            this.customStartTime = startTime;
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
         * and persist raw bytes in IndexedDB so stems survive page reloads.
         */
        async loadCustomStemFile(stemKey, file) {
            this.init();
            const arrayBuffer = await file.arrayBuffer();
            const bufferCopy = arrayBuffer.slice(0);
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.customBuffers[stemKey] = audioBuffer;
            this.customFileNames[stemKey] = file.name;

            saveStemToDB(stemKey, file.name, bufferCopy);

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

        async restoreSavedStems() {
            const records = await loadAllStemsFromDB();
            if (!records.length) return {};
            const restored = {};
            // Decode lazily using a temporary OfflineAudioContext or AudioContext if available
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return {};
            const decoderCtx = this.ctx || new AudioCtx();
            for (const rec of records) {
                if (!STEM_KEYS.includes(rec.key) || !rec.buffer) continue;
                try {
                    const copy = rec.buffer.slice(0);
                    const audioBuffer = await decoderCtx.decodeAudioData(copy);
                    this.customBuffers[rec.key] = audioBuffer;
                    this.customFileNames[rec.key] = rec.name;
                    restored[rec.key] = { name: rec.name, duration: audioBuffer.duration };
                } catch (e) {}
            }
            if (!this.ctx && decoderCtx.close) {
                decoderCtx.close().catch(() => {});
            }
            return restored;
        }

        async clearCustomStems() {
            STEM_KEYS.forEach((k) => {
                this.customBuffers[k] = null;
                this.customFileNames[k] = null;
            });
            this.stopCustomStemSources();
            await clearStemsFromDB();
            if (this.currentTrack === 'suno') {
                this.setTrack('chaoz');
            }
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
                if (!this._isGamePaused) {
                    this._isGamePaused = true;
                    this._pauseStartedCtxTime = this.ctx ? this.ctx.currentTime : 0;
                    if (this.chaozMediaEl && this.chaozPlaying) {
                        this._pausedMediaTime = this.chaozMediaEl.currentTime;
                    }
                }
                freq.exponentialRampToValueAtTime(380, now + 0.18);
                q.linearRampToValueAtTime(4.0, now + 0.18);
                if (this.chaozMediaEl && !this.isMuted) this.chaozMediaEl.volume = 0.25;
            } else if (mode === 'slowmo') {
                if (this._isGamePaused) {
                    this._isGamePaused = false;
                    if (this.ctx && this._pauseStartedCtxTime !== null) {
                        this.totalPausedDuration += Math.max(0, this.ctx.currentTime - this._pauseStartedCtxTime);
                        this._pauseStartedCtxTime = null;
                    }
                    if (this.chaozMediaEl && this.chaozPlaying && this._pausedMediaTime !== null) {
                        try { this.chaozMediaEl.currentTime = this._pausedMediaTime; } catch (e) {}
                        this._pausedMediaTime = null;
                    }
                }
                freq.exponentialRampToValueAtTime(680, now + 0.15);
                q.linearRampToValueAtTime(3.2, now + 0.15);
                if (this.chaozMediaEl && !this.isMuted) this.chaozMediaEl.volume = 0.45;
            } else if (mode === 'damage') {
                // Quick muffled dip then recover
                freq.exponentialRampToValueAtTime(450, now + 0.04);
                freq.exponentialRampToValueAtTime(19500, now + 0.38);
            } else {
                // 'normal'
                if (this._isGamePaused) {
                    this._isGamePaused = false;
                    if (this.ctx && this._pauseStartedCtxTime !== null) {
                        this.totalPausedDuration += Math.max(0, this.ctx.currentTime - this._pauseStartedCtxTime);
                        this._pauseStartedCtxTime = null;
                    }
                    if (this.chaozMediaEl && this.chaozPlaying && this._pausedMediaTime !== null) {
                        try { this.chaozMediaEl.currentTime = this._pausedMediaTime; } catch (e) {}
                        this._pausedMediaTime = null;
                    }
                }
                freq.exponentialRampToValueAtTime(20000, now + 0.2);
                q.linearRampToValueAtTime(1.2, now + 0.2);
                if (this.chaozMediaEl && !this.isMuted) this.chaozMediaEl.volume = 0.78;
            }
        }

        applyMasterMuteState() {
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime);
            }
            if (this.chaozMediaEl) {
                this.chaozMediaEl.volume = this.isMuted ? 0 : 0.78;
            }
        }

        toggleMute() {
            this.init();
            this.isMuted = !this.isMuted;
            this.applyMasterMuteState();
            return this.isMuted;
        }

        setMuted(muted) {
            this.init();
            this.isMuted = !!muted;
            this.applyMasterMuteState();
        }

        suspendForBackground() {
            if (!this.isInitialized) return;
            if (this.ctx && this.ctx.state === 'running') {
                this.ctx.suspend().catch(() => {});
            }
            if (this.chaozMediaEl && !this.chaozMediaEl.paused) {
                this._mediaWasPlayingBeforeHide = true;
                this.chaozMediaEl.pause();
            }
        }

        resumeFromBackground() {
            if (!this.isInitialized) return;
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            if (this.chaozMediaEl && this._mediaWasPlayingBeforeHide && this.isPlaying && this.currentTrack === 'chaoz') {
                this._mediaWasPlayingBeforeHide = false;
                this.chaozMediaEl.play().catch(() => {});
            }
        }

        /**
         * Procedural 4-Stem Lookahead Sequencer (128 Steps = 8 Bars per Phrase Cycle)
         */
        scheduleProceduralStep() {
            if (!this.isPlaying || !this.ctx) return;
            const bpm = this.currentTrack === 'flow' ? 112 : (this.currentTrack === 'cyber' ? 144 : 138);
            const secondsPerStep = 60 / bpm / 4; // 16th note

            while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
                this.triggerProceduralNotes(this.stepIndex, this.nextNoteTime, secondsPerStep);
                this.nextNoteTime += secondsPerStep;
                this.stepIndex = (this.stepIndex + 1) % 128;
                if (this.stepIndex === 0) {
                    this.totalBarsPlayed += 8;
                }
            }
        }

        triggerProceduralNotes(step128, time, stepDur) {
            const isCyber = this.currentTrack === 'cyber';
            const isFlow = this.currentTrack === 'flow';
            const step = step128 % 32;
            const barInPhrase = Math.floor(step128 / 16); // 0..7 (8 bars)
            const isSectionB = barInPhrase >= 4 && barInPhrase <= 5;
            const isBuildUpBar = barInPhrase >= 6; // Bars 6 & 7 (steps 96..127) build up to the drop!

            // Update buildUpCharge for visual & gameplay anticipation
            if (isBuildUpBar) {
                this.buildUpCharge = (step128 - 96) / 32;
            } else {
                this.buildUpCharge = 0;
            }

            // Trigger dynamic drop flag on the downbeat after a full 8-bar cycle!
            if (step128 === 0 && this.totalBarsPlayed > 0) {
                this.dynamicDropTriggered = true;
                this.lastDynamicDropTime = this.musicElapsed;
            }

            // --- STEM 1: DRUMS ---
            if (isBuildUpBar) {
                // Build-up Snare Roll & Riser!
                const buildStep = step128 - 96; // 0..31
                if (buildStep < 16) {
                    // Bar 7: 8th-note snare build + kick pulse
                    if (buildStep % 2 === 0) {
                        this.synthSnare(time, 0.22 + (buildStep / 32) * 0.25);
                        if (buildStep % 4 === 0) {
                            this.synthKick(time);
                            this.beatPulse = 1.0;
                            this.beatCount++;
                        }
                    }
                } else {
                    // Bar 8: Intense 16th-note snare roll escalating into the drop!
                    const rollGain = 0.25 + ((buildStep - 16) / 16) * 0.35;
                    this.synthSnare(time, rollGain);
                    if (buildStep % 2 === 0) {
                        this.beatPulse = 0.85;
                    }
                    if (buildStep === 16) {
                        this.synthRiser(time, stepDur * 15.5);
                    }
                }
            } else if (isFlow) {
                // Midtempo Glitch-Hop / Electro beat: kick on 0, 10, 16, 26; snappy snare on 8 and 24
                if (step === 0 || step === 10 || step === 16 || step === 26) {
                    this.synthKick(time);
                    this.beatPulse = 1.0;
                    this.beatCount++;
                }
                if (step === 8 || step === 24) {
                    this.synthSnare(time, 0.34);
                }
                if (step % 2 === 1 || step % 4 === 2) {
                    this.synthHiHat(time, 0.04);
                }
            } else {
                // 4-on-the-floor Kick, Off-beat Open Hat, Snare on 4 & 12
                if (step % 4 === 0) {
                    this.synthKick(time);
                    this.beatPulse = 1.0;
                    this.beatCount++;
                }
                if (step % 8 === 4) {
                    this.synthSnare(time, 0.32);
                }
                if (step % 2 === 1) {
                    this.synthHiHat(time, step % 4 === 2 ? 0.11 : 0.05);
                }
            }

            // --- STEM 2: BASS ---
            const bassArr = isFlow ? FLOW_BASS : (isCyber ? CYBER_BASS : POPCORN_BASS);
            let bassMidi = bassArr[step];
            if (bassMidi > 0 && !(isBuildUpBar && step128 >= 112)) {
                // Cut sub-bass during final bar of build-up so the drop hits harder
                if (isSectionB) bassMidi += 12; // Octave bass energy in Section B
                const accent = isFlow ? 0.38 : (step % 4 === 2 ? 0.34 : 0.22);
                this.synthBass(time, midiToFreq(bassMidi), stepDur * (isFlow ? 1.2 : 0.85), accent);
            }

            // --- STEM 3: SYNTH ARP ---
            const arpArr = isFlow ? FLOW_ARP : (isCyber ? CYBER_ARP : POPCORN_ARP);
            let arpMidi = arpArr[step];
            if (arpMidi > 0) {
                if (isBuildUpBar && step128 >= 112) arpMidi += 12; // Brighten arp right before drop
                this.synthArp(time, midiToFreq(arpMidi), stepDur * 0.75);
            }

            // --- STEM 4: LEAD MELODY ---
            const leadArr = isSectionB
                ? (isFlow ? FLOW_LEAD_B : (isCyber ? CYBER_LEAD_B : POPCORN_LEAD_B))
                : (isFlow ? FLOW_LEAD : (isCyber ? CYBER_LEAD : POPCORN_LEAD));
            const leadMidi = leadArr[step];
            if (leadMidi > 0) {
                this.synthLead(time, midiToFreq(leadMidi), stepDur * 0.7);
            }
        }

        synthRiser(time, dur) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, time);
            osc.frequency.exponentialRampToValueAtTime(1760, time + dur);

            g.gain.setValueAtTime(0.01, time);
            g.gain.linearRampToValueAtTime(0.18, time + dur * 0.9);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);

            osc.connect(g);
            g.connect(this.stemGains.arp);
            osc.onended = () => {
                try { osc.disconnect(); g.disconnect(); } catch (e) {}
            };
            osc.start(time);
            osc.stop(time + dur + 0.02);
        }

        synthKick(time) {
            this.scheduleOsc('sine', 145, 38, time, 0.2, 0.85, this.stemGains.drums);
        }

        synthSnare(time, gainVal = 0.32) {
            this.scheduleNoiseHit(time, 0.14, gainVal, this.snareFilter);
        }

        synthHiHat(time, dur) {
            this.scheduleNoiseHit(time, dur, 0.14, this.hatFilter);
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
            osc.onended = () => {
                try { osc.disconnect(); filt.disconnect(); g.disconnect(); } catch (e) {}
            };
            osc.start(time);
            osc.stop(time + dur + 0.01);
        }

        synthArp(time, freq, dur) {
            this.scheduleOsc('square', freq, freq, time, dur, 0.13, this.stemGains.arp);
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

            osc1.onended = () => {
                try { osc1.disconnect(); osc2.disconnect(); filt.disconnect(); g.disconnect(); } catch (e) {}
            };
            osc1.start(time);
            osc2.start(time);
            osc1.stop(time + dur + 0.01);
            osc2.stop(time + dur + 0.01);
        }

        // --- Scale-Quantized Harmonic Arcade Sound Effects ---
        playBounce(pitchFactor = 1.0, isCurve = false, isRhythmHit = false) {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const scale = this.getActiveScale();

            // Pick a note from the active track's scale so every rally sounds musical
            let idx = this.scaleCursor % scale.length;
            if (pitchFactor < 0.95) idx = Math.max(0, idx - 2);
            else if (pitchFactor > 1.2) idx = Math.min(scale.length - 1, idx + 2);
            this.scaleCursor = (this.scaleCursor + 1) % scale.length;

            const rootMidi = scale[idx] - 12; // Mid-range punch
            const targetMidi = isCurve ? scale[Math.min(scale.length - 1, idx + 4)] : scale[idx];
            this.scheduleOsc(
                isCurve ? 'sawtooth' : 'triangle',
                midiToFreq(rootMidi),
                midiToFreq(targetMidi),
                now,
                0.08,
                isRhythmHit ? 0.24 : 0.17,
                this.sfxGain
            );

            // If the player hit on the beat, play a shimmering harmonic chord chime!
            if (isRhythmHit) {
                const fifthMidi = scale[(idx + 4) % scale.length];
                const chime = this.scheduleOsc('sine', midiToFreq(fifthMidi), null, now, 0.16, 0.16, this.sfxGain);
                chime.frequency.setValueAtTime(midiToFreq(fifthMidi + 12), now + 0.045);
            }
        }

        playGhostLaunch(isRhythmHit = false) {
            if (!this.isInitialized || this.isMuted) return;
            const scale = this.getActiveScale();
            this.scheduleOsc(
                'sine',
                midiToFreq(scale[0] - 12),
                midiToFreq(scale[0] + (isRhythmHit ? 12 : 7)),
                this.ctx.currentTime,
                0.165,
                0.24,
                this.sfxGain
            );
        }

        playPowerUp() {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const scale = this.getActiveScale();
            const indices = [0, 2, 4, 7];
            indices.forEach((sIdx, i) => {
                const f = midiToFreq(scale[sIdx % scale.length]);
                this.scheduleOsc('triangle', f, f, now + i * 0.045, 0.11, 0.18, this.sfxGain);
            });
        }

        playScoreGoal() {
            if (!this.isInitialized || this.isMuted) return;
            const now = this.ctx.currentTime;
            const scale = this.getActiveScale();
            const osc = this.scheduleOsc('sine', midiToFreq(scale[4]), null, now, 0.18, 0.22, this.sfxGain);
            osc.frequency.setValueAtTime(midiToFreq(scale[7]), now + 0.06);
        }

        playBarrageLaunch(index = 0, total = 10) {
            if (!this.isInitialized || this.isMuted) return;
            const scale = this.getActiveScale();
            const step = Math.min(scale.length - 1, Math.max(0, index % scale.length));
            const octaveBoost = index >= scale.length ? 12 : 0;
            this.scheduleOsc(
                'sawtooth',
                midiToFreq(scale[step] - 12 + octaveBoost),
                midiToFreq(scale[step] + octaveBoost),
                this.ctx.currentTime,
                0.085,
                0.20,
                this.sfxGain
            );
        }

        /**
         * Returns the full duration (seconds) of the active track so matches run for the song length.
         */
        getTrackDuration(fallback = 134) {
            if (this.currentTrack === 'chaoz') {
                return this.chaozDuration || 133.9;
            }
            if (this.currentTrack === 'suno' && this.hasAnyCustomStems()) {
                let maxDur = 0;
                STEM_KEYS.forEach((k) => {
                    if (this.customBuffers[k] && this.customBuffers[k].duration > maxDur) {
                        maxDur = this.customBuffers[k].duration;
                    }
                });
                if (maxDur > 0) {
                    if (maxDur < 45) {
                        const loops = Math.max(2, Math.round(120 / maxDur));
                        return maxDur * loops;
                    }
                    return maxDur;
                }
            }
            return fallback || 134;
        }

        /**
         * Returns the true audible playback time of the current track.
         * Never returns elapsed game time while an audio file is still loading,
         * and stays synchronized across pauses.
         */
        getTrackCurrentTime() {
            if (!this.isPlaying) return 0;
            const livePausedDelta = (this._isGamePaused && this.ctx && this._pauseStartedCtxTime !== null)
                ? Math.max(0, this.ctx.currentTime - this._pauseStartedCtxTime)
                : 0;
            const pausedOffset = this.totalPausedDuration + livePausedDelta;

            if (this.currentTrack === 'chaoz') {
                if (this.chaozMediaEl && this.chaozPlaying && this.chaozMediaEl.currentTime > 0) {
                    return this._isGamePaused && this._pausedMediaTime !== null
                        ? this._pausedMediaTime
                        : this.chaozMediaEl.currentTime;
                }
                if (this.chaozSource && this.chaozPlaying && this.ctx && this.chaozStartTime > 0) {
                    const dur = this.chaozDuration || (this.chaozBuffer ? this.chaozBuffer.duration : 133.9);
                    return Math.max(0, (this.ctx.currentTime - this.chaozStartTime - pausedOffset) % dur);
                }
                return 0; // Still loading buffer — do not advance checkpoints prematurely!
            }
            if (this.currentTrack === 'suno' && this.hasAnyCustomStems() && this.ctx && this.customStartTime > 0) {
                return Math.max(0, this.ctx.currentTime - this.customStartTime - pausedOffset);
            }
            return this.musicElapsed;
        }

        consumeDynamicDrop() {
            if (this.dynamicDropTriggered) {
                this.dynamicDropTriggered = false;
                return true;
            }
            return false;
        }

        playMissPenalty() {
            if (!this.isInitialized || this.isMuted) return;
            this.scheduleOsc('sawtooth', 160, 55, this.ctx.currentTime, 0.185, 0.22, this.sfxGain);
        }

        sumFreqBand(startBin, endBin) {
            let sum = 0;
            for (let i = startBin; i <= endBin; i++) sum += this.freqData[i];
            return sum / ((endBin - startBin + 1) * 255);
        }

        /**
         * Called every animation frame to compute high-res 1024-FFT bass/mid/high energy,
         * adaptive Spectral Flux beat pulses, and build-up/drop anticipation.
         */
        updateAnalysis(dt) {
            this.beatPulse = Math.max(0, this.beatPulse - dt * 4.5);
            this.beatCooldown = Math.max(0, this.beatCooldown - dt);
            if (this.isPlaying && !this._isGamePaused) {
                this.musicElapsed += dt;
            }
            if (!this.isInitialized || !this.analyser) return;

            this.prevBassEnergy = this.bassEnergy;
            this.analyser.getByteFrequencyData(this.freqData);

            // With fftSize = 1024 (48kHz -> 46.875 Hz/bin):
            this.subBassEnergy = this.sumFreqBand(1, 3);   // ~47 Hz - 140 Hz (Kick)
            this.bassEnergy = this.sumFreqBand(1, 6);      // ~47 Hz - 280 Hz (Bass)
            this.midEnergy = this.sumFreqBand(7, 36);      // ~320 Hz - 1.7 kHz (Synths/Snare)
            this.highEnergy = this.sumFreqBand(37, 128);   // ~1.7 kHz - 6.0 kHz (Hi-hats/Risers)

            this.totalEnergy = this.bassEnergy * 0.45 + this.midEnergy * 0.35 + this.highEnergy * 0.20;

            // If playing Chaoz Fantasy via file:// HTMLAudioElement where AnalyserNode may be silent,
            // synthesize accurate 142 BPM beat & phrase energy synced to the track time
            if (
                this.isPlaying &&
                this.currentTrack === 'chaoz' &&
                this.bassEnergy < 0.005 &&
                this.midEnergy < 0.005
            ) {
                const t = this.getTrackCurrentTime();
                const beatPeriod = 60 / 142; // ~0.4225s per beat (142 BPM)
                const beatPhase = (t % beatPeriod) / beatPeriod;
                const kickEnv = Math.pow(Math.max(0, 1 - beatPhase * 2.6), 2);
                const build = Math.min(1, 0.35 + (t / 55) * 0.65);

                this.subBassEnergy = (0.30 + kickEnv * 0.65) * build;
                this.bassEnergy = (0.28 + kickEnv * 0.62) * build;
                this.midEnergy = (0.24 + Math.abs(Math.sin(t * 7.4)) * 0.45) * build;
                this.highEnergy = (0.18 + Math.abs(Math.cos(t * 14.8)) * 0.38) * build;
                this.totalEnergy = this.bassEnergy * 0.45 + this.midEnergy * 0.35 + this.highEnergy * 0.20;

                if (beatPhase < 0.12 && this.beatCooldown <= 0) {
                    this.beatPulse = 1.0;
                    this.beatCooldown = beatPeriod * 0.7;
                    this.beatCount++;
                }
            } else if (this.isPlaying) {
                // Real-time Adaptive Spectral Flux onset/kick detection on decoded audio buffer
                const bassJump = this.bassEnergy - this.prevBassEnergy;
                const adaptiveThreshold = Math.max(0.20, this.avgBassEnergy * 1.18);
                if (
                    (this.subBassEnergy > adaptiveThreshold || this.bassEnergy > adaptiveThreshold) &&
                    bassJump > 0.042 &&
                    this.beatCooldown <= 0
                ) {
                    this.beatPulse = 1.0;
                    this.beatCooldown = 0.21;
                    this.beatCount++;
                }
            }

            // Update rolling averages (approx 1.2s window)
            const avgLerp = Math.min(1, dt * 1.4);
            this.avgBassEnergy += (this.bassEnergy - this.avgBassEnergy) * avgLerp;
            this.avgTotalEnergy += (this.totalEnergy - this.avgTotalEnergy) * avgLerp;

            // Compute Build-up Charge & Dynamic Drop Detection for Chaoz Fantasy and Custom Suno Stems
            if (this.isPlaying) {
                if (this.currentTrack === 'chaoz') {
                    const t = this.getTrackCurrentTime();
                    // Chaoz Fantasy pre-drop build-up windows: 20.4s..24.4s, 56.4s..60.4s, 88.0s..91.8s, 111.0s..115.0s
                    if (t >= 20.4 && t < 24.4) {
                        this.buildUpCharge = (t - 20.4) / 4.0;
                    } else if (t >= 56.4 && t < 60.4) {
                        this.buildUpCharge = (t - 56.4) / 4.0;
                    } else if (t >= 88.0 && t < 91.8) {
                        this.buildUpCharge = (t - 88.0) / 3.8;
                    } else if (t >= 111.0 && t < 115.0) {
                        this.buildUpCharge = (t - 111.0) / 4.0;
                    } else {
                        this.buildUpCharge = Math.max(0, this.buildUpCharge - dt * 3.0);
                    }
                } else if (this.currentTrack === 'suno') {
                    // For custom Suno stems: detect rising high/mid tension and sudden bass/energy drops!
                    const t = this.getTrackCurrentTime();
                    const tensionRatio = (this.midEnergy * 0.5 + this.highEnergy * 0.5) / Math.max(0.12, this.avgTotalEnergy);
                    if (tensionRatio > 1.18 && t - this.lastDynamicDropTime > 14.0) {
                        this.buildUpCharge = Math.min(1, this.buildUpCharge + dt * 0.35);
                    } else {
                        this.buildUpCharge = Math.max(0, this.buildUpCharge - dt * 0.6);
                    }

                    // Trigger dynamic drop when a strong bass & energy surge hits after a build-up (min 20s apart)
                    if (
                        t > 12.0 &&
                        t - this.lastDynamicDropTime >= 20.0 &&
                        this.bassEnergy > Math.max(0.42, this.avgBassEnergy * 1.32) &&
                        this.totalEnergy > Math.max(0.38, this.avgTotalEnergy * 1.24) &&
                        this.beatPulse > 0.8
                    ) {
                        this.dynamicDropTriggered = true;
                        this.lastDynamicDropTime = t;
                        this.buildUpCharge = 0;
                    }
                }
            }

            // Smooth overall musical intensity (0.2 -> 1.0) used to drive Pwong 2 ball escalation
            const instantEnergy = this.bassEnergy * 0.5 + this.midEnergy * 0.35 + this.highEnergy * 0.15;
            const timeRamp = Math.min(1, this.musicElapsed / 60);
            const targetIntensity = Math.min(1, Math.max(0.22, instantEnergy * 0.85 + timeRamp * 0.45));
            this.musicIntensity += (targetIntensity - this.musicIntensity) * Math.min(1, dt * 3.0);
        }
    }

    window.PWONYX.AudioEngine = new AdaptiveAudioEngine();
})();
