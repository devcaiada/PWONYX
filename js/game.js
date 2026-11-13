/**
 * PWONYX - Core Game Engine, Physics, AI, and GPU Canvas 2D Renderer
 * Features:
 * - Delta-time independent physics (60Hz to 144Hz+ native)
 * - Psychedelic Zoom-Feedback Buffer (authentic Pwong 2 visual signature)
 * - Up to 20 simultaneous balls with Magnus Spin/Curve physics
 * - Ghost Paddle launcher, falling Power-Ups, and Dynamic Penalty Scaling
 * - Audio-reactive neon borders, grid, and paddle pulse via Web Audio AnalyserNode
 */
window.PWONYX = window.PWONYX || {};

(function () {
    const CFG = window.PWONYX.CONFIG;
    const Pools = window.PWONYX.Pools;
    const Audio = window.PWONYX.AudioEngine;

    const NEON_BALL_COLORS = [
        '#00f5d4', '#5ce1ff', '#64dfdf', '#a882ff', '#ff5ca8', '#ffd166', '#80ffdb'
    ];

    class PwonyxGame {
        constructor(canvas, callbacks) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d', { alpha: false });
            this.callbacks = callbacks || {};

            // Fixed 4:3 Arena Resolution (preserves authentic Pwong 2 reaction balance)
            this.arenaWidth = CFG.ARENA_WIDTH;   // 1024
            this.arenaHeight = CFG.ARENA_HEIGHT; // 768

            // Full-window Adaptive Viewport (infinite cosmic space without black bars)
            this.viewWidth = this.arenaWidth;
            this.viewHeight = this.arenaHeight;
            this.arenaX = 0;
            this.arenaY = 0;
            this.pixelScale = 1;

            // Persistence layer: Pwong 2-style light trails (Flash BitmapData + fade).
            // Each frame it is darkened a little and balls are drawn as additive
            // segments from their previous position, producing long glowing streaks.
            // Half resolution => cheaper + naturally soft/blurred when upscaled.
            this.trailScale = 0.5;
            this.trailCanvas = document.createElement('canvas');
            this.trailCanvas.width = Math.floor(this.viewWidth * this.trailScale);
            this.trailCanvas.height = Math.floor(this.viewHeight * this.trailScale);
            this.trailCtx = this.trailCanvas.getContext('2d');
            this.trailCtx.fillStyle = '#000';
            this.trailCtx.fillRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
            this.trailFade = 0.075; // fade per 60Hz frame (lower = longer trails)

            // Offscreen half-res canvas for the iconic Pwong 2 psychedelic zoom-feedback effect
            this.fbCanvas = document.createElement('canvas');
            this.fbCanvas.width = Math.floor(this.viewWidth / 2);
            this.fbCanvas.height = Math.floor(this.viewHeight / 2);
            this.fbCtx = this.fbCanvas.getContext('2d');
            this.feedbackMode = 'subtle'; // 'high' | 'subtle' | 'off'

            this.resize();
            if (window.ResizeObserver) {
                new ResizeObserver(() => this.resize()).observe(this.canvas);
            }
            window.addEventListener('resize', () => this.resize());

            // Parallax layers & Transition state (Minimalist Organic Sci-Fi)
            this.parallax = {
                camX: 0,
                camY: 0,
                targetCamX: 0,
                targetCamY: 0,
                mouseOffsetX: 0,
                mouseOffsetY: 0,
                bgX: 0,
                bgY: 0,
                veilX: 0,
                veilY: 0,
                coreX: 0,
                coreY: 0,
                fgX: 0,
                fgY: 0,
                rot3D: 0,
                tiltY: 0,
                lastWakeX: -9999,
                lastWakeY: -9999
            };
            this.menuTime = 0;
            this.menuIntroTimer = 0;
            this.flowClickPulse = 0;
            this.menuPlayHover = 0;
            this.targetMenuPlayHover = false;
            this.menuAmbientRippleTimer = 2.4;
            this.transitionProgress = 0;
            this.transitionTimer = 0;
            this.transitionDuration = 0.78;
            this.pendingModeId = null;
            this.flowParticles = [];
            this.menuRipples = Array.from({ length: 12 }, () => ({
                active: false, x: 0, y: 0, radius: 0, maxRadius: 200,
                life: 0, maxLife: 1, color: '#00f5d4', isCoreAnchored: false
            }));
            this.menuCursorWake = Array.from({ length: 48 }, () => ({
                active: false, x: 0, y: 0, vx: 0, vy: 0,
                size: 2, life: 0, maxLife: 1, phase: 0
            }));
            this.menuOrbitNodes = [
                { tilt: -0.42, rxMul: 1.48, ryMul: 0.42, speed: 0.58, theta: 0.65, color: '#00f5d4', radius: 3.1 },
                { tilt: 0.32, rxMul: 1.76, ryMul: 0.52, speed: -0.38, theta: 3.5, color: '#a6e8ff', radius: 2.5 }
            ];
            this.initFlowParticles();

            // Menu & Parallax image assets (Nano Banana layered plates)
            const loadImg = (src) => {
                const entry = { img: new Image(), loaded: false };
                entry.img.onload = () => { entry.loaded = true; };
                entry.img.src = src;
                return entry;
            };
            this.menuAssets = {
                bg: loadImg('assets/images/menu_bg_deep.jpg'),
                veil: loadImg('assets/images/menu_flow_veil.webp'),
                core: loadImg('assets/images/menu_hero_core.webp')
            };

            // Gameplay abyssal environment assets (cohesive with Nano Banana cover)
            this.arenaAbyssBg = loadImg('assets/images/arena_abyss_bg.jpg');
            this.arenaCaustics = loadImg('assets/images/arena_caustics_overlay.webp');

            // Gameplay widescreen cosmic nebula fallback asset
            this.parallaxBgImg = new Image();
            this.parallaxBgImg.src = 'assets/images/parallax_bg.jpg';
            this.parallaxBgLoaded = false;
            this.parallaxBgImg.onload = () => { this.parallaxBgLoaded = true; };

            // Preload Sci-Fi Power-up Icons
            this.powerupIcons = {
                wide: new Image(),
                slow: new Image(),
                ammo: new Image(),
                sticky: new Image(),
                overdrive: new Image(),
                shield: new Image()
            };
            this.powerupIcons.wide.src = 'assets/icons/powerup-larger.png';
            this.powerupIcons.slow.src = 'assets/icons/powerup-slow.png';
            this.powerupIcons.ammo.src = 'assets/icons/powerup-ammo.png';
            this.powerupIcons.sticky.src = 'assets/icons/powerup-sticky.png';
            this.powerupIcons.overdrive.src = 'assets/icons/powerup-overdrive.png';
            this.powerupIcons.shield.src = 'assets/icons/powerup-shield.png';

            // Pre-allocated Object Pools (Zero GC during gameplay)
            this.balls = new Pools.BallPool(CFG.MAX_BALLS_POOL);
            this.particles = new Pools.ParticlePool(CFG.MAX_PARTICLES);
            this.ghosts = new Pools.GhostPaddlePool(CFG.MAX_GHOSTS_POOL);
            this.powerups = new Pools.PowerUpPool(CFG.MAX_POWERUPS_POOL);
            this.texts = new Pools.FloatingTextPool(CFG.MAX_TEXTS_POOL);

            // State
            this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
            this.mode = CFG.MODES.medium;
            this.upgrades = {
                paddleSize: 0,
                curvePower: 0,
                powerupDuration: 0,
                ghostBooster: 0
            };

            // Match metrics
            this.score = 0;
            this.playerHits = 0;
            this.playerMisses = 0;
            this.aiMisses = 0;
            this.domination = 100; // % rating (for the 97% achievement!)
            this.survivalHealth = 100;
            this.elapsedTime = 0;
            this.matchDuration = this.mode.duration || 134;
            this.progress = 0; // 0 to 100%
            this.targetBallCount = 1;
            this.ballSpawnTimer = 0;
            this.powerupSpawnTimer = 0;
            this.ammoSpawnTimer = 0;
            this.respawnDelayTimer = 0;
            this.screenShake = 0;
            this.chromaticFlash = 0;
            this.goalFlashTop = 0;
            this.shieldFlashBottom = 0;
            this.comboCount = 0;
            this.comboMultiplier = 1.0;
            this.shieldCharges = 0;

            // Ball Barrage State (Climax / Beat-drop stream sequence)
            this.barrageQueue = [];
            this.barrageTimer = 0;
            this.barrageTriggeredCheckpoints = new Set();
            this.isBarrageActive = false;
            this.barrageTotalInCurrentWave = 0;
            this.barrageIndexInCurrentWave = 0;

            // Active temporary buffs
            this.buffs = {
                wide: 0,
                slow: 0,
                sticky: 0,
                overdrive: 0,
                shield: 0
            };

            // Paddles (centered inside the 4:3 arena)
            const initCenterX = this.arenaX + this.arenaWidth / 2;
            this.player = {
                x: initCenterX,
                y: this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET,
                prevX: initCenterX,
                vx: 0,
                smoothVx: 0,
                width: CFG.PADDLE_BASE_WIDTH,
                height: CFG.PADDLE_HEIGHT,
                ghostAmmo: 2,
                maxGhostAmmo: 99,
                distanceTraveled: 0,
                color: '#00f5d4'
            };

            this.opponent = {
                x: initCenterX,
                y: this.arenaY + CFG.PADDLE_Y_OFFSET,
                prevX: initCenterX,
                vx: 0,
                width: CFG.PADDLE_BASE_WIDTH,
                height: CFG.PADDLE_HEIGHT,
                ghostAmmo: 2,
                color: '#ff007f'
            };

            // Input tracking
            this.input = {
                mouseX: initCenterX,
                mouseActive: false,
                left: false,
                right: false,
                p2Left: false,
                p2Right: false
            };

            // Performance telemetry
            this.lastFrameTime = performance.now();
            this.fps = 60;
            this.fpsSmooth = 60;
            this.physicsMs = 0.1;

            this.bindInputs();
            this.seedDemoBackgroundBalls();
            requestAnimationFrame((t) => this.loop(t));
        }

        get width() { return this.viewWidth; }
        get height() { return this.viewHeight; }

        createFlowSprite(stops) {
            const c = document.createElement('canvas');
            c.width = 64;
            c.height = 64;
            const gctx = c.getContext('2d');
            const g = gctx.createRadialGradient(32, 32, 1, 32, 32, 31);
            stops.forEach(([offset, color]) => g.addColorStop(offset, color));
            gctx.fillStyle = g;
            gctx.fillRect(0, 0, 64, 64);
            return c;
        }

        initFlowSprites() {
            this.flowSprites = {
                dark: this.createFlowSprite([
                    [0, 'rgba(2, 7, 13, 1)'],
                    [0.58, 'rgba(5, 14, 24, 0.65)'],
                    [1, 'rgba(5, 14, 24, 0)']
                ]),
                bokeh: this.createFlowSprite([
                    [0, 'rgba(240, 252, 255, 1)'],
                    [0.42, 'rgba(145, 224, 255, 0.45)'],
                    [1, 'rgba(70, 175, 235, 0)']
                ]),
                glow: this.createFlowSprite([
                    [0, 'rgba(150, 228, 255, 1)'],
                    [0.48, 'rgba(65, 165, 225, 0.4)'],
                    [1, 'rgba(25, 95, 155, 0)']
                ])
            };
        }

        pushFlowParticle(layer, factor, speed, spread, waveAmp, waveFreq, rotSpeed, r, alpha, isDark, overrides = {}) {
            const driftAngle = Math.PI * (0.80 + spread);
            this.flowParticles.push(Object.assign({
                layer,
                factor,
                nx: Math.random() * 1.2 - 0.1,
                ny: Math.random() * 1.2 - 0.1,
                vx: Math.cos(driftAngle) * speed,
                vy: Math.sin(driftAngle) * speed,
                waveAmp,
                waveFreq,
                rotSpeed,
                r,
                aspect: 0.55 + Math.random() * 0.4,
                angle: Math.random() * Math.PI,
                alpha,
                phase: Math.random() * Math.PI * 2,
                isDark,
                isBokeh: !isDark
            }, overrides));
        }

        initFlowParticles() {
            this.initFlowSprites();
            this.flowParticles = [];

            // Layer 0: Background space dust & faint cyan bokeh (factor 0.02)
            for (let i = 0; i < 46; i++) {
                this.pushFlowParticle(
                    0, 0.02, 0.018 + Math.random() * 0.028, (Math.random() - 0.5) * 0.28,
                    0.004 + Math.random() * 0.008, 0.8 + Math.random() * 1.2, 0,
                    1.1 + Math.random() * 2.8, 0.12 + Math.random() * 0.28, false,
                    { isBokeh: Math.random() > 0.42 }
                );
            }

            // Layer 1: Midground organic specks & soft bokeh near the core/trail (factor 0.05)
            for (let i = 0; i < 24; i++) {
                const isDark = i < 10;
                this.pushFlowParticle(
                    1, 0.05, 0.036 + Math.random() * 0.045, (Math.random() - 0.5) * 0.24,
                    0.008 + Math.random() * 0.012, 1.0 + Math.random() * 1.4, (Math.random() - 0.5) * 0.45,
                    isDark ? 2.6 + Math.random() * 4.6 : 2.4 + Math.random() * 5.2,
                    isDark ? 0.48 + Math.random() * 0.34 : 0.15 + Math.random() * 0.24, isDark
                );
            }

            // Layer 2: Foreground out-of-focus dark silhouettes & bokeh dust (factor 0.08)
            const fgPresets = [
                { nx: 0.515, ny: 0.22, r: 7.5, aspect: 0.48, angle: 0.65, isDark: true, alpha: 0.78 },
                { nx: 0.735, ny: 0.25, r: 5.5, aspect: 0.62, angle: -0.4, isDark: true, alpha: 0.72 },
                { nx: 0.79, ny: 0.325, r: 6.2, aspect: 0.55, angle: 0.35, isDark: true, alpha: 0.68 },
                { nx: 0.59, ny: 0.10, r: 3.8, aspect: 0.7, angle: 0.2, isDark: true, alpha: 0.52 },
                { nx: 0.81, ny: 0.49, r: 4.2, aspect: 0.65, angle: -0.3, isDark: true, alpha: 0.55 },
                { nx: 0.695, ny: 0.66, r: 6.8, aspect: 0.6, angle: 0.5, isDark: true, alpha: 0.48 },
                { nx: 0.34, ny: 0.67, r: 6.5, aspect: 0.75, angle: -0.2, isDark: false, alpha: 0.25 },
                { nx: 0.24, ny: 0.75, r: 4.5, aspect: 0.85, angle: 0.1, isDark: false, alpha: 0.28 }
            ];
            fgPresets.forEach((p, idx) => {
                this.pushFlowParticle(
                    2, 0.08, 0.055 + (idx % 3) * 0.022, ((idx % 5) - 2) * 0.05,
                    0.01 + (idx % 3) * 0.005, 1.1 + (idx % 4) * 0.25, (idx % 2 === 0 ? 1 : -1) * 0.32,
                    p.r, p.alpha, p.isDark,
                    { nx: p.nx, ny: p.ny, aspect: p.aspect, angle: p.angle, phase: idx * 1.1 }
                );
            });
            for (let i = 0; i < 18; i++) {
                const isDark = i % 3 === 0;
                this.pushFlowParticle(
                    2, 0.08, 0.06 + Math.random() * 0.065, (Math.random() - 0.5) * 0.25,
                    0.01 + Math.random() * 0.014, 1.1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6,
                    isDark ? 3.2 + Math.random() * 5.0 : 3.5 + Math.random() * 7.5,
                    isDark ? 0.42 + Math.random() * 0.35 : 0.12 + Math.random() * 0.22, isDark
                );
            }
        }

        setMenuPlayHover(hovered) {
            this.targetMenuPlayHover = !!hovered;
        }

        resetMenuIntro() {
            this.menuIntroTimer = 0;
            this.transitionProgress = 0;
            this.transitionTimer = 0;
            this.flowClickPulse = 0;
            this.targetMenuPlayHover = false;
            this.menuPlayHover = 0;
        }

        spawnMenuRipple(x, y, maxRadius = 220, color = '#00f5d4', maxLife = 1.15, isCoreAnchored = false) {
            if (!this.menuRipples) return;
            for (let i = 0; i < this.menuRipples.length; i++) {
                const r = this.menuRipples[i];
                if (!r.active) {
                    r.active = true;
                    r.x = x;
                    r.y = y;
                    r.radius = isCoreAnchored ? 24 : 6;
                    r.maxRadius = maxRadius;
                    r.life = maxLife;
                    r.maxLife = maxLife;
                    r.color = color;
                    r.isCoreAnchored = isCoreAnchored;
                    return;
                }
            }
        }

        spawnCursorWakeMote(x, y) {
            if (!this.menuCursorWake) return;
            for (let i = 0; i < this.menuCursorWake.length; i++) {
                const m = this.menuCursorWake[i];
                if (!m.active) {
                    m.active = true;
                    m.x = x + (Math.random() - 0.5) * 10;
                    m.y = y + (Math.random() - 0.5) * 10;
                    m.vx = (Math.random() - 0.5) * 18;
                    m.vy = -10 - Math.random() * 20;
                    m.size = 1.4 + Math.random() * 2.1;
                    m.maxLife = 0.75 + Math.random() * 0.55;
                    m.life = m.maxLife;
                    m.phase = Math.random() * Math.PI * 2;
                    return;
                }
            }
        }

        bindInputs() {
            const updateMousePos = (clientX, clientY) => {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.viewWidth / rect.width;
                const scaleY = this.viewHeight / rect.height;
                this.input.mouseX = (clientX - rect.left) * scaleX;
                this.input.mouseY = (clientY - rect.top) * scaleY;
                this.input.mouseActive = true;

                // Parallax camera normalized from -1 to 1
                const normX = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width - 0.5) * 2));
                const normY = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height - 0.5) * 2));
                this.parallax.targetCamX = normX;
                this.parallax.targetCamY = normY;
                this.parallax.mouseOffsetX = normX * (this.viewWidth * 0.5);
                this.parallax.mouseOffsetY = normY * (this.viewHeight * 0.5);

                if (this.state === 'menu') {
                    const dx = this.input.mouseX - this.parallax.lastWakeX;
                    const dy = this.input.mouseY - this.parallax.lastWakeY;
                    if (dx * dx + dy * dy >= 324) { // every ~18px
                        this.parallax.lastWakeX = this.input.mouseX;
                        this.parallax.lastWakeY = this.input.mouseY;
                        this.spawnCursorWakeMote(this.input.mouseX, this.input.mouseY);
                    }
                }
            };

            this.canvas.addEventListener('mousemove', (e) => {
                updateMousePos(e.clientX, e.clientY);
            });

            const unlockMenuAudio = () => {
                if (!Audio.isPlaying) {
                    Audio.startMusic();
                    Audio.setLowPassEffect('normal');
                    Audio.updateAdaptiveLayers(4);
                    if (this.callbacks.onMenuAudioStarted) {
                        this.callbacks.onMenuAudioStarted();
                    }
                }
                this.flowClickPulse = 1.0;
                this.spawnMenuRipple(this.input.mouseX, this.input.mouseY, 130, '#9ee6ff', 0.85, false);
                this.spawnMenuRipple(0, 0, Math.min(this.viewWidth, this.viewHeight) * 0.36, '#00f5d4', 1.15, true);
            };

            this.canvas.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (this.state === 'playing') {
                    this.fireGhostPaddle('player1');
                } else if (this.state === 'menu') {
                    unlockMenuAudio();
                }
            });

            this.canvas.addEventListener('touchmove', (e) => {
                if (e.touches.length > 0) {
                    e.preventDefault();
                    updateMousePos(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: false });

            this.canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length > 0) {
                    updateMousePos(e.touches[0].clientX, e.touches[0].clientY);
                    if (this.state === 'playing' && e.touches.length >= 2) {
                        this.fireGhostPaddle('player1');
                    } else if (this.state === 'menu') {
                        unlockMenuAudio();
                    }
                }
            }, { passive: true });

            window.addEventListener('keydown', (e) => {
                if (e.code === 'KeyA' || (!this.mode.isTwoPlayer && e.code === 'ArrowLeft')) {
                    this.input.left = true;
                    this.input.mouseActive = false;
                }
                if (e.code === 'KeyD' || (!this.mode.isTwoPlayer && e.code === 'ArrowRight')) {
                    this.input.right = true;
                    this.input.mouseActive = false;
                }
                if (this.mode.isTwoPlayer) {
                    if (e.code === 'ArrowLeft') this.input.p2Left = true;
                    if (e.code === 'ArrowRight') this.input.p2Right = true;
                    if (e.code === 'ArrowDown' || e.code === 'Enter') {
                        if (this.state === 'playing') this.fireGhostPaddle('player2');
                    }
                }
                if (e.code === 'Space' || e.code === 'KeyW' || (!this.mode.isTwoPlayer && e.code === 'ArrowUp')) {
                    if (this.state === 'playing') {
                        e.preventDefault();
                        this.fireGhostPaddle('player1');
                    }
                }
                if (e.code === 'KeyB') {
                    if (this.state === 'playing') {
                        this.triggerBallBarrage(null, 'manual');
                    }
                }
                if (e.code === 'KeyP' || e.code === 'Escape') {
                    if (this.state === 'playing' || this.state === 'paused') {
                        this.togglePause();
                    }
                }
                if (e.code === 'KeyR') {
                    if (this.state === 'playing' || this.state === 'paused') {
                        this.startMatch(this.mode.id);
                    }
                }
                if (e.code === 'KeyM') {
                    if (this.callbacks.onToggleMute) this.callbacks.onToggleMute();
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.input.left = false;
                if (e.code === 'KeyD' || e.code === 'ArrowRight') this.input.right = false;
                if (e.code === 'ArrowLeft') this.input.p2Left = false;
                if (e.code === 'ArrowRight') this.input.p2Right = false;
            });
        }

        setUpgrades(upg) {
            this.upgrades = Object.assign({}, this.upgrades, upg);
            this.recalculatePaddleStats();
        }

        recalculatePaddleStats() {
            const extLevel = this.upgrades.paddleSize || 0;
            const baseW = CFG.PADDLE_BASE_WIDTH + extLevel * 12;
            const wideBonus = this.buffs.wide > 0 ? 1.5 : 1.0;
            this.player.width = Math.min(280, baseW * wideBonus);
            this.opponent.width = this.mode.isTwoPlayer
                ? baseW
                : CFG.PADDLE_BASE_WIDTH + (this.mode.maxBalls > 14 ? 18 : 6);
        }

        seedDemoBackgroundBalls() {
            this.balls.clear();
            this.clearTrails();
            const speed = 340 * CFG.SPEED_SCALE;
            const cx = this.arenaX + this.arenaWidth / 2;
            const cy = this.arenaY + this.arenaHeight / 2;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + 0.3;
                this.balls.spawn(
                    cx + (Math.random() - 0.5) * 180,
                    cy + (Math.random() - 0.5) * 140,
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    NEON_BALL_COLORS[i % NEON_BALL_COLORS.length]
                );
            }
        }

        triggerStartTransition(modeId) {
            if (this.state !== 'menu') return;
            this.state = 'transitioning';
            this.transitionTimer = 0;
            this.transitionDuration = 0.78;
            this.transitionProgress = 0;
            this.pendingModeId = modeId || this.mode.id;
            this.screenShake = 0;
            this.targetMenuPlayHover = false;

            // Audio: Start music and normal filter cleanly without jarring explosion SFX
            Audio.startMusic();
            Audio.setLowPassEffect('normal');
            Audio.playPowerUp();
            this.spawnMenuRipple(0, 0, Math.min(this.viewWidth, this.viewHeight) * 0.42, '#00f5d4', 0.75, true);

            if (this.callbacks.onTransitionStart) {
                this.callbacks.onTransitionStart();
            }
        }

        startMatch(modeId) {
            this.mode = CFG.MODES[modeId] || CFG.MODES.medium;
            this.state = 'playing';
            this.transitionProgress = 0;
            this.transitionTimer = 0;

            this.balls.clear();
            this.particles.clear();
            this.ghosts.clear();
            this.powerups.clear();
            this.texts.clear();

            this.score = 0;
            this.playerHits = 0;
            this.playerMisses = 0;
            this.aiMisses = 0;
            this.domination = 100;
            this.survivalHealth = 100;
            this.elapsedTime = 0;
            this.matchDuration = this.mode.isSurvival
                ? (Audio.getTrackDuration ? Audio.getTrackDuration(134) : 134)
                : (Audio.getTrackDuration ? Audio.getTrackDuration(this.mode.duration) : this.mode.duration);
            this.progress = 0;
            this.targetBallCount = 1;
            this.ballSpawnTimer = 0;
            this.powerupSpawnTimer = (this.mode.specialPowerInterval || 13.0) * 0.45;
            this.ammoSpawnTimer = 2.0; // First single ammo item drops shortly after start!
            this.respawnDelayTimer = 0;
            this.screenShake = 0;
            this.goalFlashTop = 0;
            this.shieldFlashBottom = 0;
            this.comboCount = 0;
            this.comboMultiplier = 1.0;
            this.shieldCharges = 0;

            this.barrageQueue = [];
            this.barrageTimer = 0;
            this.barrageTriggeredCheckpoints = new Set();
            this.isBarrageActive = false;
            this.barrageTotalInCurrentWave = 0;
            this.barrageIndexInCurrentWave = 0;

            this.buffs.wide = 0;
            this.buffs.slow = 0;
            this.buffs.sticky = 0;
            this.buffs.overdrive = 0;
            this.buffs.shield = 0;

            const mastUpgrade = this.upgrades.powerupDuration || 0;
            const baseMaxAmmo = typeof this.mode.maxAmmo === 'number' ? this.mode.maxAmmo : 99;
            const startAmmo = typeof this.mode.startAmmo === 'number' ? this.mode.startAmmo : 2;
            const cx = this.arenaX + this.arenaWidth / 2;
            this.player.x = cx;
            this.player.prevX = cx;
            this.player.smoothVx = 0;
            this.player.y = this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET;
            this.player.distanceTraveled = 0;
            this.player.ghostAmmo = startAmmo;
            this.player.maxGhostAmmo = baseMaxAmmo + mastUpgrade * 10;

            this.opponent.x = cx;
            this.opponent.prevX = cx;
            this.opponent.y = this.arenaY + CFG.PADDLE_Y_OFFSET;
            this.opponent.ghostAmmo = this.mode.isTwoPlayer ? startAmmo : 0;
            this.opponent.maxGhostAmmo = baseMaxAmmo;
            this.versusSpawnToggle = false;

            this.recalculatePaddleStats();

            // Clear feedback canvas
            this.fbCtx.fillStyle = '#05050a';
            this.fbCtx.fillRect(0, 0, this.fbCanvas.width, this.fbCanvas.height);
            this.clearTrails();

            // Spawn first ball from the bottom launching upward (Pwong 2 style)
            this.spawnBallFromBottom();

            // Start adaptive music (defaults to Chaoz Fantasy)
            Audio.startMusic();
            Audio.setLowPassEffect('normal');
            Audio.updateAdaptiveLayers(1);

            if (this.callbacks.onStateChange) {
                this.callbacks.onStateChange(this.state, this.mode);
            }
        }

        togglePause() {
            if (this.state === 'playing') {
                this.state = 'paused';
                Audio.setLowPassEffect('paused');
            } else if (this.state === 'paused') {
                this.state = 'playing';
                Audio.setLowPassEffect(this.buffs.slow > 0 ? 'slowmo' : 'normal');
            }
            if (this.callbacks.onStateChange) {
                this.callbacks.onStateChange(this.state, this.mode);
            }
        }

        getSurvivalBaseSpeed() {
            if (!this.mode.isSurvival) return this.mode.baseBallSpeed;
            const survivalRatio = Math.min(1, this.elapsedTime / 90);
            return 300 + survivalRatio * (this.mode.maxBallSpeed - 300) * 0.75;
        }

        /**
         * Pwong 2-style bottom ball launch: balls emerge from behind the paddle
         * (alternating top/bottom in 2P Versus) and shoot into the arena.
         */
        spawnBallFromBottom(customSpeed = null, customColor = null, customAngle = null, customX = null, fromTop = false) {
            const musicBoost = 1 + (Audio.musicIntensity || 0.25) * 0.16;
            const baseSpeed = this.getSurvivalBaseSpeed();
            const speed = customSpeed !== null ? customSpeed : Math.min(
                this.mode.maxBallSpeed * CFG.SPEED_SCALE,
                baseSpeed * CFG.SPEED_SCALE * musicBoost
            );

            const angleOffset = customAngle !== null ? customAngle : (Math.random() - 0.5) * 0.64; // radians from vertical
            const vx = Math.sin(angleOffset) * speed;
            const dirY = fromTop ? 1 : -1;
            const vy = dirY * Math.abs(Math.cos(angleOffset) * speed);
            const color = customColor || NEON_BALL_COLORS[this.balls.countActive() % NEON_BALL_COLORS.length];

            const launcherPad = fromTop ? this.opponent : this.player;
            const baseX = customX !== null
                ? customX
                : (launcherPad && launcherPad.x
                    ? launcherPad.x + (Math.random() - 0.5) * Math.min(80, launcherPad.width * 0.6)
                    : this.arenaX + this.arenaWidth / 2);
            const spawnX = Math.max(
                this.arenaX + 36,
                Math.min(this.arenaX + this.arenaWidth - 36, baseX)
            );

            let spawnY;
            if (fromTop) {
                const padBottom = this.opponent ? (this.opponent.y + this.opponent.height / 2) : (this.arenaY + CFG.PADDLE_Y_OFFSET + 7);
                spawnY = Math.min(this.arenaY + this.arenaHeight - 16, padBottom + CFG.BALL_RADIUS + 6);
            } else {
                const padTop = this.player ? (this.player.y - this.player.height / 2) : (this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET - 7);
                spawnY = Math.max(this.arenaY + 16, padTop - CFG.BALL_RADIUS - 6);
            }

            const b = this.balls.spawn(spawnX, spawnY, vx, vy, color);
            if (b) {
                this.particles.shockwave(spawnX, spawnY, color, 44);
                this.particles.burst(spawnX, spawnY, 14, color, 60, 220, 3.2);

                for (let p = 0; p < 6; p++) {
                    this.particles.spawn(
                        spawnX + (Math.random() - 0.5) * 8,
                        spawnY,
                        (Math.random() - 0.5) * 50,
                        dirY * (90 + Math.random() * 140),
                        color,
                        3.0,
                        0.32
                    );
                }
            }
            return b;
        }

        /**
         * Climax Ball Barrage (Carreira de Bolinhas):
         * Queues a rapid-fire succession of neon rainbow balls launched from behind the paddle,
         * accompanied by screen shake, chromatic flashes, particle flares, and ascending laser SFX.
         */
        triggerBallBarrage(count = null, reason = 'climax') {
            const barrageCount = count || (
                this.mode.id === 'easy' ? 6 :
                this.mode.id === 'medium' ? 8 :
                this.mode.id === 'hard' ? 10 :
                12
            );

            this.isBarrageActive = true;
            this.barrageTotalInCurrentWave = barrageCount;
            this.barrageIndexInCurrentWave = 0;
            this.barrageTimer = 0;

            // Escalate targetBallCount so the arena embraces the barrage balls
            this.targetBallCount = Math.min(
                this.mode.maxBalls,
                Math.max(this.targetBallCount, this.balls.countActive() + Math.min(6, barrageCount))
            );

            const barrageColors = [
                '#00f5d4', // Cyan
                '#00bbf9', // Electric Sky
                '#fee440', // Golden Yellow
                '#f15bb5', // Hot Pink
                '#ff007f', // Rose Neon
                '#9b5de5', // Electric Purple
                '#70e000', // Acid Lime
                '#ff9e00', // Sun Orange
                '#ff5400', // Hyper Coral
                '#e0aaff', // Violet Pastel
                '#00f5d4',
                '#fee440'
            ];

            this.barrageQueue = [];
            const baseSpeed = this.getSurvivalBaseSpeed();
            const launchSpeed = Math.min(
                this.mode.maxBallSpeed * CFG.SPEED_SCALE * 0.96,
                Math.max(360, baseSpeed * CFG.SPEED_SCALE * 1.15)
            );

            for (let i = 0; i < barrageCount; i++) {
                const t = barrageCount > 1 ? i / (barrageCount - 1) : 0.5;
                const fanAngle = (t - 0.5) * 0.68 + (Math.random() - 0.5) * 0.12;
                const xSpread = (t - 0.5) * Math.min(110, this.player.width * 0.75);
                const speed = launchSpeed + (Math.random() - 0.5) * 45;
                const color = barrageColors[i % barrageColors.length];

                this.barrageQueue.push({
                    delay: i === 0 ? 0 : 0.085, // 85ms between each ball in the rapid-fire stream
                    color: color,
                    speed: speed,
                    angle: fanAngle,
                    xSpread: xSpread,
                    index: i
                });
            }

            // Visual "Show de Luzes" fanfare:
            this.screenShake = 8;
            this.chromaticFlash = 1.0;
            this.texts.spawn(
                this.arenaX + this.arenaWidth / 2,
                this.arenaY + this.arenaHeight * 0.40,
                '⚡ CARREIRA DE BOLINHAS! ⚡',
                '#00f5d4',
                22,
                1.5
            );
            this.texts.spawn(
                this.arenaX + this.arenaWidth / 2,
                this.arenaY + this.arenaHeight * 0.40 + 32,
                '★ SHOW DE LUZES • CLÍMAX ★',
                '#fee440',
                15,
                1.3
            );

            // Initial shockwave and particle blast at launcher
            const padX = this.player ? this.player.x : this.arenaX + this.arenaWidth / 2;
            const launchY = this.player ? (this.player.y - this.player.height / 2 - 8) : (this.arenaY + this.arenaHeight - 48);
            this.particles.shockwave(padX, launchY, '#00f5d4', 85);
            this.particles.burst(padX, launchY, 28, '#ffd166', 100, 320, 4);

            if (Audio && Audio.playScoreGoal) {
                Audio.playScoreGoal();
            }
        }

        releaseStuckBall(b) {
            if (!b || !b.active) return;
            b.stuckTimer = 0;
            const baseSpd = b.savedSpeed || (this.mode.baseBallSpeed * CFG.SPEED_SCALE);
            const launchSpd = Math.min(this.mode.maxBallSpeed * CFG.SPEED_SCALE * 1.12, baseSpd * 1.15);

            // Aim away from the opponent paddle toward the open flank of the arena
            const arenaMid = this.arenaX + this.arenaWidth / 2;
            const aimRight = this.opponent.x <= arenaMid;
            const targetX = aimRight ? (this.arenaX + this.arenaWidth * 0.82) : (this.arenaX + this.arenaWidth * 0.18);
            const dx = targetX - b.x;
            const dy = (this.arenaY + 20) - b.y;
            const rawAngle = Math.atan2(dx, -dy);
            const clampedAngle = Math.max(-0.92, Math.min(0.92, rawAngle));

            b.vx = Math.sin(clampedAngle) * launchSpd;
            b.vy = -Math.abs(Math.cos(clampedAngle) * launchSpd);
            const curveUpgrade = 1 + (this.upgrades.curvePower || 0) * 0.18;
            b.spin = (aimRight ? -260 : 260) * curveUpgrade;
            b.isCurvedShot = true;
            b.y = this.player.y - this.player.height / 2 - b.radius - 2;

            this.particles.shockwave(b.x, b.y, '#ff4da6', 44);
            this.particles.burst(b.x, b.y, 14, '#ff4da6', 70, 220, 3);
            Audio.playBounce(1.3, true, true);
        }

        releaseAllStuckBalls() {
            let released = 0;
            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (b.active && b.stuckTimer > 0) {
                    this.releaseStuckBall(b);
                    released++;
                }
            }
            return released > 0;
        }

        fireGhostPaddle(owner) {
            const isP1 = owner === 'player1';
            if (isP1 && this.releaseAllStuckBalls()) {
                return;
            }
            const pad = isP1 ? this.player : this.opponent;
            if (pad.ghostAmmo <= 0) return;

            pad.ghostAmmo--;
            const isOnBeat = isP1 && (Audio.beatPulse || 0) >= 0.42;
            const boostLevel = this.upgrades.ghostBooster || 0;
            const ghostWidth = pad.width * (1.05 + boostLevel * 0.06 + (isOnBeat ? 0.12 : 0));
            const hits = 1 + Math.floor((boostLevel + 1) / 2);
            const vy = (isP1 ? -380 : 380) * (isOnBeat ? 1.15 : 1.0);
            const color = isP1 ? (isOnBeat ? '#ffd166' : '#00f5d4') : '#ff007f';

            this.ghosts.spawn(pad.x, pad.y + (isP1 ? -14 : 14), vy, ghostWidth, hits, owner, color);
            this.particles.burst(pad.x, pad.y, isOnBeat ? 22 : 16, color, 50, 190, 3);
            if (isOnBeat) {
                this.particles.shockwave(pad.x, pad.y - 10, '#ffd166', 55);
                const bonus = Math.round(10 * this.mode.scoreMultiplier);
                this.score += bonus;
                this.texts.spawn(pad.x, pad.y - 28, `🎵 BEAT LAUNCH! +${bonus}`, '#ffd166', 13, 0.75);
            }
            Audio.playGhostLaunch(isOnBeat);
        }

        loop(now) {
            requestAnimationFrame((t) => this.loop(t));

            const rawDt = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;
            const dt = Math.min(Math.max(rawDt, 0), 0.05); // clamp max delta time

            if (rawDt > 0) {
                this.fps = 1 / rawDt;
                this.fpsSmooth = this.fpsSmooth * 0.92 + this.fps * 0.08;
            }

            const t0 = performance.now();
            Audio.updateAnalysis(dt);

            if (this.state === 'playing') {
                this.updateGameplay(dt);
            } else if (this.state === 'menu') {
                this.updateMenuParallax(dt);
            } else if (this.state === 'transitioning') {
                this.updateTransition(dt);
            }
            this.physicsMs = performance.now() - t0;

            this.render(dt);
        }

        advanceFlowParticles(dt, speedMul = 1) {
            if (!this.flowParticles) return;
            for (let i = 0; i < this.flowParticles.length; i++) {
                const p = this.flowParticles[i];
                const wave = Math.sin(this.menuTime * (p.waveFreq || 1) + p.phase) * (p.waveAmp || 0.006);
                p.nx += p.vx * dt * speedMul;
                p.ny += (p.vy * speedMul + wave) * dt;
                if (p.rotSpeed) {
                    p.angle = (p.angle || 0) + p.rotSpeed * dt * speedMul;
                }
                if (p.nx < -0.14) p.nx = 1.14;
                if (p.nx > 1.14) p.nx = -0.14;
                if (p.ny < -0.14) p.ny = 1.14;
                if (p.ny > 1.14) p.ny = -0.14;
            }
        }

        updateMenuEffects(dt, kickEnergy, speedBoost = 1) {
            if (this.menuOrbitNodes) {
                const orbitRate = speedBoost * (1 + this.menuPlayHover * 0.85 + kickEnergy * 0.45);
                for (let i = 0; i < this.menuOrbitNodes.length; i++) {
                    this.menuOrbitNodes[i].theta += this.menuOrbitNodes[i].speed * orbitRate * dt;
                }
            }

            if (this.menuRipples) {
                for (let i = 0; i < this.menuRipples.length; i++) {
                    const r = this.menuRipples[i];
                    if (!r.active) continue;
                    r.life -= dt;
                    if (r.life <= 0) {
                        r.active = false;
                        continue;
                    }
                    const p = 1 - r.life / r.maxLife;
                    const ease = 1 - Math.pow(1 - p, 3);
                    r.radius = 18 + ease * r.maxRadius;
                }
            }

            if (this.menuCursorWake) {
                for (let i = 0; i < this.menuCursorWake.length; i++) {
                    const m = this.menuCursorWake[i];
                    if (!m.active) continue;
                    m.life -= dt;
                    if (m.life <= 0) {
                        m.active = false;
                        continue;
                    }
                    m.x += (m.vx + Math.sin(this.menuTime * 3 + m.phase) * 10) * dt;
                    m.y += m.vy * dt;
                }
            }
        }

        updateMenuParallax(dt) {
            this.menuTime += dt;
            this.menuIntroTimer = Math.min(2.0, this.menuIntroTimer + dt);
            if (this.flowClickPulse > 0) {
                this.flowClickPulse = Math.max(0, this.flowClickPulse - dt * 2.2);
            }

            const hoverTarget = this.targetMenuPlayHover ? 1 : 0;
            this.menuPlayHover += (hoverTarget - this.menuPlayHover) * (1 - Math.exp(-8.5 * dt));

            // Hybrid camera: subtle ambient figure-8 breath blended with mouse coordinates
            const idleNormX = Math.sin(this.menuTime * 0.42) * 0.16;
            const idleNormY = Math.cos(this.menuTime * 0.31) * 0.12;
            const camNormX = Math.max(-1.1, Math.min(1.1, this.parallax.targetCamX + idleNormX));
            const camNormY = Math.max(-1.1, Math.min(1.1, this.parallax.targetCamY + idleNormY));
            const offX = camNormX * (this.viewWidth * 0.5);
            const offY = camNormY * (this.viewHeight * 0.5);

            const damp = 1 - Math.exp(-6.2 * dt);
            const dampTilt = 1 - Math.exp(-4.8 * dt);

            // 5 distinct parallax planes (0.018 -> 0.048 -> 0.082 -> 0.135)
            this.parallax.bgX += (offX * 0.018 - this.parallax.bgX) * damp;
            this.parallax.bgY += (offY * 0.018 - this.parallax.bgY) * damp;

            this.parallax.veilX += (offX * 0.048 - this.parallax.veilX) * damp;
            this.parallax.veilY += (offY * 0.048 - this.parallax.veilY) * damp;

            this.parallax.coreX += (offX * 0.082 - this.parallax.coreX) * damp;
            this.parallax.coreY += (offY * 0.082 - this.parallax.coreY) * damp;

            this.parallax.fgX += (offX * 0.135 - this.parallax.fgX) * damp;
            this.parallax.fgY += (offY * 0.135 - this.parallax.fgY) * damp;

            this.parallax.rot3D += (camNormX * 0.16 - this.parallax.rot3D) * dampTilt;
            this.parallax.tiltY += (camNormY * 0.10 - this.parallax.tiltY) * dampTilt;

            this.parallax.camX += (camNormX - this.parallax.camX) * damp;
            this.parallax.camY += (camNormY - this.parallax.camY) * damp;

            // Subtle inverse parallax shift on DOM title/play block so it floats in front
            const menuCenter = document.getElementById('flow-menu-center');
            if (menuCenter && this.state === 'menu') {
                const tx = (-this.parallax.coreX * 0.28).toFixed(2);
                const ty = (-this.parallax.coreY * 0.28).toFixed(2);
                menuCenter.style.setProperty('--menu-px', `${tx}px`);
                menuCenter.style.setProperty('--menu-py', `${ty}px`);
            }

            // Periodic soft breathing pulse ripple from core
            this.menuAmbientRippleTimer -= dt;
            if (this.menuAmbientRippleTimer <= 0) {
                this.menuAmbientRippleTimer = this.targetMenuPlayHover ? 2.1 : 4.1;
                this.spawnMenuRipple(
                    0, 0,
                    Math.min(this.viewWidth, this.viewHeight) * 0.30,
                    this.targetMenuPlayHover ? '#00f5d4' : '#7fd8ff',
                    1.35,
                    true
                );
            }

            const bass = Audio.bassEnergy || 0;
            const beat = Audio.beatPulse || 0;
            const kickEnergy = Math.max(bass * 1.1, beat * 0.85) + (this.flowClickPulse || 0) * 0.45;
            this.updateMenuEffects(dt, kickEnergy, 1);

            this.advanceFlowParticles(dt, 1 + this.menuPlayHover * 0.45);
            this.updateParticles(dt);
        }

        updateTransition(dt) {
            this.menuTime += dt;
            this.transitionTimer += dt;
            this.transitionProgress = Math.min(1, this.transitionTimer / this.transitionDuration);

            // Smoothly return parallax offsets to 0 so the central core converges to exact arena center
            const decay = Math.pow(0.03, dt);
            this.parallax.bgX *= decay;
            this.parallax.bgY *= decay;
            this.parallax.veilX *= decay;
            this.parallax.veilY *= decay;
            this.parallax.coreX *= decay;
            this.parallax.coreY *= decay;
            this.parallax.fgX *= decay;
            this.parallax.fgY *= decay;
            this.parallax.rot3D *= decay;
            this.parallax.tiltY *= decay;

            this.updateMenuEffects(dt, 0.4, 1 + this.transitionProgress * 4.5);
            this.advanceFlowParticles(dt, 1 + this.transitionProgress * 2.2);
            this.updateParticles(dt);

            if (this.transitionProgress >= 1) {
                this.startMatch(this.pendingModeId || this.mode.id);
            }
        }

        updateGameplay(dt) {
            this.elapsedTime += dt;
            this.screenShake = Math.max(0, this.screenShake - dt * 25);
            this.chromaticFlash = Math.max(0, this.chromaticFlash - dt * 3);
            this.goalFlashTop = Math.max(0, this.goalFlashTop - dt * 2.8);
            this.shieldFlashBottom = Math.max(0, this.shieldFlashBottom - dt * 2.2);
            if (this.respawnDelayTimer > 0) {
                this.respawnDelayTimer = Math.max(0, this.respawnDelayTimer - dt);
            }
            this.menuTime += dt;
            this.advanceFlowParticles(dt, 0.35);

            // Sync match duration to current track length (Chaoz Fantasy ~133.9s or loaded audio)
            const liveDuration = (Audio && Audio.getTrackDuration)
                ? Audio.getTrackDuration(this.matchDuration || this.mode.duration || 134)
                : (this.matchDuration || this.mode.duration || 134);
            this.matchDuration = liveDuration;

            // Match progress bar
            if (this.mode.isSurvival) {
                this.progress = Math.min(100, (this.elapsedTime / this.matchDuration) * 100);
            } else {
                this.progress = Math.min(100, (this.elapsedTime / this.matchDuration) * 100);
                if (this.progress >= 100) {
                    this.finishMatch(true);
                    return;
                }
            }

            // Update temporary buffs
            const hadWide = this.buffs.wide > 0;
            const hadSlow = this.buffs.slow > 0;
            const hadSticky = this.buffs.sticky > 0;
            const hadShield = this.buffs.shield > 0;
            for (const k in this.buffs) {
                if (this.buffs[k] > 0) {
                    this.buffs[k] = Math.max(0, this.buffs[k] - dt);
                }
            }
            if (hadWide && this.buffs.wide === 0) {
                this.recalculatePaddleStats();
            }
            if (hadSlow && this.buffs.slow === 0) {
                Audio.setLowPassEffect('normal');
            }
            if (hadSticky && this.buffs.sticky === 0) {
                this.releaseAllStuckBalls();
            }
            if (hadShield && this.buffs.shield === 0) {
                this.shieldCharges = 0;
            }

            // Escalate target ball count in sync with the music intensity & beat pulses (up to 20 balls!)
            const musicIntensity = Audio.musicIntensity || 0.35;
            const beatPulse = Audio.beatPulse || 0;
            const effectiveSpawnInterval = Math.max(
                1.4,
                this.mode.spawnInterval * (1.16 - musicIntensity * 0.45)
            );
            this.ballSpawnTimer += dt * (0.85 + musicIntensity * 0.45);

            // Trigger new ball on the beat once timer reaches interval (or immediately after short grace window)
            if (
                this.targetBallCount < this.mode.maxBalls &&
                this.ballSpawnTimer >= effectiveSpawnInterval &&
                (beatPulse > 0.35 || this.ballSpawnTimer >= effectiveSpawnInterval + 0.38)
            ) {
                this.ballSpawnTimer = 0;
                this.targetBallCount++;
                this.texts.spawn(
                    this.arenaX + this.arenaWidth / 2,
                    this.arenaY + this.arenaHeight / 2 - 36,
                    `BALL SWARM: ${this.targetBallCount}x!`,
                    '#fee440',
                    18,
                    1.1
                );
            }

            // Process sequential barrage queue (Carreira de Bolinhas)
            if (this.barrageQueue.length > 0) {
                this.barrageTimer -= dt;
                if (this.barrageTimer <= 0) {
                    const item = this.barrageQueue.shift();
                    this.barrageTimer = item.delay || 0.085;
                    this.barrageIndexInCurrentWave++;

                    const spawnX = this.player ? (this.player.x + item.xSpread) : (this.arenaX + this.arenaWidth / 2);
                    const b = this.spawnBallFromBottom(item.speed, item.color, item.angle, spawnX);
                    if (b) {
                        this.chromaticFlash = Math.max(this.chromaticFlash, 0.45);
                        this.particles.shockwave(b.x, b.y, item.color, 46);
                        this.particles.burst(b.x, b.y, 16, item.color, 70, 240, 3.4);

                        // Luminous vertical thruster plume
                        for (let p = 0; p < 7; p++) {
                            this.particles.spawn(
                                b.x + (Math.random() - 0.5) * 10,
                                b.y + 4,
                                (Math.random() - 0.5) * 45,
                                -80 - Math.random() * 150,
                                item.color,
                                3.2,
                                0.35
                            );
                        }

                        if (Audio && Audio.playBarrageLaunch) {
                            Audio.playBarrageLaunch(item.index, this.barrageTotalInCurrentWave);
                        }
                    }
                }
            } else {
                this.isBarrageActive = false;
            }

            // Music Climax Checkpoint & Dynamic Drop Detection:
            // 1. In Chaoz Fantasy, use true audible track time so loading latency never desyncs drops!
            // 2. In Procedural tracks (8-bar build-up & drop) or Custom Suno Stems (FFT energy drop),
            //    consume dynamic drops directly from the AudioEngine.
            const trackTime = Audio.getTrackCurrentTime ? Audio.getTrackCurrentTime() : 0;
            const chaozPlayhead = Audio.currentTrack === 'chaoz'
                ? (trackTime > 0 ? trackTime : (Audio.isMuted ? this.elapsedTime : 0))
                : trackTime;

            if (Audio.currentTrack === 'chaoz') {
                if (chaozPlayhead >= 24.4 && !this.barrageTriggeredCheckpoints.has('drop_1')) {
                    this.barrageTriggeredCheckpoints.add('drop_1');
                    this.triggerBallBarrage(null, 'drop_1');
                } else if (chaozPlayhead >= 60.4 && !this.barrageTriggeredCheckpoints.has('drop_2')) {
                    this.barrageTriggeredCheckpoints.add('drop_2');
                    this.triggerBallBarrage(null, 'drop_2');
                } else if (chaozPlayhead >= 91.8 && !this.barrageTriggeredCheckpoints.has('drop_3')) {
                    this.barrageTriggeredCheckpoints.add('drop_3');
                    this.triggerBallBarrage(null, 'drop_3');
                } else if (chaozPlayhead >= 115.0 && !this.barrageTriggeredCheckpoints.has('drop_4')) {
                    this.barrageTriggeredCheckpoints.add('drop_4');
                    this.triggerBallBarrage(this.mode.isSurvival ? 12 : null, 'drop_4');
                }
            } else if (Audio.consumeDynamicDrop && Audio.consumeDynamicDrop()) {
                this.triggerBallBarrage(null, 'dynamic_drop');
            }

            // Ensure active balls match targetBallCount (alternating top/bottom in 2P Versus mode)
            // Only refill when not actively launching a barrage sequence and respawn grace timer has elapsed
            const activeBallCount = this.balls.countActive();
            if (activeBallCount < this.targetBallCount && this.barrageQueue.length === 0 && this.respawnDelayTimer <= 0) {
                const fromTop = this.mode.isTwoPlayer ? (this.versusSpawnToggle = !this.versusSpawnToggle) : false;
                this.spawnBallFromBottom(null, null, null, null, fromTop);
            }

            // Update 4-Stem Audio Engine with current active ball count
            const currentBalls = this.balls.countActive();
            Audio.updateAdaptiveLayers(currentBalls);

            // Unlock swarm achievements
            if (currentBalls >= 10 && this.callbacks.onAchievement) {
                this.callbacks.onAchievement('swarm_10');
            }
            if (currentBalls >= 20 && this.callbacks.onAchievement) {
                this.callbacks.onAchievement('chaos_20');
            }

            // --- Update Player 1 Paddle ---
            this.player.prevX = this.player.x;
            const keySpeed = 900;
            if (this.input.mouseActive) {
                // Ultra-responsive 1:1 mouse tracking matching classic Pwong 2
                const diff = this.input.mouseX - this.player.x;
                this.player.x += diff * Math.min(1, dt * 68);
            } else {
                if (this.input.left) this.player.x -= keySpeed * dt;
                if (this.input.right) this.player.x += keySpeed * dt;
            }

            // Clamp Player 1 within arena bounds
            const halfP1 = this.player.width / 2;
            this.player.x = Math.max(this.arenaX + halfP1 + 8, Math.min(this.arenaX + this.arenaWidth - halfP1 - 8, this.player.x));
            const movedPx = Math.abs(this.player.x - this.player.prevX);
            const rawVx = (this.player.x - this.player.prevX) / Math.max(dt, 0.001);
            this.player.vx = rawVx;
            const vxAlpha = Math.min(1, dt * 16);
            this.player.smoothVx = (this.player.smoothVx || 0) * (1 - vxAlpha) + rawVx * vxAlpha;
            this.player.distanceTraveled += movedPx;

            if (this.player.distanceTraveled >= 50000 && this.callbacks.onAchievement) {
                this.callbacks.onAchievement('marathon_50k');
            }

            // --- Update Top Paddle (AI or Player 2) ---
            this.opponent.prevX = this.opponent.x;
            if (this.mode.isTwoPlayer) {
                if (this.input.p2Left) this.opponent.x -= keySpeed * dt;
                if (this.input.p2Right) this.opponent.x += keySpeed * dt;
            } else {
                this.updateAIPaddle(dt);
            }
            const halfP2 = this.opponent.width / 2;
            this.opponent.x = Math.max(this.arenaX + halfP2 + 8, Math.min(this.arenaX + this.arenaWidth - halfP2 - 8, this.opponent.x));
            this.opponent.vx = (this.opponent.x - this.opponent.prevX) / Math.max(dt, 0.001);

            // --- Spawn Power-Ups & Ghost Ammo Orbs ---
            // Strictly 1 item at a time (never 3 simultaneously).
            // Early levels/easy mode: falls more frequently (shorter timer).
            // Harder levels/later progress: drops are spaced out with longer intervals.
            const mastLevel = this.upgrades.powerupDuration || 0;
            const freqMult = 1 - mastLevel * 0.06;
            const baseAmmoInterval = this.mode.ammoSpawnInterval || 4.5;
            const progressRatio = this.mode.isSurvival
                ? Math.min(1, this.elapsedTime / 90)
                : Math.min(1, this.progress / 100);

            this.ammoSpawnTimer -= dt;
            if (this.ammoSpawnTimer <= 0 && (beatPulse > 0.35 || this.ammoSpawnTimer <= -0.32)) {
                // Quantized to the musical beat! Next single ammo drop timer: short in easy mode, long in hard/insane
                const intervalScale = 1 + progressRatio * 0.42;
                this.ammoSpawnTimer = (baseAmmoInterval * intervalScale + Math.random() * 1.6) * freqMult;

                // Spawn strictly 1 single ammo item at a time (in 2P Versus, spawn mid-court going toward P1 or P2)
                const spawnX = this.arenaX + 80 + Math.random() * (this.arenaWidth - 160);
                const toP2 = this.mode.isTwoPlayer && Math.random() < 0.5;
                const spawnY = this.mode.isTwoPlayer ? (this.arenaY + this.arenaHeight * 0.5) : (this.arenaY + 70);
                const vy = (toP2 ? -1 : 1) * (115 + Math.random() * 40);
                this.powerups.spawn(spawnX, spawnY, vy, 'ammo');
                this.particles.shockwave(spawnX, spawnY, '#00f5d4', 32);
            }

            // Special power-ups (wide / slow / sticky / overdrive / shield):
            // Strictly 1 orb falling at a time, while allowing up to 2 simultaneous active buffs.
            this.powerupSpawnTimer -= dt;
            if (this.powerupSpawnTimer <= 0 && (beatPulse > 0.35 || this.powerupSpawnTimer <= -0.32)) {
                const activeBuffCount =
                    (this.buffs.wide > 0 ? 1 : 0) +
                    (this.buffs.slow > 0 ? 1 : 0) +
                    (this.buffs.sticky > 0 ? 1 : 0) +
                    (this.buffs.overdrive > 0 ? 1 : 0) +
                    (this.buffs.shield > 0 ? 1 : 0);
                let specialFalling = false;
                for (let i = 0; i < this.powerups.size; i++) {
                    const q = this.powerups.items[i];
                    if (q.active && q.type !== 'ammo') { specialFalling = true; break; }
                }
                if (specialFalling || activeBuffCount >= 2) {
                    this.powerupSpawnTimer = 3.5; // re-check shortly
                } else {
                    const baseSpecialInterval = this.mode.specialPowerInterval || 13.0;
                    this.powerupSpawnTimer = (baseSpecialInterval * (0.85 + progressRatio * 0.25) + Math.random() * 3.0) * freqMult;

                    // Ensure ammo drop doesn't happen at the exact same instant
                    if (this.ammoSpawnTimer < 2.2) {
                        this.ammoSpawnTimer = 2.2 + Math.random() * 1.2;
                    }

                    const candidateTypes = this.mode.isTwoPlayer
                        ? ['wide', 'slow', 'sticky', 'overdrive']
                        : ['wide', 'slow', 'sticky', 'overdrive', 'shield'];
                    const availableTypes = candidateTypes.filter(t => !(this.buffs[t] > 0));
                    const poolTypes = availableTypes.length > 0 ? availableTypes : candidateTypes;
                    const pick = poolTypes[Math.floor(Math.random() * poolTypes.length)];
                    const toP2 = this.mode.isTwoPlayer && Math.random() < 0.5;
                    const spawnY = this.mode.isTwoPlayer ? (this.arenaY + this.arenaHeight * 0.5) : (this.arenaY + 75);
                    const vy = (toP2 ? -1 : 1) * (115 + Math.random() * 35);
                    this.powerups.spawn(
                        this.arenaX + 90 + Math.random() * (this.arenaWidth - 180),
                        spawnY,
                        vy,
                        pick
                    );
                }
            }

            // --- Update Ghost Paddles ---
            for (let i = 0; i < this.ghosts.size; i++) {
                const g = this.ghosts.items[i];
                if (!g.active) continue;
                g.y += g.vy * dt;
                if (g.y < this.arenaY + 45 || g.y > this.arenaY + this.arenaHeight - 45 || g.hitsRemaining <= 0) {
                    g.active = false;
                }
            }

            // --- Update Falling Powerups ---
            for (let i = 0; i < this.powerups.size; i++) {
                const p = this.powerups.items[i];
                if (!p.active) continue;
                p.pulse += dt * 6;
                p.x += p.vx * dt;
                p.y += p.vy * dt;

                if (p.x < this.arenaX + 25 || p.x > this.arenaX + this.arenaWidth - 25) p.vx *= -1;

                // Check collection by Player 1, Player 2 (2P), or ascending Ghost Paddles (Pwong 2 sniping)
                if (
                    Math.abs(p.y - this.player.y) <= p.radius + this.player.height &&
                    Math.abs(p.x - this.player.x) <= halfP1 + p.radius
                ) {
                    this.collectPowerUp(p, 'player1');
                    p.active = false;
                } else if (
                    this.mode.isTwoPlayer &&
                    Math.abs(p.y - this.opponent.y) <= p.radius + this.opponent.height &&
                    Math.abs(p.x - this.opponent.x) <= halfP2 + p.radius
                ) {
                    this.collectPowerUp(p, 'player2');
                    p.active = false;
                } else {
                    for (let gIdx = 0; gIdx < this.ghosts.size; gIdx++) {
                        const g = this.ghosts.items[gIdx];
                        if (!g.active) continue;
                        if (
                            Math.abs(p.y - g.y) <= p.radius + g.height &&
                            Math.abs(p.x - g.x) <= g.width / 2 + p.radius
                        ) {
                            this.collectPowerUp(p, g.owner);
                            p.active = false;
                            break;
                        }
                    }
                    if (p.active && (p.y > this.arenaY + this.arenaHeight + 20 || p.y < this.arenaY - 20)) {
                        p.active = false;
                    }
                }
            }

            // --- Update Balls (True Anti-Tunneling Sub-Stepping + Damped Magnus Physics) ---
            const slowMult = this.buffs.slow > 0 ? 0.54 : 1.0;
            const curveUpgrade = 1 + (this.upgrades.curvePower || 0) * 0.18;
            const maxAllowedSpeed = this.mode.maxBallSpeed * CFG.SPEED_SCALE * 1.15;

            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (!b.active) continue;

                b.px = b.x;
                b.py = b.y;

                // Sticky Magnet Latch: holds ball briefly on Player 1 paddle, then auto-launches (or fires early on click/Space)
                if (b.stuckTimer > 0) {
                    b.stuckTimer -= dt;
                    b.x = Math.max(
                        this.arenaX + 10 + b.radius,
                        Math.min(this.arenaX + this.arenaWidth - 10 - b.radius, this.player.x + (b.stuckOffsetX || 0))
                    );
                    b.y = this.player.y - this.player.height / 2 - b.radius - 2;
                    if (b.stuckTimer <= 0) {
                        this.releaseStuckBall(b);
                    }
                    continue;
                }

                // Magnet/Sticky buff pulls incoming downward balls slightly toward player paddle X
                if (this.buffs.sticky > 0 && b.vy > 0 && b.y > this.arenaY + this.arenaHeight * 0.42) {
                    const pull = (this.player.x - b.x) * 3.6;
                    b.vx += pull * dt;
                }

                // Determine sub-steps based on travel distance so fast balls never tunnel past thin paddles
                const totalTravel = Math.hypot(b.vx, b.vy) * dt * slowMult;
                const subSteps = Math.max(1, Math.min(6, Math.ceil(totalTravel / 10)));
                const subDt = dt / subSteps;

                for (let step = 0; step < subSteps && b.active; step++) {
                    // Magnus Curve (Spin) effect in flight with realistic air decay
                    if (Math.abs(b.spin) > 0.01) {
                        b.vx += b.spin * subDt * slowMult;
                        b.spin *= Math.pow(0.55, subDt);
                    }

                    // Clamp total speed so spin acceleration never exceeds physical limits
                    const curSpd = Math.hypot(b.vx, b.vy);
                    if (curSpd > maxAllowedSpeed) {
                        const scale = maxAllowedSpeed / curSpd;
                        b.vx *= scale;
                        b.vy *= scale;
                    }

                    // Prevent shallow horizontal bounce loops by enforcing >= 42% vertical velocity
                    const spdNow = Math.hypot(b.vx, b.vy);
                    if (spdNow > 1) {
                        const minVy = spdNow * 0.42;
                        if (Math.abs(b.vy) < minVy) {
                            const dirY = b.vy >= 0 ? 1 : -1;
                            const dirX = b.vx >= 0 ? 1 : -1;
                            b.vy = dirY * minVy;
                            b.vx = dirX * Math.sqrt(Math.max(0, spdNow * spdNow - minVy * minVy));
                        }
                    }

                    b.x += b.vx * subDt * slowMult;
                    b.y += b.vy * subDt * slowMult;

                    // Left / Right Arena Wall Bounce (with spin dampening)
                    if (b.x - b.radius < this.arenaX + 6) {
                        b.x = this.arenaX + 6 + b.radius;
                        b.vx = Math.abs(b.vx);
                        b.spin *= -0.5;
                        this.particles.burst(b.x, b.y, 6, b.color, 40, 140, 2);
                        Audio.playBounce(0.9, false);
                    } else if (b.x + b.radius > this.arenaX + this.arenaWidth - 6) {
                        b.x = this.arenaX + this.arenaWidth - 6 - b.radius;
                        b.vx = -Math.abs(b.vx);
                        b.spin *= -0.5;
                        this.particles.burst(b.x, b.y, 6, b.color, 40, 140, 2);
                        Audio.playBounce(0.9, false);
                    }

                    // Ghost Paddle Interception
                    for (let gIdx = 0; gIdx < this.ghosts.size; gIdx++) {
                        const g = this.ghosts.items[gIdx];
                        if (!g.active) continue;
                        if (g.owner === 'player1' && b.vy > 0 && this.interceptBallWithGhost(b, g, -1, '#00f5d4', 'GHOST SAVE!')) {
                            if (this.callbacks.onGhostIntercept) this.callbacks.onGhostIntercept();
                            break;
                        }
                        if (g.owner === 'player2' && b.vy < 0 && this.interceptBallWithGhost(b, g, 1, '#ff007f', null)) {
                            break;
                        }
                    }

                    // Player 1 (Bottom) Paddle Collision
                    const p1Top = this.player.y - this.player.height / 2;
                    if (
                        b.vy > 0 &&
                        b.y + b.radius >= p1Top &&
                        b.y - b.radius <= this.player.y + this.player.height &&
                        Math.abs(b.x - this.player.x) <= halfP1 + b.radius + 4
                    ) {
                        this.handlePaddleBounce(b, this.player, -1, curveUpgrade);
                        this.playerHits++;
                        if (b.stuckTimer > 0) break;
                    }

                    // Opponent (Top) Paddle Collision
                    const p2Bottom = this.opponent.y + this.opponent.height / 2;
                    if (
                        b.vy < 0 &&
                        b.y - b.radius <= p2Bottom &&
                        b.y + b.radius >= this.opponent.y - this.opponent.height &&
                        Math.abs(b.x - this.opponent.x) <= halfP2 + b.radius + 4
                    ) {
                        this.handlePaddleBounce(b, this.opponent, 1, 1.0);
                    }

                    // Abyssal Aegis Shield interception along bottom defense line (1P modes)
                    if (
                        !this.mode.isTwoPlayer &&
                        this.buffs.shield > 0 &&
                        this.shieldCharges > 0 &&
                        b.vy > 0 &&
                        b.y + b.radius >= this.arenaY + this.arenaHeight - 10
                    ) {
                        b.y = this.arenaY + this.arenaHeight - 10 - b.radius;
                        b.vy = -Math.abs(b.vy) * 1.04;
                        this.shieldCharges--;
                        this.shieldFlashBottom = 1.0;
                        this.particles.shockwave(b.x, this.arenaY + this.arenaHeight - 8, '#2ec4b6', 54);
                        this.particles.burst(b.x, this.arenaY + this.arenaHeight - 8, 16, '#2ec4b6', 70, 230, 3.2);
                        this.texts.spawn(
                            Math.max(this.arenaX + 60, Math.min(this.arenaX + this.arenaWidth - 60, b.x)),
                            this.arenaY + this.arenaHeight - 30,
                            this.shieldCharges > 0 ? `AEGIS! (${this.shieldCharges})` : 'AEGIS QUEBRADA!',
                            '#2ec4b6',
                            13,
                            0.75
                        );
                        Audio.playBounce(1.22, false, true);
                        if (this.shieldCharges <= 0) {
                            this.buffs.shield = 0;
                        }
                        break;
                    }

                    // --- Check Goal Scored at Top or Ball Missed at Bottom ---
                    const topGoalHit = this.mode.isTwoPlayer
                        ? (b.y < this.arenaY - b.radius)
                        : (b.vy < 0 && b.y - b.radius <= this.arenaY + 8);
                    if (topGoalHit) {
                        this.handleGoalScored(b);
                    } else if (b.y > this.arenaY + this.arenaHeight + b.radius) {
                        if (this.handlePlayerMissed(b, currentBalls)) return;
                    }
                }
            }

            this.updateParticles(dt);
            this.updateFloatingTexts(dt);
        }

        interceptBallWithGhost(ball, ghost, normalDirY, color, label) {
            if (
                Math.abs(ball.y - ghost.y) > ball.radius + ghost.height ||
                Math.abs(ball.x - ghost.x) > ghost.width / 2 + ball.radius
            ) {
                return false;
            }
            ball.vy = normalDirY * Math.abs(ball.vy) * 1.06;
            ball.y = ghost.y + normalDirY * (ghost.height + ball.radius);
            ghost.hitsRemaining--;
            this.particles.shockwave(ball.x, ball.y, color, 42);
            if (label) {
                this.particles.burst(ball.x, ball.y, 14, color, 70, 230, 3);
                this.texts.spawn(ball.x, ball.y, label, color, 13, 0.7);
            }
            Audio.playBounce(1.35, false);
            return true;
        }

        handleGoalScored(b) {
            this.aiMisses++;
            const overdriveMult = this.buffs.overdrive > 0 ? 2 : 1;
            const curveBonus = b.isCurvedShot ? 1.5 : 1.0;
            const comboMult = this.comboMultiplier || 1;
            const pts = Math.round(28 * this.mode.scoreMultiplier * overdriveMult * curveBonus * comboMult);
            this.score += pts;
            this.goalFlashTop = 1.0;

            if (this.mode.isSurvival) {
                this.survivalHealth = Math.min(100, this.survivalHealth + 2.5);
            }

            const fxX = Math.max(this.arenaX + 50, Math.min(this.arenaX + this.arenaWidth - 50, b.x));
            this.particles.burst(b.x, this.arenaY + 12, 22, '#00f5d4', 80, 280, 3.5);
            this.particles.shockwave(b.x, this.arenaY + 12, '#00f5d4', 65);
            this.texts.spawn(
                fxX,
                this.arenaY + 38,
                b.isCurvedShot ? `+${pts} CURVE!` : `+${pts}`,
                b.isCurvedShot ? '#ffd166' : '#00f5d4',
                16,
                0.85
            );
            Audio.playScoreGoal();

            if (b.isCurvedShot && this.callbacks.onCurveGoal) {
                this.callbacks.onCurveGoal();
            }

            // In 1P modes, top goal barrier rebounds the ball into play so rallies keep escalating
            const activeCount = this.balls.countActive();
            const cap = Math.max(this.targetBallCount, this.isBarrageActive ? this.mode.maxBalls : this.targetBallCount);
            if (!this.mode.isTwoPlayer && activeCount <= cap) {
                b.y = this.arenaY + 8 + b.radius + 1;
                const boost = 0.94 + Math.random() * 0.08;
                b.vx *= 0.98;
                b.vy = Math.abs(b.vy) * boost;
                b.spin *= 0.6;
                b.isCurvedShot = false;
                const spd = Math.hypot(b.vx, b.vy);
                const minVy = spd * 0.42;
                if (b.vy < minVy) {
                    b.vy = minVy;
                    b.vx = Math.sign(b.vx || 1) * Math.sqrt(Math.max(0, spd * spd - minVy * minVy));
                }
            } else {
                b.active = false;
            }

            this.updateDominationRating();
        }

        handlePlayerMissed(b, currentBalls) {
            b.active = false;
            this.playerMisses++;
            this.respawnDelayTimer = 0.42;

            // Combo partially decays on miss instead of zeroing out harshly in multi-ball chaos
            this.comboCount = Math.floor((this.comboCount || 0) * 0.4);
            this.comboMultiplier = Math.min(4.0, 1 + Math.floor(this.comboCount / 5) * 0.25);

            // Pwong 2 Dynamic Penalty Scaling:
            // The more balls on screen, the less an individual miss penalizes you!
            const activeNow = Math.max(1, this.balls.countActive() + 1);
            const scaleFactor = 1 / Math.pow(activeNow, 0.65);
            const rawPenalty = Math.max(3, Math.round(32 * scaleFactor * this.mode.scoreMultiplier));
            this.score = Math.max(0, this.score - rawPenalty);

            this.screenShake = Math.min(10, 4 + 8 * scaleFactor);
            this.chromaticFlash = 0.7;
            const fxX = Math.max(this.arenaX + 50, Math.min(this.arenaX + this.arenaWidth - 50, b.x));
            this.particles.burst(b.x, this.arenaY + this.arenaHeight - 10, 20, '#ff0055', 70, 250, 3.5);
            this.texts.spawn(fxX, this.arenaY + this.arenaHeight - 38, `-${rawPenalty}`, '#ff0055', 16, 0.8);
            Audio.playMissPenalty();

            if (this.mode.isSurvival) {
                const hpLoss = 14 * scaleFactor;
                this.survivalHealth = Math.max(0, this.survivalHealth - hpLoss);
                if (this.survivalHealth <= 0) {
                    this.finishMatch(false);
                    return true;
                }
            }

            this.updateDominationRating();
            return false;
        }

        handlePaddleBounce(ball, paddle, dirY, curveMult) {
            const halfW = paddle.width / 2;
            const relIntersect = Math.max(-1, Math.min(1, (ball.x - paddle.x) / halfW));

            // Check if player hit on the musical beat!
            const isRhythmHit = dirY < 0 && (Audio.beatPulse || 0) >= 0.45;
            const beatSpeedBoost = isRhythmHit ? 1.065 : 1.035;

            if (dirY < 0) {
                this.comboCount = (this.comboCount || 0) + 1;
                this.comboMultiplier = Math.min(4.0, 1 + Math.floor(this.comboCount / 5) * 0.25);
                const overdriveMult = this.buffs.overdrive > 0 ? 2 : 1;
                const defPts = Math.max(2, Math.round(5 * this.mode.scoreMultiplier * this.comboMultiplier * overdriveMult));
                this.score += defPts;
            }

            // Current speed scales slightly up to mode.maxBallSpeed
            const currentSpeed = Math.hypot(ball.vx, ball.vy);

            // Sticky/Magnet latch on Player 1 paddle for aimed counter-shots
            if (dirY < 0 && this.buffs.sticky > 0) {
                ball.stuckTimer = 0.16;
                ball.stuckOffsetX = Math.max(-halfW * 0.85, Math.min(halfW * 0.85, ball.x - paddle.x));
                ball.savedSpeed = currentSpeed;
                ball.vx = 0;
                ball.vy = 0;
                ball.spin = 0;
                ball.y = paddle.y - paddle.height / 2 - ball.radius - 2;
                this.particles.burst(ball.x, ball.y, 12, '#ff4da6', 50, 180, 2.8);
                Audio.playBounce(1.08, false, isRhythmHit);
                return;
            }

            const nextSpeed = Math.min(this.mode.maxBallSpeed * CFG.SPEED_SCALE, currentSpeed * beatSpeedBoost);
            const padVx = dirY < 0 ? (paddle.smoothVx ?? paddle.vx) : paddle.vx;

            // Bounce angle up to 62 degrees at paddle extremes
            const bounceAngle = relIntersect * (Math.PI * 0.34);
            ball.vx = Math.sin(bounceAngle) * nextSpeed + padVx * 0.22;
            ball.vy = Math.cos(bounceAngle) * nextSpeed * dirY;

            // Enforce minimum 42% vertical velocity so bounces always stay lively
            const postSpd = Math.hypot(ball.vx, ball.vy);
            if (postSpd > 1) {
                const minVy = postSpd * 0.42;
                if (Math.abs(ball.vy) < minVy) {
                    ball.vy = dirY * minVy;
                    ball.vx = Math.sign(ball.vx || relIntersect || 1) * Math.sqrt(Math.max(0, postSpd * postSpd - minVy * minVy));
                }
            }

            // Impart Magnus Spin from paddle movement + edge hit
            const spinInput = (-padVx * 0.65 + relIntersect * 220) * curveMult;
            ball.spin = Math.max(-650, Math.min(650, spinInput));
            ball.isCurvedShot = dirY < 0 && Math.abs(ball.spin) > 240;

            ball.y = dirY < 0
                ? paddle.y - paddle.height / 2 - ball.radius - 1
                : paddle.y + paddle.height / 2 + ball.radius + 1;

            const sparkColor = ball.isCurvedShot ? '#ffd166' : (isRhythmHit ? '#00f5d4' : paddle.color);
            this.particles.burst(ball.x, ball.y, (ball.isCurvedShot || isRhythmHit) ? 18 : 10, sparkColor, 60, 230, 3.2);

            if (isRhythmHit) {
                const overdriveMult = this.buffs.overdrive > 0 ? 2 : 1;
                const rhythmPts = Math.max(5, Math.round(8 * this.mode.scoreMultiplier * overdriveMult * (this.comboMultiplier || 1)));
                this.score += rhythmPts;
                this.particles.shockwave(ball.x, ball.y, '#ffd166', 48);
                // Throttle floating text slightly when many balls bounce on the same frame
                if (!this._lastRhythmTextTime || this.elapsedTime - this._lastRhythmTextTime > 0.28) {
                    this._lastRhythmTextTime = this.elapsedTime;
                    this.texts.spawn(
                        ball.x,
                        ball.y - 18,
                        ball.isCurvedShot ? `🎵 RHYTHM CURVE! +${rhythmPts}` : `🎵 RHYTHM! +${rhythmPts}`,
                        '#ffd166',
                        13,
                        0.68
                    );
                }
            }

            Audio.playBounce(dirY < 0 ? 1.15 : 0.95, ball.isCurvedShot, isRhythmHit);
        }

        updateAIPaddle(dt) {
            // Find the most urgent upward-traveling ball heading toward AI paddle
            let bestBall = null;
            let shortestTime = Infinity;

            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (!b.active || b.vy >= 0) continue;
                const timeToReach = (b.y - this.opponent.y) / Math.abs(b.vy);
                if (timeToReach < shortestTime) {
                    shortestTime = timeToReach;
                    bestBall = b;
                }
            }

            let aiSpeed = this.mode.aiSpeed;
            let aiReaction = this.mode.aiReaction;
            if (this.mode.isSurvival) {
                const survivalRatio = Math.min(1, this.elapsedTime / 90);
                aiSpeed = 330 + survivalRatio * 380;
                aiReaction = 0.72 + survivalRatio * 0.25;
            }

            let targetX = this.arenaX + this.arenaWidth / 2;
            if (bestBall) {
                // Predict slightly ahead with AI reaction factor
                targetX = bestBall.x + bestBall.vx * shortestTime * 0.35 * aiReaction;
            }

            const diff = targetX - this.opponent.x;
            const maxStep = aiSpeed * CFG.SPEED_SCALE * dt;
            if (Math.abs(diff) <= maxStep) {
                this.opponent.x = targetX;
            } else {
                this.opponent.x += Math.sign(diff) * maxStep;
            }
        }

        /**
         * Returns the amount of Ghost Ammo granted per pickup (+10 per item collected).
         */
        getCurrentAmmoPickupAmount() {
            return typeof this.mode.ammoPerPickup === 'number' ? this.mode.ammoPerPickup : 10;
        }

        collectPowerUp(p, collector = 'player1') {
            const mastLevel = this.upgrades.powerupDuration || 0;
            const durMult = 1 + mastLevel * 0.15;
            const def = CFG.POWERUPS[p.type] || CFG.POWERUPS.ammo;
            const targetPad = collector === 'player2' ? this.opponent : this.player;

            this.particles.shockwave(p.x, p.y, def.color, 60);
            this.particles.burst(p.x, p.y, 20, def.color, 70, 240, 3.5);
            Audio.playPowerUp();

            if (p.type === 'ammo') {
                const gain = this.getCurrentAmmoPickupAmount();
                const maxAmmo = targetPad.maxGhostAmmo || 99;
                targetPad.ghostAmmo = Math.min(maxAmmo, targetPad.ghostAmmo + gain);
                this.texts.spawn(p.x, p.y + (collector === 'player2' ? 18 : -16), `+${gain} GHOST AMMO!`, def.color, 16, 1.0);
            } else {
                this.texts.spawn(p.x, p.y + (collector === 'player2' ? 18 : -16), def.label, def.color, 16, 1.0);
                if (p.type === 'wide') {
                    this.buffs.wide = def.baseDuration * durMult;
                    this.recalculatePaddleStats();
                } else if (p.type === 'slow') {
                    this.buffs.slow = def.baseDuration * durMult;
                    Audio.setLowPassEffect('slowmo');
                } else if (p.type === 'sticky') {
                    this.buffs.sticky = def.baseDuration * durMult;
                } else if (p.type === 'overdrive') {
                    this.buffs.overdrive = def.baseDuration * durMult;
                } else if (p.type === 'shield') {
                    this.buffs.shield = def.baseDuration * durMult;
                    this.shieldCharges = 2 + ((this.upgrades.ghostBooster || 0) >= 4 ? 1 : 0);
                    this.shieldFlashBottom = 1.0;
                }
            }

            if (p.type !== 'ammo' && this.callbacks.onPowerUpCollected) {
                this.callbacks.onPowerUpCollected(p.type);
            }
        }

        updateDominationRating() {
            const totalEvents = this.playerHits + this.aiMisses + this.playerMisses;
            if (totalEvents === 0) {
                this.domination = 100;
            } else {
                const positive = this.playerHits + this.aiMisses * 2;
                const total = positive + this.playerMisses * 1.5;
                this.domination = Math.max(0, Math.min(100, Math.round((positive / total) * 100)));
            }
        }

        updateParticles(dt) {
            for (let i = 0; i < this.particles.size; i++) {
                const p = this.particles.items[i];
                if (!p.active) continue;
                p.life -= dt;
                if (p.life <= 0) {
                    p.active = false;
                    continue;
                }
                if (p.type === 'spark') {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vx *= 0.96;
                    p.vy *= 0.96;
                }
            }
        }

        updateFloatingTexts(dt) {
            for (let i = 0; i < this.texts.size; i++) {
                const t = this.texts.items[i];
                if (!t.active) continue;
                t.life -= dt;
                if (t.life <= 0) {
                    t.active = false;
                    continue;
                }
                t.y += t.vy * dt;
            }
        }

        finishMatch(completedFullTime) {
            this.state = 'gameover';
            Audio.setLowPassEffect('paused');

            // Calculate rank & earned credits
            const creditsEarned = Math.max(25, Math.round(this.score * 0.45 + (completedFullTime ? 80 * this.mode.scoreMultiplier : 20)));
            let rank = 'ROOKIE';
            if (this.domination >= 97) rank = 'GRANDMASTER (97%+)';
            else if (this.domination >= 90) rank = 'MASTER';
            else if (this.domination >= 80) rank = 'PRO';
            else if (this.domination >= 65) rank = 'ADEPT';

            if (this.callbacks.onMatchEnd) {
                this.callbacks.onMatchEnd({
                    mode: this.mode,
                    score: this.score,
                    creditsEarned,
                    domination: this.domination,
                    rank,
                    completedFullTime,
                    distanceTraveled: Math.round(this.player.distanceTraveled),
                    maxBallsReached: this.targetBallCount
                });
            }
        }

        // =====================================================================
        // GPU-ACCELERATED CANVAS 2D RENDERER + PSYCHEDELIC ZOOM FEEDBACK
        // =====================================================================
        resize() {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.round(rect.width * dpr);
            const h = Math.round(rect.height * dpr);
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
            }

            // Fixed 4:3 Arena dimensions (authentic Pwong 2 gameplay balance)
            this.arenaWidth = CFG.ARENA_WIDTH;   // 1024
            this.arenaHeight = CFG.ARENA_HEIGHT; // 768

            // Screen aspect ratio
            const screenAspect = rect.width / rect.height;
            const arenaAspect = this.arenaWidth / this.arenaHeight; // 4/3

            if (screenAspect >= arenaAspect) {
                // Landscape / Widescreen: arena fills height, background expands infinitely horizontally
                this.viewHeight = this.arenaHeight;
                this.viewWidth = this.arenaHeight * screenAspect;
                this.arenaX = (this.viewWidth - this.arenaWidth) / 2;
                this.arenaY = 0;
            } else {
                // Portrait / Narrow screens: arena fills width, background expands vertically
                this.viewWidth = this.arenaWidth;
                this.viewHeight = this.arenaWidth / screenAspect;
                this.arenaX = 0;
                this.arenaY = (this.viewHeight - this.arenaHeight) / 2;
            }

            this.pixelScale = w / this.viewWidth;

            // Resize persistence trail layer if dimensions changed
            if (this.trailCanvas) {
                const targetTrailW = Math.max(10, Math.floor(this.viewWidth * this.trailScale));
                const targetTrailH = Math.max(10, Math.floor(this.viewHeight * this.trailScale));
                if (this.trailCanvas.width !== targetTrailW || this.trailCanvas.height !== targetTrailH) {
                    this.trailCanvas.width = targetTrailW;
                    this.trailCanvas.height = targetTrailH;
                    this.clearTrails();
                }
            }

            // Resize zoom-feedback canvas if dimensions changed
            if (this.fbCanvas) {
                const targetFbW = Math.max(10, Math.floor(this.viewWidth / 2));
                const targetFbH = Math.max(10, Math.floor(this.viewHeight / 2));
                if (this.fbCanvas.width !== targetFbW || this.fbCanvas.height !== targetFbH) {
                    this.fbCanvas.width = targetFbW;
                    this.fbCanvas.height = targetFbH;
                    if (this.fbCtx) {
                        this.fbCtx.fillStyle = '#05050a';
                        this.fbCtx.fillRect(0, 0, targetFbW, targetFbH);
                    }
                }
            }
        }

        clearTrails() {
            const t = this.trailCtx;
            t.setTransform(1, 0, 0, 1, 0, 0);
            t.globalCompositeOperation = 'source-over';
            t.globalAlpha = 1;
            t.fillStyle = '#000';
            t.fillRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
        }

        /**
         * Pwong 2-style persistence trails: fade the layer a bit, then draw every
         * ball as an additive segment from its previous to its current position.
         */
        updateTrailLayer(dt) {
            const t = this.trailCtx;
            const s = this.trailScale;
            const frames = Math.max(0.25, dt * 60);
            const fade = 1 - Math.pow(1 - this.trailFade, frames); // same length at 60/144Hz

            t.setTransform(1, 0, 0, 1, 0, 0);
            t.globalCompositeOperation = 'source-over';
            t.globalAlpha = 1;
            t.fillStyle = `rgba(0, 0, 0, ${fade})`;
            t.fillRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);

            t.setTransform(s, 0, 0, s, 0, 0);
            t.globalCompositeOperation = 'lighter';
            t.lineCap = 'round';

            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (!b.active) continue;
                const color = b.isCurvedShot ? '#fee440' : b.color;
                const px = b.px === undefined ? b.x : b.px;
                const py = b.py === undefined ? b.y : b.py;

                t.strokeStyle = color;
                // Wide soft halo
                t.globalAlpha = 0.28;
                t.lineWidth = b.radius * 3.4;
                t.beginPath();
                t.moveTo(px, py);
                t.lineTo(b.x + 0.01, b.y);
                t.stroke();
                // Bright core
                t.globalAlpha = 0.85;
                t.lineWidth = b.radius * 1.5;
                t.beginPath();
                t.moveTo(px, py);
                t.lineTo(b.x + 0.01, b.y);
                t.stroke();
            }

            // Paddles leave a light smear too
            t.globalAlpha = 0.22;
            const pads = [this.player, this.opponent];
            for (let i = 0; i < 2; i++) {
                const p = pads[i];
                t.fillStyle = p.color;
                t.fillRect(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
            }

            // Sparks are drawn into the trail layer so they streak as well
            for (let i = 0; i < this.particles.size; i++) {
                const p = this.particles.items[i];
                if (!p.active || p.type !== 'spark') continue;
                t.globalAlpha = Math.max(0, p.life / p.maxLife);
                t.fillStyle = p.color;
                t.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }

            t.globalAlpha = 1;
            t.globalCompositeOperation = 'source-over';
        }

        renderFlowParticleLayer(ctx, layerIndex, offsetX, offsetY, vw, vh, time, kickEnergy, fadeAlpha = 1) {
            if (!this.flowParticles || !this.flowSprites) return;
            ctx.save();
            const dimScale = Math.min(vw, vh) / 768;
            for (let i = 0; i < this.flowParticles.length; i++) {
                const p = this.flowParticles[i];
                if (p.layer !== layerIndex) continue;

                const px = p.nx * vw - offsetX;
                const py = p.ny * vh - offsetY;
                const r = Math.max(0.5, p.r * dimScale);
                const twinkle = 0.78 + 0.22 * Math.sin(time * 1.7 + p.phase);
                const alpha = Math.min(1, p.alpha * twinkle * fadeAlpha);

                if (p.isDark) {
                    const aspect = p.aspect || 0.65;
                    const angle = (p.angle || 0) + time * 0.08;
                    const size = r * 2.7;
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.rotate(angle);
                    ctx.scale(1, aspect);
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(this.flowSprites.dark, -size * 0.5, -size * 0.5, size, size);
                    ctx.restore();
                } else {
                    const boost = layerIndex === 2 ? kickEnergy * 0.18 : 0;
                    const sprite = p.isBokeh ? this.flowSprites.bokeh : this.flowSprites.glow;
                    const size = r * 4.4;
                    ctx.globalCompositeOperation = 'screen';
                    ctx.globalAlpha = Math.min(1, alpha + boost);
                    ctx.drawImage(sprite, px - size * 0.5, py - size * 0.5, size, size);
                    ctx.globalCompositeOperation = 'source-over';
                }
            }
            ctx.restore();
        }

        renderMenuBackdrop(ctx, vw, vh, bgX, bgY, rot3D, warpScale, kickEnergy, sceneFade) {
            const bgAsset = this.menuAssets && this.menuAssets.bg;
            if (bgAsset && bgAsset.loaded) {
                const img = bgAsset.img;
                const overscan = 1.12 * warpScale;
                const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
                const viewAspect = vw / Math.max(1, vh);
                let drawW, drawH;
                if (viewAspect >= imgAspect) {
                    drawW = vw * overscan;
                    drawH = drawW / imgAspect;
                } else {
                    drawH = vh * overscan;
                    drawW = drawH * imgAspect;
                }
                const dx = (vw - drawW) * 0.5 - bgX * 1.15;
                const dy = (vh - drawH) * 0.5 - bgY * 1.15;

                ctx.save();
                ctx.globalAlpha = sceneFade;
                ctx.drawImage(img, dx, dy, drawW, drawH);

                // Subtle audio/hover luminance boost in upper-right volumetric cone
                const rayGlowAlpha = Math.min(0.28, (0.04 + kickEnergy * 0.12 + this.menuPlayHover * 0.08) * sceneFade);
                if (rayGlowAlpha > 0.005) {
                    ctx.globalCompositeOperation = 'screen';
                    const rg = ctx.createRadialGradient(
                        vw * 0.88 - bgX * 1.4, vh * 0.08 - bgY * 1.4, 10,
                        vw * 0.72 - bgX, vh * 0.24 - bgY, Math.max(vw, vh) * 0.78
                    );
                    rg.addColorStop(0, `rgba(140, 228, 255, ${rayGlowAlpha})`);
                    rg.addColorStop(0.5, `rgba(38, 128, 178, ${rayGlowAlpha * 0.4})`);
                    rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = rg;
                    ctx.fillRect(0, 0, vw, vh);
                }
                ctx.restore();
                return;
            }

            // Fallback gradient while image loads
            const bgGrad = ctx.createLinearGradient(vw * 0.12, vh * 0.95, vw * 0.92, vh * 0.04);
            bgGrad.addColorStop(0, '#020509');
            bgGrad.addColorStop(0.45, '#05121f');
            bgGrad.addColorStop(1, '#143c59');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, vw, vh);
        }

        renderMenuVeil(ctx, vw, vh, veilX, veilY, rot3D, tiltY, warpScale, kickEnergy, veilIntro, sceneFade) {
            const veilAsset = this.menuAssets && this.menuAssets.veil;
            if (!veilAsset || !veilAsset.loaded) return;

            const img = veilAsset.img;
            const time = this.menuTime;
            const breathe = 1 + Math.sin(time * 0.52) * 0.028 + kickEnergy * 0.02;
            const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
            const baseW = Math.max(vw * 1.12, vh * 1.82) * breathe * warpScale * (0.94 + veilIntro * 0.06);
            const baseH = baseW / imgAspect;

            const cx = vw * 0.50 - veilX + Math.sin(time * 0.36) * 14;
            const cy = vh * 0.42 - veilY + Math.cos(time * 0.44) * 9;
            const angle = rot3D * 0.14 + Math.sin(time * 0.32) * 0.024;
            const alpha = Math.min(0.88, (0.58 + kickEnergy * 0.16 + this.menuPlayHover * 0.12) * veilIntro * sceneFade);

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.scale(1, 1 - Math.abs(tiltY) * 0.18);
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, -baseW * 0.5, -baseH * 0.5, baseW, baseH);

            // Subtle chromatic resonance ghost on bass hit or hover
            if (kickEnergy > 0.18 || this.menuPlayHover > 0.05) {
                ctx.globalAlpha = Math.min(0.32, (kickEnergy * 0.16 + this.menuPlayHover * 0.1) * veilIntro * sceneFade);
                ctx.drawImage(img, -baseW * 0.515, -baseH * 0.505, baseW * 1.03, baseH * 1.03);
            }
            ctx.restore();
        }

        renderMenuHarmonicCorona(ctx, cx, cy, coreRadius, time, kickEnergy, hoverBoost, fadeAlpha) {
            const alpha = Math.min(0.65, (0.14 + kickEnergy * 0.28 + hoverBoost * 0.18) * fadeAlpha);
            if (alpha <= 0.01) return;

            const steps = 72;
            const baseR = coreRadius * (1.16 + kickEnergy * 0.06);
            const freqData = Audio.freqData;
            const hasLiveSpectrum = Audio.isPlaying && freqData && freqData.length >= 64;

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.translate(cx, cy);
            ctx.beginPath();
            for (let s = 0; s <= steps; s++) {
                const a = (s / steps) * Math.PI * 2;
                let specVal = 0;
                if (hasLiveSpectrum) {
                    // Mirror spectrum symmetrically around circle for seamless closure
                    const idx = Math.abs((s % steps) - steps / 2) / (steps / 2);
                    const bin = Math.min(96, Math.floor(2 + idx * 54));
                    specVal = (freqData[bin] || 0) / 255;
                }
                const harmonic =
                    Math.sin(a * 4 + time * 2.1) * (1.8 + kickEnergy * 4.5) +
                    Math.cos(a * 6 - time * 1.6) * (1.1 + hoverBoost * 2.6) +
                    specVal * (coreRadius * 0.12);
                const r = baseR + harmonic;
                const px = Math.cos(a) * r;
                const py = Math.sin(a) * r;
                if (s === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = hoverBoost > 0.25
                ? `rgba(0, 245, 212, ${alpha})`
                : `rgba(145, 226, 255, ${alpha})`;
            ctx.lineWidth = 1.0 + kickEnergy * 0.8;
            ctx.shadowColor = '#00f5d4';
            ctx.shadowBlur = 10 + kickEnergy * 10;
            ctx.stroke();
            ctx.restore();
        }

        renderMenuOrbitalArcs(ctx, cx, cy, coreRadius, rot3D, tiltY, isFrontPass, ringScale, hoverBoost, fadeAlpha) {
            if (!this.menuOrbitNodes || fadeAlpha <= 0.01) return;

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            for (let i = 0; i < this.menuOrbitNodes.length; i++) {
                const orb = this.menuOrbitNodes[i];
                const rx = coreRadius * orb.rxMul * ringScale;
                const ry = Math.max(coreRadius * 0.16, coreRadius * orb.ryMul * (1 + tiltY * 0.55) * ringScale);
                const rot = orb.tilt + rot3D * (i === 0 ? 0.42 : -0.35);

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(rot);

                // Orbit hairline arc (split cleanly at sin(a) == 0 for front/back depth)
                ctx.beginPath();
                if (isFrontPass) {
                    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
                    ctx.strokeStyle = i === 0
                        ? `rgba(0, 245, 212, ${(0.28 + hoverBoost * 0.26) * fadeAlpha})`
                        : `rgba(166, 232, 255, ${(0.20 + hoverBoost * 0.20) * fadeAlpha})`;
                    ctx.lineWidth = 1.15 + hoverBoost * 0.45;
                } else {
                    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
                    ctx.strokeStyle = `rgba(120, 206, 245, ${(0.11 + hoverBoost * 0.10) * fadeAlpha})`;
                    ctx.lineWidth = 0.85;
                }
                ctx.stroke();

                // Orbiting luminous micro-sphere + delicate comet wake
                const dir = orb.speed >= 0 ? 1 : -1;
                const trailSegs = 12;
                const trailSpan = 0.65;
                for (let s = trailSegs; s >= 1; s--) {
                    const frac = s / trailSegs;
                    const a0 = orb.theta - dir * trailSpan * frac;
                    const a1 = orb.theta - dir * trailSpan * (frac - 1 / trailSegs);
                    const midSin = Math.sin((a0 + a1) * 0.5);
                    if ((midSin >= 0) !== isFrontPass) continue;

                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a0) * rx, Math.sin(a0) * ry);
                    ctx.lineTo(Math.cos(a1) * rx, Math.sin(a1) * ry);
                    ctx.strokeStyle = orb.color;
                    ctx.globalAlpha = (1 - frac) * (isFrontPass ? 0.72 : 0.32) * fadeAlpha;
                    ctx.lineWidth = (1 - frac * 0.65) * 2.2;
                    ctx.stroke();
                }

                const nodeSin = Math.sin(orb.theta);
                if ((nodeSin >= 0) === isFrontPass) {
                    const nx = Math.cos(orb.theta) * rx;
                    const ny = Math.sin(orb.theta) * ry;
                    const nr = orb.radius * (isFrontPass ? 1.05 : 0.78) * (1 + hoverBoost * 0.25);

                    ctx.globalAlpha = (isFrontPass ? 0.95 : 0.5) * fadeAlpha;
                    ctx.shadowColor = orb.color;
                    ctx.shadowBlur = isFrontPass ? 14 : 6;
                    ctx.fillStyle = orb.color;
                    ctx.beginPath();
                    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(nx, ny, nr * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }
            ctx.restore();
        }

        renderMenuHeroCore(ctx, vw, vh, baseCoreX, baseCoreY, menuCoreX, menuCoreY, coreRadius, rot3D, tiltY, time, kickEnergy, hoverBoost, easeT, coreIntro, sceneFade) {
            const shellFade = Math.max(0, 1 - easeT * 1.35);

            // 1. Atmospheric outer cyan-blue bloom behind core
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const bloomR = coreRadius * (2.55 + kickEnergy * 0.45 + hoverBoost * 0.45);
            const outerBloom = ctx.createRadialGradient(
                baseCoreX, baseCoreY, coreRadius * 0.15,
                baseCoreX, baseCoreY, bloomR
            );
            const bloomAlpha = Math.min(0.95, (0.48 + kickEnergy * 0.28 + hoverBoost * 0.22) * coreIntro);
            outerBloom.addColorStop(0, `rgba(215, 248, 255, ${bloomAlpha})`);
            outerBloom.addColorStop(0.26, `rgba(0, 245, 212, ${bloomAlpha * 0.46})`);
            outerBloom.addColorStop(0.56, `rgba(42, 138, 204, ${bloomAlpha * 0.24})`);
            outerBloom.addColorStop(1, 'rgba(8, 35, 65, 0)');
            ctx.fillStyle = outerBloom;
            ctx.beginPath();
            ctx.arc(baseCoreX, baseCoreY, bloomR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 2. Subtle circular audio-reactive harmonic corona
            this.renderMenuHarmonicCorona(ctx, baseCoreX, baseCoreY, coreRadius, time, kickEnergy, hoverBoost, shellFade * coreIntro);

            // 3. Back pass of 3D gyroscopic orbital rings
            const ringScale = 1 - easeT * 0.85;
            this.renderMenuOrbitalArcs(ctx, baseCoreX, baseCoreY, coreRadius, rot3D, tiltY, false, ringScale, hoverBoost, shellFade * coreIntro);

            // 4. Launch-to-ball light comet ribbon during transition
            if (easeT > 0.02) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const grad = ctx.createLinearGradient(menuCoreX, menuCoreY, baseCoreX, baseCoreY);
                grad.addColorStop(0, 'rgba(0, 245, 212, 0)');
                grad.addColorStop(0.55, `rgba(0, 245, 212, ${0.42 * (1 - easeT * 0.4)})`);
                grad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = Math.max(4, coreRadius * 0.95);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(menuCoreX, menuCoreY);
                ctx.lineTo(baseCoreX, baseCoreY);
                ctx.stroke();
                ctx.restore();
            }

            // 5. Nano Banana Bioluminescent Plasma Core plate (centered to measured sphere center 0.485, 0.482)
            const coreAsset = this.menuAssets && this.menuAssets.core;
            const spriteFade = Math.max(0, 1 - Math.max(0, easeT - 0.35) / 0.65);
            if (coreAsset && coreAsset.loaded && spriteFade > 0.01) {
                const drawSize = (coreRadius / 0.2217) * (0.82 + coreIntro * 0.18);
                const pivotX = 0.485 * drawSize;
                const pivotY = 0.482 * drawSize;

                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.translate(baseCoreX, baseCoreY);
                ctx.rotate(rot3D * 0.16 + Math.sin(time * 0.48) * 0.045);
                ctx.globalAlpha = Math.min(1, (0.94 + hoverBoost * 0.06) * coreIntro * spriteFade);
                ctx.drawImage(coreAsset.img, -pivotX, -pivotY, drawSize, drawSize);

                // Soft extra luminous heart flare on hover or audio kick
                if (hoverBoost > 0.04 || kickEnergy > 0.25) {
                    const flareR = coreRadius * 0.88;
                    const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, flareR);
                    const fAlpha = Math.min(0.45, (hoverBoost * 0.28 + kickEnergy * 0.2) * coreIntro * spriteFade);
                    fg.addColorStop(0, `rgba(255, 255, 255, ${fAlpha})`);
                    fg.addColorStop(0.55, `rgba(0, 245, 212, ${fAlpha * 0.45})`);
                    fg.addColorStop(1, 'rgba(0, 245, 212, 0)');
                    ctx.fillStyle = fg;
                    ctx.beginPath();
                    ctx.arc(0, 0, flareR, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            // 6. Condensed white-hot arcade ball crossfade at end of transition (or fallback)
            const ballCrossfade = (!coreAsset || !coreAsset.loaded) ? 1 : Math.max(0, (easeT - 0.3) / 0.7);
            if (ballCrossfade > 0.01) {
                ctx.save();
                ctx.globalAlpha = ballCrossfade * coreIntro;
                ctx.shadowColor = '#00f5d4';
                ctx.shadowBlur = 20;
                ctx.fillStyle = '#00f5d4';
                ctx.beginPath();
                ctx.arc(baseCoreX, baseCoreY, coreRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(baseCoreX, baseCoreY, coreRadius * 0.65, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // 7. Front pass of 3D gyroscopic orbital rings & orbiting light spheres
            this.renderMenuOrbitalArcs(ctx, baseCoreX, baseCoreY, coreRadius, rot3D, tiltY, true, ringScale, hoverBoost, shellFade * coreIntro);
        }

        renderMenuRipplesAndWake(ctx, baseCoreX, baseCoreY, sceneFade) {
            // Expanding shockwave ripples
            if (this.menuRipples) {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                for (let i = 0; i < this.menuRipples.length; i++) {
                    const r = this.menuRipples[i];
                    if (!r.active) continue;
                    const p = Math.max(0, r.life / r.maxLife);
                    const rx = r.isCoreAnchored ? baseCoreX : r.x;
                    const ry = r.isCoreAnchored ? baseCoreY : r.y;

                    ctx.globalAlpha = p * 0.48 * sceneFade;
                    ctx.strokeStyle = r.color;
                    ctx.lineWidth = 1.1 + p * 1.4;
                    ctx.beginPath();
                    ctx.arc(rx, ry, r.radius, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Subtle cursor bioluminescent motes
            if (this.menuCursorWake) {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                for (let i = 0; i < this.menuCursorWake.length; i++) {
                    const m = this.menuCursorWake[i];
                    if (!m.active) continue;
                    const p = Math.max(0, m.life / m.maxLife);
                    ctx.globalAlpha = p * 0.65 * sceneFade;
                    ctx.fillStyle = '#a8f0ff';
                    ctx.shadowColor = '#00f5d4';
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(m.x, m.y, m.size * (0.4 + p * 0.6), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        renderParallaxMenu(ctx, pulse, dt) {
            const time = this.menuTime;
            const vw = this.viewWidth;
            const vh = this.viewHeight;
            const minDim = Math.min(vw, vh);

            const bgX = this.parallax.bgX || 0;
            const bgY = this.parallax.bgY || 0;
            const veilX = this.parallax.veilX || 0;
            const veilY = this.parallax.veilY || 0;
            const coreX = this.parallax.coreX || 0;
            const coreY = this.parallax.coreY || 0;
            const fgX = this.parallax.fgX || 0;
            const fgY = this.parallax.fgY || 0;
            const rot3D = this.parallax.rot3D || 0;
            const tiltY = this.parallax.tiltY || 0;

            const isTrans = this.state === 'transitioning';
            const t = this.transitionProgress || 0;
            const easeT = t * t * (3 - 2 * t);
            const warpScale = 1 + easeT * 0.16;
            const sceneFade = Math.max(0, 1 - easeT * 1.15);

            // Smooth staggered entrance reveal (0 -> 1 over ~1.25s)
            const introRaw = Math.min(1, (this.menuIntroTimer || 0) / 1.15);
            const introFade = 1 - Math.pow(1 - Math.min(1, introRaw * 1.6), 3);
            const veilIntro = 1 - Math.pow(1 - Math.max(0, Math.min(1, (introRaw - 0.1) / 0.85)), 3);
            const coreIntro = 1 - Math.pow(1 - Math.max(0, Math.min(1, (introRaw - 0.18) / 0.82)), 3);

            const bass = Audio.bassEnergy || 0;
            const beat = Audio.beatPulse || 0;
            const idleBreath = Math.sin(time * 1.85) * 0.5 + 0.5;
            const kickEnergy = Math.max(bass * 1.15, beat * 0.9, idleBreath * 0.14) + (this.flowClickPulse || 0) * 0.45;
            const hoverBoost = this.menuPlayHover || 0;

            // Clear base to abyssal black
            ctx.fillStyle = '#02050a';
            ctx.fillRect(0, 0, vw, vh);

            // Plane 0: Deep oceanic-cosmic atmosphere + volumetric god rays
            this.renderMenuBackdrop(ctx, vw, vh, bgX, bgY, rot3D, warpScale, kickEnergy, sceneFade);

            // Plane 1: Far starlight & distant dust (0.025x)
            this.renderFlowParticleLayer(ctx, 0, bgX * 1.35, bgY * 1.35, vw, vh, time, kickEnergy, sceneFade * introFade);

            // Plane 2: Bioluminescent silk flow veil (0.048x)
            this.renderMenuVeil(ctx, vw, vh, veilX, veilY, rot3D, tiltY, warpScale, kickEnergy, veilIntro, sceneFade);

            // Plane 3: Mid-depth bioluminescent spores (0.062x)
            this.renderFlowParticleLayer(ctx, 1, coreX * 0.78, coreY * 0.78, vw, vh, time, kickEnergy, sceneFade * veilIntro);

            // Plane 4: Hero bioluminescent core + 3D gyroscopic orbital rings (0.082x)
            const floatY = Math.sin(time * 1.35) * 6 * (1 - easeT);
            const floatX = Math.cos(time * 0.95) * 4 * (1 - easeT);
            const menuCoreX = vw * 0.50 - coreX + floatX;
            const menuCoreY = vh * 0.39 - coreY + floatY;
            const launchX = this.arenaX + this.arenaWidth * 0.5;
            const launchY = this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET - 18;

            const baseCoreX = menuCoreX + (launchX - menuCoreX) * easeT;
            const baseCoreY = menuCoreY + (launchY - menuCoreY) * easeT;

            const kickScale = 1 + (kickEnergy * 0.055 + hoverBoost * 0.045) * (1 - easeT);
            const menuRadius = minDim * 0.125 * kickScale;
            const coreRadius = isTrans ? menuRadius + (9 - menuRadius) * easeT : menuRadius;

            this.renderMenuHeroCore(
                ctx, vw, vh, baseCoreX, baseCoreY, menuCoreX, menuCoreY,
                coreRadius, rot3D, tiltY, time, kickEnergy, hoverBoost, easeT, coreIntro, sceneFade
            );

            // Plane 5: Interactive shockwave ripples & cursor motes
            this.renderMenuRipplesAndWake(ctx, baseCoreX, baseCoreY, sceneFade);

            // Plane 6: Foreground out-of-focus bokeh & dark depth silhouettes (0.135x)
            this.renderFlowParticleLayer(ctx, 2, fgX, fgY, vw, vh, time, kickEnergy, sceneFade * coreIntro);

            // Soft abyssal vignette framing bottom UI legibility & cinematic intro fade-in
            const botGrad = ctx.createLinearGradient(0, vh * 0.62, 0, vh);
            botGrad.addColorStop(0, 'rgba(2, 5, 10, 0)');
            botGrad.addColorStop(1, `rgba(2, 5, 10, ${0.58 * sceneFade})`);
            ctx.fillStyle = botGrad;
            ctx.fillRect(0, vh * 0.62, vw, vh * 0.38);

            if (introFade < 0.999) {
                ctx.fillStyle = `rgba(2, 5, 10, ${1 - introFade})`;
                ctx.fillRect(0, 0, vw, vh);
            }

            // Render any burst particles
            this.renderParticles(ctx);
        }

        render(dt) {
            const ctx = this.ctx;
            const bass = Audio.bassEnergy || 0;
            const high = Audio.highEnergy || 0;
            const pulse = Math.max(bass, Audio.beatPulse * 0.6);
            const k = this.pixelScale;

            if (this.state !== 'paused') {
                this.updateTrailLayer(dt || 1 / 60);
            }

            ctx.setTransform(k, 0, 0, k, 0, 0);
            ctx.save();

            // In menu or transition mode, render the rich Parallax Relief Scene!
            if (this.state === 'menu' || this.state === 'transitioning') {
                this.renderParallaxMenu(ctx, pulse, dt);
                ctx.restore();
                return;
            }

            // Screen shake offset
            if (this.screenShake > 0.2) {
                const sx = (Math.random() - 0.5) * this.screenShake * 2;
                const sy = (Math.random() - 0.5) * this.screenShake * 2;
                ctx.translate(sx, sy);
            }

            // 1. Abyssal obsidian base + cohesive Nano Banana environment
            ctx.fillStyle = '#020611';
            ctx.fillRect(-20, -20, this.viewWidth + 40, this.viewHeight + 40);

            this.renderArenaEnvironment(ctx, pulse);

            // 4. Light trails (additive)
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(this.trailCanvas, 0, 0, this.viewWidth, this.viewHeight);
            ctx.globalCompositeOperation = 'source-over';

            // 4.5. Pre-Drop Build-Up Energy Vortex (4s before Climax Barrage)
            if (Audio.buildUpCharge > 0.04) {
                this.renderBuildUpEffect(ctx, Audio.buildUpCharge, pulse);
            }

            // 5. Power-ups, ghost paddles, paddles
            this.renderPowerUps(ctx);
            this.renderGhostPaddles(ctx);
            this.renderPaddle(ctx, this.opponent, false, pulse);
            this.renderPaddle(ctx, this.player, true, pulse);

            // 6. Ball heads, shockwaves, floating texts
            this.renderBalls(ctx, pulse);
            this.renderParticles(ctx);
            this.renderFloatingTexts(ctx);

            // 7. Thin reactive frame
            this.renderReactiveBorder(ctx, pulse, high);

            ctx.restore();

            // Update offscreen psychedelic zoom-feedback buffer for next frame
            if (this.feedbackMode !== 'off' && this.state !== 'paused') {
                this.updateFeedbackBuffer(pulse);
            }
        }

        renderArenaEnvironment(ctx, pulse) {
            const bass = Audio.bassEnergy || 0;
            const ax = this.arenaX;
            const ay = this.arenaY;
            const aw = this.arenaWidth;
            const ah = this.arenaHeight;
            const cx = ax + aw * 0.5;
            const cy = ay + ah * 0.5;
            const padNorm = this.player
                ? ((this.player.x - cx) / Math.max(1, aw * 0.5))
                : 0;

            // A. Abyssal backdrop (Nano Banana ocean sanctuary) with subtle paddle parallax + audio breath
            const bgReady = this.arenaAbyssBg && this.arenaAbyssBg.loaded && this.arenaAbyssBg.img;
            const bgImg = bgReady ? this.arenaAbyssBg.img : (this.parallaxBgLoaded ? this.parallaxBgImg : null);
            if (bgImg) {
                ctx.save();
                const zoom = 1.06 + pulse * 0.018;
                const iw = bgImg.naturalWidth || bgImg.width || 1376;
                const ih = bgImg.naturalHeight || bgImg.height || 768;
                const scale = Math.max(this.viewWidth / iw, this.viewHeight / ih) * zoom;
                const dw = iw * scale;
                const dh = ih * scale;
                const dx = (this.viewWidth - dw) * 0.5 - padNorm * 16;
                const dy = (this.viewHeight - dh) * 0.5 + Math.sin(this.menuTime * 0.35) * 6;
                ctx.globalAlpha = 0.58;
                ctx.drawImage(bgImg, dx, dy, dw, dh);
                ctx.restore();
            }

            // Slow-motion abyssal tint when Chrono-Stasis is active
            if (this.buffs.slow > 0) {
                ctx.fillStyle = 'rgba(22, 16, 48, 0.22)';
                ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
            }

            // B. Drifting cover-art bioluminescent spores behind the arena
            this.renderFlowParticleLayer(ctx, 0, -padNorm * 14, 0, this.viewWidth, this.viewHeight, this.menuTime, pulse, 0.48);

            // C. Central 4:3 Abyssal Sanctuary Veil
            ctx.save();
            const veilGrad = ctx.createRadialGradient(cx, cy, Math.min(aw, ah) * 0.08, cx, cy, Math.max(aw, ah) * 0.72);
            veilGrad.addColorStop(0, 'rgba(4, 20, 36, 0.38)');
            veilGrad.addColorStop(1, 'rgba(2, 6, 15, 0.68)');
            ctx.fillStyle = veilGrad;
            ctx.fillRect(ax, ay, aw, ah);
            ctx.restore();

            // D. Psychedelic Zoom-Feedback Layer (Pwong 2 background tunnel)
            if (this.feedbackMode !== 'off') {
                const fbAlpha = this.feedbackMode === 'high' ? 0.34 + pulse * 0.14 : 0.18;
                ctx.globalAlpha = fbAlpha;
                ctx.drawImage(this.fbCanvas, 0, 0, this.viewWidth, this.viewHeight);
                ctx.globalAlpha = 1;
            }

            // E. Living bioluminescent caustics curtain inside arena ('screen' composite)
            if (this.arenaCaustics && this.arenaCaustics.loaded && this.arenaCaustics.img) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(ax, ay, aw, ah);
                ctx.clip();
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = Math.min(0.36, 0.14 + pulse * 0.11 + ((this.comboMultiplier || 1) - 1) * 0.03);
                const driftX = Math.sin(this.menuTime * 0.24) * 28;
                const driftY = Math.cos(this.menuTime * 0.19) * 22;
                ctx.drawImage(this.arenaCaustics.img, ax - 36 + driftX, ay - 36 + driftY, aw + 72, ah + 72);
                ctx.restore();
            }

            // F. Central Harmonic Resonance Ring + Half-Court Dividing Filament
            ctx.save();
            const ringR = 44 + pulse * 10;
            ctx.strokeStyle = `rgba(0, 245, 212, ${0.14 + pulse * 0.16})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(168, 130, 255, ${0.10 + bass * 0.14})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 10]);
            ctx.beginPath();
            ctx.arc(cx, cy, ringR * 0.68, this.menuTime * 0.5, this.menuTime * 0.5 + Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            if ((this.comboMultiplier || 1) > 1.01) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = "800 13px 'Orbitron', system-ui, sans-serif";
                ctx.fillStyle = `rgba(255, 209, 102, ${0.38 + pulse * 0.22})`;
                ctx.fillText(`×${this.comboMultiplier.toFixed(2)}`, cx, cy);
            }

            ctx.strokeStyle = `rgba(92, 225, 255, ${0.11 + bass * 0.1})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 10]);
            ctx.beginPath();
            ctx.moveTo(ax, cy);
            ctx.lineTo(cx - ringR - 6, cy);
            ctx.moveTo(cx + ringR + 6, cy);
            ctx.lineTo(ax + aw, cy);
            ctx.stroke();

            if (ax > 4) {
                ctx.strokeStyle = 'rgba(92, 225, 255, 0.035)';
                ctx.beginPath();
                ctx.moveTo(0, cy);
                ctx.lineTo(ax, cy);
                ctx.moveTo(ax + aw, cy);
                ctx.lineTo(this.viewWidth, cy);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();

            // G. Top Goal Barrier Flash
            if (this.goalFlashTop > 0.01) {
                ctx.save();
                const goalGrad = ctx.createLinearGradient(0, ay, 0, ay + 64);
                goalGrad.addColorStop(0, `rgba(0, 245, 212, ${this.goalFlashTop * 0.45})`);
                goalGrad.addColorStop(1, 'rgba(0, 245, 212, 0)');
                ctx.fillStyle = goalGrad;
                ctx.fillRect(ax, ay, aw, 64);
                ctx.restore();
            }

            // H. Bottom Abyssal Aegis Shield Wave Membrane (1P modes)
            const aegisActive = !this.mode.isTwoPlayer && this.buffs.shield > 0 && this.shieldCharges > 0;
            if (aegisActive || this.shieldFlashBottom > 0.02) {
                ctx.save();
                const baseY = ay + ah - 10;
                const intensity = aegisActive ? (0.65 + pulse * 0.25 + this.shieldFlashBottom * 0.35) : this.shieldFlashBottom;
                const shieldGrad = ctx.createLinearGradient(0, baseY - 24, 0, ay + ah);
                shieldGrad.addColorStop(0, 'rgba(46, 196, 182, 0)');
                shieldGrad.addColorStop(1, `rgba(46, 196, 182, ${0.22 * intensity})`);
                ctx.fillStyle = shieldGrad;
                ctx.fillRect(ax + 6, baseY - 24, aw - 12, 34);

                ctx.strokeStyle = `rgba(92, 245, 226, ${Math.min(1, intensity)})`;
                ctx.shadowColor = '#2ec4b6';
                ctx.shadowBlur = 14;
                ctx.lineWidth = 2.6 + this.shieldFlashBottom * 2.2;
                ctx.beginPath();
                const steps = 28;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const wx = ax + 8 + t * (aw - 16);
                    const wy = baseY + Math.sin(t * Math.PI * 6 + this.menuTime * 7) * (2.5 + pulse * 2.5);
                    if (s === 0) ctx.moveTo(wx, wy);
                    else ctx.lineTo(wx, wy);
                }
                ctx.stroke();

                if (aegisActive) {
                    const pips = this.shieldCharges;
                    const spacing = 14;
                    const pxStart = cx - ((pips - 1) * spacing) * 0.5;
                    ctx.fillStyle = '#a6fff4';
                    for (let c = 0; c < pips; c++) {
                        ctx.beginPath();
                        ctx.arc(pxStart + c * spacing, baseY - 12, 3.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
        }

        updateFeedbackBuffer(pulse) {
            const fCtx = this.fbCtx;
            const fw = this.fbCanvas.width;
            const fh = this.fbCanvas.height;

            fCtx.save();
            // Zoom slightly outward on every beat + subtle rotation
            const zoom = 1.022 + pulse * 0.018;
            fCtx.translate(fw / 2, fh / 2);
            fCtx.scale(zoom, zoom);
            fCtx.rotate(0.004);
            fCtx.globalAlpha = 0.88;
            fCtx.drawImage(this.canvas, -fw / 2, -fh / 2, fw, fh);
            fCtx.restore();

            // Darken cleanly toward deep abyssal obsidian
            fCtx.fillStyle = 'rgba(2, 7, 16, 0.18)';
            fCtx.fillRect(0, 0, fw, fh);
        }

        renderPaddle(ctx, pad, isPlayer, pulse) {
            ctx.save();
            const halfW = pad.width / 2;
            const halfH = pad.height / 2;
            const x = pad.x - halfW;
            const y = pad.y - halfH;

            let color = pad.color;
            if (isPlayer && this.buffs.overdrive > 0) color = '#ff6b35';
            else if (isPlayer && this.buffs.sticky > 0) color = '#ff4da6';

            // Sticky magnetic field arc hovering above player paddle
            if (isPlayer && this.buffs.sticky > 0) {
                ctx.save();
                ctx.strokeStyle = `rgba(255, 77, 166, ${0.35 + pulse * 0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(pad.x, y - 4, halfW * 0.85, 8 + pulse * 4, 0, Math.PI, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // Bioluminescent plasma capsule body
            ctx.shadowColor = color;
            ctx.shadowBlur = 18 + pulse * 14;
            const capGrad = ctx.createLinearGradient(x, pad.y, x + pad.width, pad.y);
            capGrad.addColorStop(0, color);
            capGrad.addColorStop(0.5, isPlayer ? '#80ffdb' : '#ff8ec7');
            capGrad.addColorStop(1, color);
            ctx.fillStyle = capGrad;

            ctx.beginPath();
            ctx.roundRect(x, y, pad.width, pad.height, halfH);
            ctx.fill();

            // Inner pearl filament core
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(244, 255, 255, 0.92)';
            ctx.beginPath();
            ctx.roundRect(x + 8, y + 3.2, Math.max(8, pad.width - 16), Math.max(3, pad.height - 6.4), 4);
            ctx.fill();

            // Glowing emitter end-nodes
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(x + 4.5, pad.y, 2.6, 0, Math.PI * 2);
            ctx.arc(x + pad.width - 4.5, pad.y, 2.6, 0, Math.PI * 2);
            ctx.fill();

            // Draw Ghost Paddle Ammo pips + numeric counter under P1 (or above P2 in 2P Versus)
            if ((isPlayer || this.mode.isTwoPlayer) && pad.ghostAmmo > 0) {
                const ammo = pad.ghostAmmo;
                const visiblePips = Math.min(10, ammo);
                const pipSpacing = 9;
                const startX = pad.x - ((visiblePips - 1) * pipSpacing) / 2;
                const pipY = isPlayer ? pad.y + 15 : pad.y - 15;
                const pipColor = isPlayer ? '#00f5d4' : '#ff4da6';
                ctx.shadowColor = pipColor;
                ctx.shadowBlur = 6;
                ctx.fillStyle = pipColor;
                for (let i = 0; i < visiblePips; i++) {
                    ctx.beginPath();
                    ctx.arc(startX + i * pipSpacing, pipY, 2.8, 0, Math.PI * 2);
                    ctx.fill();
                }
                if (ammo > 10) {
                    ctx.font = "700 10px 'Orbitron', system-ui, sans-serif";
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`×${ammo}`, startX + visiblePips * pipSpacing + 4, pipY);
                }
            }

            ctx.restore();
        }

        renderGhostPaddles(ctx) {
            ctx.save();
            for (let i = 0; i < this.ghosts.size; i++) {
                const g = this.ghosts.items[i];
                if (!g.active) continue;

                const isP2 = g.owner === 'player2';
                const curveDir = isP2 ? 1 : -1;
                const hw = g.width * 0.5;
                const arcDepth = 9;

                ctx.shadowColor = g.color;
                ctx.shadowBlur = 18;

                // Translucent plasma crescent energy blade
                const bladeGrad = ctx.createLinearGradient(g.x - hw, g.y, g.x + hw, g.y);
                bladeGrad.addColorStop(0, 'rgba(0, 245, 212, 0.05)');
                bladeGrad.addColorStop(0.5, isP2 ? 'rgba(255, 77, 166, 0.34)' : 'rgba(0, 245, 212, 0.36)');
                bladeGrad.addColorStop(1, 'rgba(0, 245, 212, 0.05)');

                ctx.fillStyle = bladeGrad;
                ctx.beginPath();
                ctx.moveTo(g.x - hw, g.y - curveDir * 2);
                ctx.quadraticCurveTo(g.x, g.y + curveDir * arcDepth * 1.4, g.x + hw, g.y - curveDir * 2);
                ctx.quadraticCurveTo(g.x, g.y + curveDir * 2, g.x - hw, g.y - curveDir * 2);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = g.color;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.moveTo(g.x - hw, g.y - curveDir * 1.5);
                ctx.quadraticCurveTo(g.x, g.y + curveDir * arcDepth * 1.35, g.x + hw, g.y - curveDir * 1.5);
                ctx.stroke();

                // Hot center spine
                ctx.strokeStyle = 'rgba(235, 255, 255, 0.85)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(g.x - hw * 0.6, g.y + curveDir * 2);
                ctx.quadraticCurveTo(g.x, g.y + curveDir * (arcDepth * 1.15), g.x + hw * 0.6, g.y + curveDir * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        renderPowerUps(ctx) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let i = 0; i < this.powerups.size; i++) {
                const p = this.powerups.items[i];
                if (!p.active) continue;

                const def = CFG.POWERUPS[p.type] || CFG.POWERUPS.ammo;
                const r = p.radius + Math.sin(p.pulse) * 2.0;

                // Soft translucent bioluminescent aura (no heavy dark box!)
                const aura = ctx.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r * 1.65);
                aura.addColorStop(0, `${def.color}55`);
                aura.addColorStop(0.55, `${def.color}22`);
                aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = aura;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r * 1.65, 0, Math.PI * 2);
                ctx.fill();

                // Rotating orbital ring
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.pulse * 0.28);
                ctx.strokeStyle = def.color;
                ctx.globalAlpha = 0.78;
                ctx.lineWidth = 1.6;
                ctx.setLineDash([7, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);

                // Two orbiting energy motes
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.9;
                ctx.beginPath();
                ctx.arc(r * 1.18, 0, 2.0, 0, Math.PI * 2);
                ctx.arc(-r * 1.18, 0, 2.0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Nano Banana icon blended seamlessly via 'screen'
                const iconImg = this.powerupIcons ? this.powerupIcons[p.type] : null;
                if (iconImg && iconImg.complete && (iconImg.naturalWidth > 0 || iconImg.width > 0)) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    const iconSize = r * 2.35;
                    ctx.drawImage(iconImg, p.x - iconSize / 2, p.y - iconSize / 2, iconSize, iconSize);
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 14px system-ui, sans-serif';
                    ctx.fillText(def.symbol, p.x, p.y + 1);
                }

                // Crisp micro-tag below icon for instant readability during swarms
                if (def.shortLabel) {
                    ctx.font = "800 9px 'Orbitron', system-ui, sans-serif";
                    ctx.fillStyle = def.color;
                    ctx.shadowColor = '#020611';
                    ctx.shadowBlur = 4;
                    ctx.fillText(def.shortLabel, p.x, p.y + r * 1.48);
                    ctx.shadowBlur = 0;
                }
            }
            ctx.restore();
        }

        renderBuildUpEffect(ctx, charge, pulse) {
            ctx.save();
            const cx = this.player ? this.player.x : (this.arenaX + this.arenaWidth / 2);
            const cy = this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET;

            // Converging bioluminescent rings around the bottom launcher syncing with the build-up
            for (let ring = 0; ring < 3; ring++) {
                const phase = ((this.elapsedTime * (2.2 + charge * 3.5) + ring * 0.33) % 1);
                const rad = (1 - phase) * (95 + charge * 65);
                const alpha = phase * (0.3 + charge * 0.45);

                ctx.strokeStyle = ring % 2 === 0 ? `rgba(255, 209, 102, ${alpha})` : `rgba(0, 245, 212, ${alpha})`;
                ctx.lineWidth = 1.6 + charge * 2.2;
                ctx.beginPath();
                ctx.arc(cx, cy, Math.max(4, rad), Math.PI, Math.PI * 2);
                ctx.stroke();
            }

            // Rising energy label above launcher when build-up is > 25%
            if (charge > 0.25) {
                ctx.font = "800 12px 'Orbitron', system-ui, sans-serif";
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(255, 209, 102, ${Math.min(1, charge * 1.1)})`;
                const pct = Math.min(100, Math.round(charge * 100));
                ctx.fillText(`⚡ DROP CARREGANDO ${pct}% ⚡`, this.arenaX + this.arenaWidth / 2, this.arenaY + this.arenaHeight - 10);
            }
            ctx.restore();
        }

        renderBalls(ctx, pulse = 0) {
            const beatScale = 1 + pulse * 0.16;
            const padX = this.player ? this.player.x : this.arenaX + this.arenaWidth * 0.5;
            const padY = this.player ? this.player.y : this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET;

            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (!b.active) continue;

                const r = b.radius * beatScale;
                const ballColor = b.stuckTimer > 0
                    ? '#ff4da6'
                    : (b.isCurvedShot ? '#ffd166' : b.color);

                // Sticky Magnet tether linking latched ball to paddle core
                if (b.stuckTimer > 0) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255, 77, 166, 0.78)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(padX, padY - 6);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                    ctx.restore();
                }

                // Soft plasma outer aura
                const auraGrad = ctx.createRadialGradient(b.x, b.y, r * 0.2, b.x, b.y, r * 2.15);
                auraGrad.addColorStop(0, `${ballColor}aa`);
                auraGrad.addColorStop(0.45, `${ballColor}38`);
                auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = auraGrad;
                ctx.beginPath();
                ctx.arc(b.x, b.y, r * 2.15, 0, Math.PI * 2);
                ctx.fill();

                // Spinning vortex ring on Magnus curved shots or beat pulses
                if (b.isCurvedShot || pulse > 0.45) {
                    ctx.save();
                    ctx.translate(b.x, b.y);
                    ctx.rotate(this.menuTime * (b.isCurvedShot ? 9 : 3));
                    ctx.strokeStyle = ballColor;
                    ctx.globalAlpha = b.isCurvedShot ? 0.78 : (pulse - 0.35) * 0.65;
                    ctx.lineWidth = b.isCurvedShot ? 1.8 : 1.4;
                    if (b.isCurvedShot) ctx.setLineDash([5, 4]);
                    ctx.beginPath();
                    ctx.arc(0, 0, r * 1.48, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // Colored plasma orb + bright pearl core + specular glint
                ctx.fillStyle = ballColor;
                ctx.beginPath();
                ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#f2ffff';
                ctx.beginPath();
                ctx.arc(b.x, b.y, r * 0.56, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(b.x - r * 0.22, b.y - r * 0.22, r * 0.22, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        renderParticles(ctx) {
            ctx.save();
            for (let i = 0; i < this.particles.size; i++) {
                const p = this.particles.items[i];
                if (!p.active || p.type !== 'ring') continue;

                const alpha = Math.max(0, p.life / p.maxLife);
                const radius = 8 + (1 - alpha) * p.vx;
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2.5 * alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        renderFloatingTexts(ctx) {
            ctx.save();
            ctx.textAlign = 'center';
            for (let i = 0; i < this.texts.size; i++) {
                const t = this.texts.items[i];
                if (!t.active) continue;
                const alpha = Math.max(0, t.life / t.maxLife);
                ctx.globalAlpha = alpha;
                ctx.font = `800 ${t.size}px 'Orbitron', system-ui, sans-serif`;
                ctx.fillStyle = t.color;
                ctx.shadowColor = t.color;
                ctx.shadowBlur = 8;
                ctx.fillText(t.text, t.x, t.y);
            }
            ctx.restore();
        }

        renderReactiveBorder(ctx, pulse, high) {
            ctx.save();
            const flash = this.chromaticFlash > 0.1;
            const primaryColor = flash ? '#ff2a6d' : '#00f5d4';
            const accentColor = flash ? '#ff2a6d' : '#5ce1ff';
            const glowBlur = 10 + pulse * 14 + high * 8;

            const ax = this.arenaX;
            const ay = this.arenaY;
            const aw = this.arenaWidth;
            const ah = this.arenaHeight;

            // 1. Physical Left & Right Dual-Core Plasma Conduits (Bouncers)
            ctx.lineWidth = 3.2 + pulse * 2.0;
            ctx.strokeStyle = primaryColor;
            ctx.shadowColor = primaryColor;
            ctx.shadowBlur = glowBlur;

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax, ay + ah);
            ctx.moveTo(ax + aw, ay);
            ctx.lineTo(ax + aw, ay + ah);
            ctx.stroke();

            // Inner white pearl core filament
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.0;
            ctx.strokeStyle = flash ? 'rgba(255, 220, 232, 0.8)' : 'rgba(218, 255, 252, 0.85)';
            ctx.beginPath();
            ctx.moveTo(ax, ay + 4);
            ctx.lineTo(ax, ay + ah - 4);
            ctx.moveTo(ax + aw, ay + 4);
            ctx.lineTo(ax + aw, ay + ah - 4);
            ctx.stroke();

            // 2. Corner Brackets & Accent Markers
            const bracketLen = 28;
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = flash ? '#ff2a6d' : ((this.isBarrageActive || Audio.buildUpCharge > 0.4) ? '#ffd166' : accentColor);
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 10;

            // Top-Left Corner
            ctx.beginPath();
            ctx.moveTo(ax, ay + bracketLen);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + bracketLen, ay);
            ctx.stroke();

            // Top-Right Corner
            ctx.beginPath();
            ctx.moveTo(ax + aw - bracketLen, ay);
            ctx.lineTo(ax + aw, ay);
            ctx.lineTo(ax + aw, ay + bracketLen);
            ctx.stroke();

            // Bottom-Left Corner
            ctx.beginPath();
            ctx.moveTo(ax, ay + ah - bracketLen);
            ctx.lineTo(ax, ay + ah);
            ctx.lineTo(ax + bracketLen, ay + ah);
            ctx.stroke();

            // Bottom-Right Corner
            ctx.beginPath();
            ctx.moveTo(ax + aw - bracketLen, ay + ah);
            ctx.lineTo(ax + aw, ay + ah);
            ctx.lineTo(ax + aw, ay + ah - bracketLen);
            ctx.stroke();

            // 3. Top Goal Matrix Filament (1P barrier glow) & Bottom Defense Line
            ctx.shadowBlur = !this.mode.isTwoPlayer ? (6 + this.goalFlashTop * 14) : 0;
            ctx.shadowColor = '#00f5d4';
            ctx.lineWidth = !this.mode.isTwoPlayer ? (1.8 + this.goalFlashTop * 2.2) : 1.0;
            ctx.strokeStyle = !this.mode.isTwoPlayer
                ? `rgba(0, 245, 212, ${0.32 + pulse * 0.22 + this.goalFlashTop * 0.46})`
                : `rgba(255, 255, 255, ${0.12 + pulse * 0.14})`;
            ctx.setLineDash(this.mode.isTwoPlayer ? [4, 8] : [14, 6]);
            ctx.beginPath();
            ctx.moveTo(ax + 6, ay + 4);
            ctx.lineTo(ax + aw - 6, ay + 4);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(92, 225, 255, ${0.14 + pulse * 0.14})`;
            ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.moveTo(ax, ay + ah);
            ctx.lineTo(ax + aw, ay + ah);
            ctx.stroke();
            ctx.setLineDash([]);

            // 4. Peripheral side ambiance when on widescreen (ax > 4)
            if (ax > 4) {
                const leftGrad = ctx.createLinearGradient(0, 0, ax, 0);
                leftGrad.addColorStop(0, 'rgba(2, 6, 17, 0.72)');
                leftGrad.addColorStop(1, 'rgba(2, 6, 17, 0)');
                ctx.fillStyle = leftGrad;
                ctx.fillRect(0, 0, ax, this.viewHeight);

                const rightGrad = ctx.createLinearGradient(ax + aw, 0, this.viewWidth, 0);
                rightGrad.addColorStop(0, 'rgba(2, 6, 17, 0)');
                rightGrad.addColorStop(1, 'rgba(2, 6, 17, 0.72)');
                ctx.fillStyle = rightGrad;
                ctx.fillRect(ax + aw, 0, this.viewWidth - (ax + aw), this.viewHeight);
            }

            ctx.restore();
        }
    }

    window.PWONYX.Game = PwonyxGame;
})();
