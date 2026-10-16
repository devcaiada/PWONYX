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
        '#00f5d4', '#00bbf9', '#fee440', '#f15bb5', '#9b5de5', '#ff007f', '#38b000'
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

            // Parallax layers & Transition state (Creo - Flow Minimalist Organic Sci-Fi)
            this.parallax = {
                camX: 0,
                camY: 0,
                targetCamX: 0,
                targetCamY: 0,
                mouseOffsetX: 0,
                mouseOffsetY: 0,
                bgX: 0,
                bgY: 0,
                coreX: 0,
                coreY: 0,
                fgX: 0,
                fgY: 0,
                rot3D: 0
            };
            this.menuTime = 0;
            this.flowClickPulse = 0;
            this.transitionProgress = 0;
            this.transitionTimer = 0;
            this.transitionDuration = 0.95;
            this.pendingModeId = null;
            this.flowParticles = [];
            this.initFlowParticles();

            // Parallax image assets
            this.parallaxBgImg = new Image();
            this.parallaxBgImg.src = 'assets/images/parallax_bg.jpg';
            this.parallaxBgLoaded = false;
            this.parallaxBgImg.onload = () => { this.parallaxBgLoaded = true; };

            this.parallaxReliefImg = new Image();
            this.parallaxReliefImg.src = 'assets/images/parallax_relief.jpg';
            this.parallaxReliefLoaded = false;
            this.parallaxReliefImg.onload = () => { this.parallaxReliefLoaded = true; };

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
            this.progress = 0; // 0 to 100%
            this.targetBallCount = 1;
            this.ballSpawnTimer = 0;
            this.powerupSpawnTimer = 0;
            this.ammoSpawnTimer = 0;
            this.screenShake = 0;
            this.chromaticFlash = 0;

            // Active temporary buffs
            this.buffs = {
                wide: 0,
                slow: 0,
                sticky: 0,
                overdrive: 0
            };

            // Paddles (centered inside the 4:3 arena)
            const initCenterX = this.arenaX + this.arenaWidth / 2;
            this.player = {
                x: initCenterX,
                y: this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET,
                prevX: initCenterX,
                vx: 0,
                width: CFG.PADDLE_BASE_WIDTH,
                height: CFG.PADDLE_HEIGHT,
                ghostAmmo: 3,
                maxGhostAmmo: 8,
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

        initFlowParticles() {
            this.flowParticles = [];
            // Layer 0: Background space dust & faint cyan bokeh (factor 0.02)
            for (let i = 0; i < 42; i++) {
                this.flowParticles.push({
                    layer: 0,
                    factor: 0.02,
                    nx: Math.random(),
                    ny: Math.random(),
                    vx: (Math.random() - 0.5) * 0.008,
                    vy: (Math.random() - 0.5) * 0.006 - 0.003,
                    r: 1.0 + Math.random() * 2.6,
                    alpha: 0.08 + Math.random() * 0.26,
                    phase: Math.random() * Math.PI * 2,
                    isDark: false,
                    isBokeh: Math.random() > 0.45
                });
            }
            // Layer 1: Midground organic specks & soft bokeh near the core/trail (factor 0.05)
            for (let i = 0; i < 20; i++) {
                const isDark = i < 9;
                this.flowParticles.push({
                    layer: 1,
                    factor: 0.05,
                    nx: 0.2 + Math.random() * 0.65,
                    ny: 0.15 + Math.random() * 0.65,
                    vx: (Math.random() - 0.5) * 0.012,
                    vy: (Math.random() - 0.5) * 0.01,
                    r: isDark ? 2.5 + Math.random() * 4.5 : 2.2 + Math.random() * 5.0,
                    aspect: 0.55 + Math.random() * 0.4,
                    angle: Math.random() * Math.PI,
                    alpha: isDark ? 0.45 + Math.random() * 0.35 : 0.12 + Math.random() * 0.22,
                    phase: Math.random() * Math.PI * 2,
                    isDark,
                    isBokeh: !isDark
                });
            }
            // Layer 2: Foreground out-of-focus dark silhouettes & bokeh dust (factor 0.08)
            const fgPresets = [
                // Iconic dark out-of-focus fragments silhouetted against the top/right cyan glow (like reference art)
                { nx: 0.515, ny: 0.22, r: 7.5, aspect: 0.48, angle: 0.65, isDark: true, alpha: 0.78 },
                { nx: 0.735, ny: 0.25, r: 5.5, aspect: 0.62, angle: -0.4, isDark: true, alpha: 0.72 },
                { nx: 0.79, ny: 0.325, r: 6.2, aspect: 0.55, angle: 0.35, isDark: true, alpha: 0.68 },
                { nx: 0.59, ny: 0.10, r: 3.8, aspect: 0.7, angle: 0.2, isDark: true, alpha: 0.52 },
                { nx: 0.81, ny: 0.49, r: 4.2, aspect: 0.65, angle: -0.3, isDark: true, alpha: 0.55 },
                { nx: 0.695, ny: 0.66, r: 6.8, aspect: 0.6, angle: 0.5, isDark: true, alpha: 0.48 },
                { nx: 0.34, ny: 0.67, r: 6.5, aspect: 0.75, angle: -0.2, isDark: false, alpha: 0.22 },
                { nx: 0.24, ny: 0.75, r: 4.5, aspect: 0.85, angle: 0.1, isDark: false, alpha: 0.25 }
            ];
            fgPresets.forEach((p) => {
                this.flowParticles.push({
                    layer: 2,
                    factor: 0.08,
                    nx: p.nx,
                    ny: p.ny,
                    vx: (Math.random() - 0.5) * 0.006,
                    vy: (Math.random() - 0.5) * 0.005,
                    r: p.r,
                    aspect: p.aspect,
                    angle: p.angle,
                    alpha: p.alpha,
                    phase: Math.random() * Math.PI * 2,
                    isDark: p.isDark,
                    isBokeh: !p.isDark
                });
            });
            for (let i = 0; i < 16; i++) {
                const isDark = i % 3 === 0;
                this.flowParticles.push({
                    layer: 2,
                    factor: 0.08,
                    nx: Math.random(),
                    ny: Math.random(),
                    vx: (Math.random() - 0.5) * 0.015,
                    vy: (Math.random() - 0.5) * 0.012,
                    r: isDark ? 3.2 + Math.random() * 5.0 : 3.5 + Math.random() * 7.5,
                    aspect: 0.5 + Math.random() * 0.45,
                    angle: Math.random() * Math.PI,
                    alpha: isDark ? 0.38 + Math.random() * 0.35 : 0.08 + Math.random() * 0.18,
                    phase: Math.random() * Math.PI * 2,
                    isDark,
                    isBokeh: !isDark
                });
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
            };

            this.canvas.addEventListener('mousemove', (e) => {
                updateMousePos(e.clientX, e.clientY);
            });

            this.canvas.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    if (this.state === 'playing') {
                        this.fireGhostPaddle('player1');
                    } else if (this.state === 'menu') {
                        // Unlock & start intro music so the orb pulses to the kick via Web Audio API
                        if (!Audio.isPlaying) {
                            Audio.startMusic();
                            Audio.setLowPassEffect('normal');
                            Audio.updateAdaptiveLayers(4);
                        }
                        this.flowClickPulse = 1.0;
                    }
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
                        if (!Audio.isPlaying) {
                            Audio.startMusic();
                            Audio.setLowPassEffect('normal');
                            Audio.updateAdaptiveLayers(4);
                        }
                        this.flowClickPulse = 1.0;
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
            this.transitionDuration = 0.95;
            this.transitionProgress = 0;
            this.pendingModeId = modeId || this.mode.id;

            // Audio: Start music and low-pass sweep
            Audio.startMusic();
            Audio.setLowPassEffect('normal');

            // Explosive shockwave from central orb!
            const cx = this.arenaX + this.arenaWidth / 2;
            const cy = this.arenaY + this.arenaHeight / 2 - 14;
            this.particles.shockwave(cx, cy, '#00f5d4', 120);
            this.particles.shockwave(cx, cy, '#ff007f', 80);
            this.particles.burst(cx, cy, 36, '#00f5d4', 90, 360, 4);
            Audio.playScoreGoal();
            Audio.playGhostLaunch();

            if (this.callbacks.onTransitionStart) {
                this.callbacks.onTransitionStart();
            }
        }

        startMatch(modeId) {
            this.mode = CFG.MODES[modeId] || CFG.MODES.medium;
            this.state = 'playing';

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
            this.progress = 0;
            this.targetBallCount = 1;
            this.ballSpawnTimer = 0;
            this.powerupSpawnTimer = 4.5;
            this.ammoSpawnTimer = 3.2;
            this.screenShake = 0;

            this.buffs.wide = 0;
            this.buffs.slow = 0;
            this.buffs.sticky = 0;
            this.buffs.overdrive = 0;

            const startAmmo = 3 + Math.floor((this.upgrades.powerupDuration || 0) / 2);
            const cx = this.arenaX + this.arenaWidth / 2;
            this.player.x = cx;
            this.player.prevX = cx;
            this.player.y = this.arenaY + this.arenaHeight - CFG.PADDLE_Y_OFFSET;
            this.player.distanceTraveled = 0;
            this.player.ghostAmmo = startAmmo;
            this.player.maxGhostAmmo = 8 + Math.floor((this.upgrades.powerupDuration || 0) / 2);

            this.opponent.x = cx;
            this.opponent.prevX = cx;
            this.opponent.y = this.arenaY + CFG.PADDLE_Y_OFFSET;
            this.opponent.ghostAmmo = 3;

            this.recalculatePaddleStats();

            // Clear feedback canvas
            this.fbCtx.fillStyle = '#05050a';
            this.fbCtx.fillRect(0, 0, this.fbCanvas.width, this.fbCanvas.height);
            this.clearTrails();

            // Spawn first ball
            this.spawnBallInCenter(true);

            // Start adaptive 4-stem music
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

        spawnBallInCenter(towardsPlayer = false) {
            const speed = this.mode.baseBallSpeed * CFG.SPEED_SCALE;
            const angleOffset = (Math.random() - 0.5) * 0.75; // radians from vertical
            const dirY = towardsPlayer ? 1 : (Math.random() < 0.5 ? 1 : -1);
            const vx = Math.sin(angleOffset) * speed;
            const vy = Math.cos(angleOffset) * speed * dirY;
            const color = NEON_BALL_COLORS[this.balls.countActive() % NEON_BALL_COLORS.length];

            const cx = this.arenaX + this.arenaWidth / 2;
            const cy = this.arenaY + this.arenaHeight / 2;
            const b = this.balls.spawn(cx, cy, vx, vy, color);
            if (b) {
                this.particles.shockwave(cx, cy, color, 50);
                this.particles.burst(cx, cy, 14, color, 60, 220, 3);
            }
        }

        fireGhostPaddle(owner) {
            const isP1 = owner === 'player1';
            const pad = isP1 ? this.player : this.opponent;
            if (pad.ghostAmmo <= 0) return;

            pad.ghostAmmo--;
            const boostLevel = this.upgrades.ghostBooster || 0;
            const ghostWidth = pad.width * (1.05 + boostLevel * 0.06);
            const hits = 1 + Math.floor((boostLevel + 1) / 2);
            const vy = isP1 ? -380 : 380;
            const color = isP1 ? '#00f5d4' : '#ff007f';

            this.ghosts.spawn(pad.x, pad.y + (isP1 ? -14 : 14), vy, ghostWidth, hits, owner, color);
            this.particles.burst(pad.x, pad.y, 16, color, 50, 190, 3);
            Audio.playGhostLaunch();
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

        updateMenuParallax(dt) {
            this.menuTime += dt;
            if (this.flowClickPulse > 0) {
                this.flowClickPulse = Math.max(0, this.flowClickPulse - dt * 2.2);
            }

            // Smooth lerp parallax across the 3 depth layers:
            // Layer 0 (Background particles & rays): factor 0.02
            const targetBgX = this.parallax.mouseOffsetX * 0.02;
            const targetBgY = this.parallax.mouseOffsetY * 0.02;
            this.parallax.bgX += (targetBgX - this.parallax.bgX) * 0.08;
            this.parallax.bgY += (targetBgY - this.parallax.bgY) * 0.08;

            // Layer 1 (Central emissive core + wavy trail & subtle 3D rotation): factor 0.05
            const targetCoreX = this.parallax.mouseOffsetX * 0.05;
            const targetCoreY = this.parallax.mouseOffsetY * 0.05;
            this.parallax.coreX += (targetCoreX - this.parallax.coreX) * 0.08;
            this.parallax.coreY += (targetCoreY - this.parallax.coreY) * 0.08;
            const targetRot = (this.parallax.mouseOffsetX / Math.max(1, this.viewWidth * 0.5)) * 0.14;
            this.parallax.rot3D += (targetRot - this.parallax.rot3D) * 0.05;

            // Layer 2 (Foreground bokeh & silhouette dust): factor 0.08
            const targetFgX = this.parallax.mouseOffsetX * 0.08;
            const targetFgY = this.parallax.mouseOffsetY * 0.08;
            this.parallax.fgX += (targetFgX - this.parallax.fgX) * 0.08;
            this.parallax.fgY += (targetFgY - this.parallax.fgY) * 0.08;

            // Legacy normalized camera for transition effects
            this.parallax.camX += (this.parallax.targetCamX - this.parallax.camX) * dt * 4.2;
            this.parallax.camY += (this.parallax.targetCamY - this.parallax.camY) * dt * 4.2;

            // Subtle parallax shift on the DOM title/play block
            const menuCenter = document.getElementById('flow-menu-center');
            if (menuCenter && this.state === 'menu') {
                const tx = (-this.parallax.coreX * 0.35).toFixed(2);
                const ty = (-this.parallax.coreY * 0.35).toFixed(2);
                menuCenter.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            }

            // Update floating space dust / bokeh across layers
            if (this.flowParticles) {
                for (let i = 0; i < this.flowParticles.length; i++) {
                    const p = this.flowParticles[i];
                    p.nx += p.vx * dt;
                    p.ny += p.vy * dt;
                    if (p.nx < -0.1) p.nx = 1.1;
                    if (p.nx > 1.1) p.nx = -0.1;
                    if (p.ny < -0.1) p.ny = 1.1;
                    if (p.ny > 1.1) p.ny = -0.1;
                }
            }

            this.updateParticles(dt);
        }

        updateTransition(dt) {
            this.menuTime += dt;
            this.transitionTimer += dt;
            this.transitionProgress = Math.min(1, this.transitionTimer / this.transitionDuration);

            // Screen shake burst at the start of transition
            if (this.transitionTimer < 0.25) {
                this.screenShake = 6 * (1 - this.transitionTimer / 0.25);
            }

            this.updateParticles(dt);

            if (this.transitionProgress >= 1) {
                this.startMatch(this.pendingModeId || this.mode.id);
            }
        }

        updateGameplay(dt) {
            this.elapsedTime += dt;
            this.screenShake = Math.max(0, this.screenShake - dt * 25);
            this.chromaticFlash = Math.max(0, this.chromaticFlash - dt * 3);

            // Match progress bar
            if (this.mode.isSurvival) {
                this.progress = Math.min(100, (this.elapsedTime / 120) * 100);
            } else {
                this.progress = Math.min(100, (this.elapsedTime / this.mode.duration) * 100);
                if (this.progress >= 100) {
                    this.finishMatch(true);
                    return;
                }
            }

            // Update temporary buffs
            let hadWide = this.buffs.wide > 0;
            let hadSlow = this.buffs.slow > 0;
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

            // Escalate target ball count up to mode.maxBalls (up to 20 balls!)
            this.ballSpawnTimer += dt;
            if (this.ballSpawnTimer >= this.mode.spawnInterval && this.targetBallCount < this.mode.maxBalls) {
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

            // Ensure active balls match targetBallCount
            const activeBallCount = this.balls.countActive();
            if (activeBallCount < this.targetBallCount) {
                this.spawnBallInCenter();
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
            const keySpeed = 820;
            if (this.input.mouseActive) {
                // Smooth high-precision mouse tracking
                const diff = this.input.mouseX - this.player.x;
                this.player.x += diff * Math.min(1, dt * 28);
            } else {
                if (this.input.left) this.player.x -= keySpeed * dt;
                if (this.input.right) this.player.x += keySpeed * dt;
            }

            // Clamp Player 1 within arena bounds
            const halfP1 = this.player.width / 2;
            this.player.x = Math.max(this.arenaX + halfP1 + 8, Math.min(this.arenaX + this.arenaWidth - halfP1 - 8, this.player.x));
            const movedPx = Math.abs(this.player.x - this.player.prevX);
            this.player.vx = (this.player.x - this.player.prevX) / Math.max(dt, 0.001);
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
            const mastLevel = this.upgrades.powerupDuration || 0;
            const freqMult = 1 - mastLevel * 0.06;

            this.ammoSpawnTimer -= dt;
            if (this.ammoSpawnTimer <= 0) {
                this.ammoSpawnTimer = (6.5 + Math.random() * 4.0) * freqMult;
                this.powerups.spawn(
                    this.arenaX + 60 + Math.random() * (this.arenaWidth - 120),
                    this.arenaY + 90,
                    115 + Math.random() * 45,
                    'ammo'
                );
            }

            this.powerupSpawnTimer -= dt;
            if (this.powerupSpawnTimer <= 0) {
                this.powerupSpawnTimer = (11.0 + Math.random() * 5.0) * freqMult;
                const types = ['wide', 'slow', 'sticky', 'overdrive'];
                const pick = types[Math.floor(Math.random() * types.length)];
                this.powerups.spawn(
                    this.arenaX + 60 + Math.random() * (this.arenaWidth - 120),
                    this.arenaY + 80,
                    105 + Math.random() * 40,
                    pick
                );
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

                // Check collection by Player 1 paddle
                if (
                    Math.abs(p.y - this.player.y) <= p.radius + this.player.height &&
                    Math.abs(p.x - this.player.x) <= halfP1 + p.radius
                ) {
                    this.collectPowerUp(p);
                    p.active = false;
                } else if (p.y > this.arenaY + this.arenaHeight + 20) {
                    p.active = false;
                }
            }

            // --- Update Balls (with sub-stepping for precision) ---
            const slowMult = this.buffs.slow > 0 ? 0.54 : 1.0;
            const curveUpgrade = 1 + (this.upgrades.curvePower || 0) * 0.18;

            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (!b.active) continue;

                b.px = b.x;
                b.py = b.y;

                // Magnet/Sticky buff pulls incoming downward balls slightly toward player paddle X
                if (this.buffs.sticky > 0 && b.vy > 0 && b.y > this.arenaY + this.arenaHeight * 0.45) {
                    const pull = (this.player.x - b.x) * 3.2;
                    b.vx += pull * dt;
                }

                // Magnus Curve (Spin) effect in flight
                if (Math.abs(b.spin) > 0.01) {
                    b.vx += b.spin * dt * slowMult;
                }

                b.x += b.vx * dt * slowMult;
                b.y += b.vy * dt * slowMult;

                // Left / Right Arena Wall Bounce
                if (b.x - b.radius < this.arenaX + 6) {
                    b.x = this.arenaX + 6 + b.radius;
                    b.vx = Math.abs(b.vx);
                    this.particles.burst(b.x, b.y, 6, b.color, 40, 140, 2);
                    Audio.playBounce(0.9, false);
                } else if (b.x + b.radius > this.arenaX + this.arenaWidth - 6) {
                    b.x = this.arenaX + this.arenaWidth - 6 - b.radius;
                    b.vx = -Math.abs(b.vx);
                    this.particles.burst(b.x, b.y, 6, b.color, 40, 140, 2);
                    Audio.playBounce(0.9, false);
                }

                // Ghost Paddle Interception
                for (let gIdx = 0; gIdx < this.ghosts.size; gIdx++) {
                    const g = this.ghosts.items[gIdx];
                    if (!g.active) continue;
                    if (g.owner === 'player1' && b.vy > 0) {
                        if (
                            Math.abs(b.y - g.y) <= b.radius + g.height &&
                            Math.abs(b.x - g.x) <= g.width / 2 + b.radius
                        ) {
                            b.vy = -Math.abs(b.vy) * 1.06;
                            b.y = g.y - g.height - b.radius;
                            g.hitsRemaining--;
                            this.particles.shockwave(b.x, b.y, '#00f5d4', 42);
                            this.particles.burst(b.x, b.y, 14, '#00f5d4', 70, 230, 3);
                            this.texts.spawn(b.x, b.y, 'GHOST SAVE!', '#00f5d4', 13, 0.7);
                            Audio.playBounce(1.35, false);
                            if (this.callbacks.onGhostIntercept) this.callbacks.onGhostIntercept();
                            break;
                        }
                    } else if (g.owner === 'player2' && b.vy < 0) {
                        if (
                            Math.abs(b.y - g.y) <= b.radius + g.height &&
                            Math.abs(b.x - g.x) <= g.width / 2 + b.radius
                        ) {
                            b.vy = Math.abs(b.vy) * 1.06;
                            b.y = g.y + g.height + b.radius;
                            g.hitsRemaining--;
                            this.particles.shockwave(b.x, b.y, '#ff007f', 42);
                            Audio.playBounce(1.35, false);
                            break;
                        }
                    }
                }

                // Player 1 (Bottom) Paddle Collision
                const p1Top = this.player.y - this.player.height / 2;
                if (
                    b.vy > 0 &&
                    b.y + b.radius >= p1Top &&
                    b.y - b.radius <= this.player.y + this.player.height &&
                    Math.abs(b.x - this.player.x) <= halfP1 + b.radius + 3
                ) {
                    this.handlePaddleBounce(b, this.player, -1, curveUpgrade);
                    this.playerHits++;
                }

                // Opponent (Top) Paddle Collision
                const p2Bottom = this.opponent.y + this.opponent.height / 2;
                if (
                    b.vy < 0 &&
                    b.y - b.radius <= p2Bottom &&
                    b.y + b.radius >= this.opponent.y - this.opponent.height &&
                    Math.abs(b.x - this.opponent.x) <= halfP2 + b.radius + 3
                ) {
                    this.handlePaddleBounce(b, this.opponent, 1, 1.0);
                }

                // --- Check Goal Scored at Top (Opponent Missed!) ---
                if (b.y < this.arenaY - b.radius) {
                    b.active = false;
                    this.aiMisses++;
                    const overdriveMult = this.buffs.overdrive > 0 ? 2 : 1;
                    const curveBonus = b.isCurvedShot ? 1.5 : 1.0;
                    const pts = Math.round(25 * this.mode.scoreMultiplier * overdriveMult * curveBonus);
                    this.score += pts;

                    if (this.mode.isSurvival) {
                        this.survivalHealth = Math.min(100, this.survivalHealth + 2.5);
                    }

                    this.particles.burst(b.x, this.arenaY + 12, 22, '#00f5d4', 80, 280, 3.5);
                    this.particles.shockwave(b.x, this.arenaY + 12, '#00f5d4', 65);
                    this.texts.spawn(
                        Math.max(this.arenaX + 50, Math.min(this.arenaX + this.arenaWidth - 50, b.x)),
                        this.arenaY + 38,
                        b.isCurvedShot ? `+${pts} CURVE!` : `+${pts}`,
                        b.isCurvedShot ? '#fee440' : '#00f5d4',
                        16,
                        0.85
                    );
                    Audio.playScoreGoal();

                    if (b.isCurvedShot && this.callbacks.onCurveGoal) {
                        this.callbacks.onCurveGoal();
                    }
                    this.updateDominationRating();
                }

                // --- Check Ball Missed at Bottom (Player Missed!) ---
                if (b.y > this.arenaY + this.arenaHeight + b.radius) {
                    b.active = false;
                    this.playerMisses++;

                    // Pwong 2 Dynamic Penalty Scaling:
                    // The more balls on screen, the less an individual miss penalizes you!
                    const activeNow = Math.max(1, currentBalls);
                    const scaleFactor = 1 / Math.pow(activeNow, 0.65);
                    const rawPenalty = Math.max(3, Math.round(32 * scaleFactor * this.mode.scoreMultiplier));
                    this.score = Math.max(0, this.score - rawPenalty);

                    this.screenShake = Math.min(10, 4 + 8 * scaleFactor);
                    this.chromaticFlash = 0.7;
                    this.particles.burst(b.x, this.arenaY + this.arenaHeight - 10, 20, '#ff0055', 70, 250, 3.5);
                    this.texts.spawn(
                        Math.max(this.arenaX + 50, Math.min(this.arenaX + this.arenaWidth - 50, b.x)),
                        this.arenaY + this.arenaHeight - 38,
                        `-${rawPenalty}`,
                        '#ff0055',
                        16,
                        0.8
                    );
                    Audio.playMissPenalty();

                    if (this.mode.isSurvival) {
                        const hpLoss = 14 * scaleFactor;
                        this.survivalHealth = Math.max(0, this.survivalHealth - hpLoss);
                        if (this.survivalHealth <= 0) {
                            this.finishMatch(false);
                            return;
                        }
                    }

                    this.updateDominationRating();
                }
            }

            this.updateParticles(dt);
            this.updateFloatingTexts(dt);
        }

        handlePaddleBounce(ball, paddle, dirY, curveMult) {
            const halfW = paddle.width / 2;
            const relIntersect = Math.max(-1, Math.min(1, (ball.x - paddle.x) / halfW));

            // Current speed scales slightly up to mode.maxBallSpeed
            const currentSpeed = Math.hypot(ball.vx, ball.vy);
            const nextSpeed = Math.min(this.mode.maxBallSpeed * CFG.SPEED_SCALE, currentSpeed * 1.035);

            // Bounce angle up to 62 degrees at paddle extremes
            const bounceAngle = relIntersect * (Math.PI * 0.34);
            ball.vx = Math.sin(bounceAngle) * nextSpeed + paddle.vx * 0.22;
            ball.vy = Math.cos(bounceAngle) * nextSpeed * dirY;

            // Impart Magnus Spin from paddle movement + edge hit
            const spinInput = (-paddle.vx * 0.65 + relIntersect * 220) * curveMult;
            ball.spin = Math.max(-650, Math.min(650, spinInput));
            ball.isCurvedShot = dirY < 0 && Math.abs(ball.spin) > 240;

            ball.y = dirY < 0
                ? paddle.y - paddle.height / 2 - ball.radius - 1
                : paddle.y + paddle.height / 2 + ball.radius + 1;

            const sparkColor = ball.isCurvedShot ? '#fee440' : paddle.color;
            this.particles.burst(ball.x, ball.y, ball.isCurvedShot ? 16 : 10, sparkColor, 60, 220, 3);
            Audio.playBounce(dirY < 0 ? 1.15 : 0.95, ball.isCurvedShot);
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

            let targetX = this.arenaX + this.arenaWidth / 2;
            if (bestBall) {
                // Predict slightly ahead with AI reaction factor
                targetX = bestBall.x + bestBall.vx * shortestTime * 0.35 * this.mode.aiReaction;
            }

            const diff = targetX - this.opponent.x;
            const maxStep = this.mode.aiSpeed * CFG.SPEED_SCALE * dt;
            if (Math.abs(diff) <= maxStep) {
                this.opponent.x = targetX;
            } else {
                this.opponent.x += Math.sign(diff) * maxStep;
            }
        }

        collectPowerUp(p) {
            const mastLevel = this.upgrades.powerupDuration || 0;
            const durMult = 1 + mastLevel * 0.15;
            const def = CFG.POWERUPS[p.type] || CFG.POWERUPS.ammo;

            this.particles.shockwave(p.x, p.y, def.color, 60);
            this.particles.burst(p.x, p.y, 20, def.color, 70, 240, 3.5);
            this.texts.spawn(p.x, p.y - 16, def.label, def.color, 16, 1.0);
            Audio.playPowerUp();

            if (p.type === 'ammo') {
                this.player.ghostAmmo = Math.min(this.player.maxGhostAmmo, this.player.ghostAmmo + 2);
            } else if (p.type === 'wide') {
                this.buffs.wide = def.baseDuration * durMult;
                this.recalculatePaddleStats();
            } else if (p.type === 'slow') {
                this.buffs.slow = def.baseDuration * durMult;
                Audio.setLowPassEffect('slowmo');
            } else if (p.type === 'sticky') {
                this.buffs.sticky = def.baseDuration * durMult;
            } else if (p.type === 'overdrive') {
                this.buffs.overdrive = def.baseDuration * durMult;
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

        traceOrganicContour(ctx, cx, cy, rx, ry, phase, rotOffset, lobeAmp = 0.09) {
            const steps = 64;
            ctx.beginPath();
            for (let s = 0; s <= steps; s++) {
                const a = (s / steps) * Math.PI * 2;
                const wave =
                    1 +
                    lobeAmp * Math.sin(a * 3 + phase) +
                    (lobeAmp * 0.72) * Math.cos(a * 2 - phase * 0.7 + rotOffset) +
                    (lobeAmp * 0.45) * Math.sin(a * 5 + phase * 1.3);
                const px = cx + Math.cos(a) * rx * wave;
                const py = cy + Math.sin(a) * ry * wave;
                if (s === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        renderFlowParticleLayer(ctx, layerIndex, offsetX, offsetY, vw, vh, time, kickEnergy, fadeAlpha = 1) {
            if (!this.flowParticles) return;
            ctx.save();
            for (let i = 0; i < this.flowParticles.length; i++) {
                const p = this.flowParticles[i];
                if (p.layer !== layerIndex) continue;

                const px = p.nx * vw - offsetX;
                const py = p.ny * vh - offsetY;
                const r = Math.max(0.5, p.r * (Math.min(vw, vh) / 768));
                const twinkle = 0.78 + 0.22 * Math.sin(time * 1.7 + p.phase);
                const alpha = Math.min(1, p.alpha * twinkle * fadeAlpha);

                if (p.isDark) {
                    // Out-of-focus dark silhouette dust/fragments (signature Creo - Flow depth cue)
                    const aspect = p.aspect || 0.65;
                    const angle = (p.angle || 0) + time * 0.08;
                    const dg = ctx.createRadialGradient(px, py, r * 0.1, px, py, r * 1.35);
                    dg.addColorStop(0, `rgba(2, 7, 13, ${alpha})`);
                    dg.addColorStop(0.58, `rgba(5, 14, 24, ${alpha * 0.65})`);
                    dg.addColorStop(1, 'rgba(5, 14, 24, 0)');
                    ctx.fillStyle = dg;
                    ctx.beginPath();
                    ctx.ellipse(
                        px,
                        py,
                        r * 1.35,
                        r * 1.35 * aspect,
                        angle,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                } else {
                    // Soft cyan/white space dust & bokeh
                    const boost = layerIndex === 2 ? kickEnergy * 0.18 : 0;
                    const lg = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
                    if (p.isBokeh) {
                        lg.addColorStop(0, `rgba(240, 252, 255, ${Math.min(1, alpha + boost)})`);
                        lg.addColorStop(0.42, `rgba(145, 224, 255, ${(alpha + boost) * 0.45})`);
                        lg.addColorStop(1, 'rgba(70, 175, 235, 0)');
                    } else {
                        lg.addColorStop(0, `rgba(150, 228, 255, ${Math.min(1, alpha + boost)})`);
                        lg.addColorStop(0.48, `rgba(65, 165, 225, ${(alpha + boost) * 0.4})`);
                        lg.addColorStop(1, 'rgba(25, 95, 155, 0)');
                    }
                    ctx.fillStyle = lg;
                    ctx.beginPath();
                    ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.restore();
        }

        renderParallaxMenu(ctx, pulse, dt) {
            const time = this.menuTime;
            const vw = this.viewWidth;
            const vh = this.viewHeight;
            const minDim = Math.min(vw, vh);

            // Parallaxes updated with smooth lerp (0.02, 0.05, 0.08)
            const bgX = this.parallax.bgX || 0;
            const bgY = this.parallax.bgY || 0;
            const coreX = this.parallax.coreX || 0;
            const coreY = this.parallax.coreY || 0;
            const fgX = this.parallax.fgX || 0;
            const fgY = this.parallax.fgY || 0;
            const rot3D = this.parallax.rot3D || 0;

            const isTrans = this.state === 'transitioning';
            const t = this.transitionProgress || 0;
            const easeT = t * t * (3 - 2 * t);
            const sceneFade = Math.max(0, 1 - easeT * 1.15);

            // Web Audio API low-frequency (kick/bass) reactivity + organic idle breathing
            const bass = Audio.bassEnergy || 0;
            const beat = Audio.beatPulse || 0;
            const idleBreath = Math.sin(time * 1.9) * 0.5 + 0.5;
            const kickEnergy = Math.max(bass * 1.15, beat * 0.9, idleBreath * 0.16) + (this.flowClickPulse || 0) * 0.45;

            // =========================================================================
            // 1. DEEP PETROL / MARINE BLUE ATMOSPHERIC BACKGROUND + TOP-RIGHT ILLUMINATION
            // =========================================================================
            const bgGrad = ctx.createLinearGradient(vw * 0.12, vh * 0.95, vw * 0.92, vh * 0.04);
            bgGrad.addColorStop(0, '#020509');
            bgGrad.addColorStop(0.35, '#05101c');
            bgGrad.addColorStop(0.7, '#0d2942');
            bgGrad.addColorStop(1, '#1d4d6e');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, vw, vh);

            // Radial cyan-petrol atmospheric glow emanating from top-right corner
            const trX = vw * 0.88 - bgX * 1.4;
            const trY = vh * 0.10 - bgY * 1.4;
            const topRightGlow = ctx.createRadialGradient(trX, trY, minDim * 0.02, trX, trY, Math.max(vw, vh) * 0.95);
            topRightGlow.addColorStop(0, `rgba(115, 200, 242, ${(0.38 + kickEnergy * 0.08) * sceneFade})`);
            topRightGlow.addColorStop(0.28, `rgba(54, 132, 178, ${0.28 * sceneFade})`);
            topRightGlow.addColorStop(0.62, `rgba(16, 48, 76, ${0.14 * sceneFade})`);
            topRightGlow.addColorStop(1, 'rgba(3, 8, 15, 0)');
            ctx.fillStyle = topRightGlow;
            ctx.fillRect(0, 0, vw, vh);

            // Soft Volumetric Light Shafts (God Rays) from top-right to bottom-left
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const rayOriginX = vw * 1.05 - bgX * 1.6;
            const rayOriginY = -vh * 0.08 - bgY * 1.6;
            const rayAngles = [2.32, 2.41, 2.49, 2.57, 2.66, 2.75];
            const rayWidths = [0.09, 0.14, 0.07, 0.12, 0.08, 0.11];
            const rayLen = Math.hypot(vw, vh) * 1.35;

            for (let r = 0; r < rayAngles.length; r++) {
                const shimmer = Math.sin(time * 0.55 + r * 1.7) * 0.015;
                const angle = rayAngles[r] + shimmer + rot3D * 0.08;
                const halfSpread = rayWidths[r];
                const x1 = rayOriginX + Math.cos(angle - halfSpread) * rayLen;
                const y1 = rayOriginY + Math.sin(angle - halfSpread) * rayLen;
                const x2 = rayOriginX + Math.cos(angle + halfSpread) * rayLen;
                const y2 = rayOriginY + Math.sin(angle + halfSpread) * rayLen;

                const rayGrad = ctx.createLinearGradient(
                    rayOriginX,
                    rayOriginY,
                    rayOriginX + Math.cos(angle) * rayLen * 0.85,
                    rayOriginY + Math.sin(angle) * rayLen * 0.85
                );
                const baseRayAlpha = (0.048 + (r % 2) * 0.022 + kickEnergy * 0.018) * sceneFade;
                rayGrad.addColorStop(0, `rgba(155, 226, 255, ${baseRayAlpha * 1.3})`);
                rayGrad.addColorStop(0.35, `rgba(92, 182, 230, ${baseRayAlpha})`);
                rayGrad.addColorStop(0.75, `rgba(34, 98, 145, ${baseRayAlpha * 0.35})`);
                rayGrad.addColorStop(1, 'rgba(10, 35, 60, 0)');

                ctx.fillStyle = rayGrad;
                ctx.beginPath();
                ctx.moveTo(rayOriginX, rayOriginY);
                ctx.lineTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();

            // Deep bottom-left abyssal shadow vignette for rich contrast
            const blShadow = ctx.createRadialGradient(
                vw * 0.08, vh * 0.92, minDim * 0.05,
                vw * 0.18, vh * 0.85, Math.max(vw, vh) * 0.85
            );
            blShadow.addColorStop(0, 'rgba(1, 3, 7, 0.82)');
            blShadow.addColorStop(0.55, 'rgba(2, 6, 12, 0.38)');
            blShadow.addColorStop(1, 'rgba(2, 6, 12, 0)');
            ctx.fillStyle = blShadow;
            ctx.fillRect(0, 0, vw, vh);

            // =========================================================================
            // 2. LAYER 0: BACKGROUND PARTICLES (Factor 0.02)
            // =========================================================================
            this.renderFlowParticleLayer(ctx, 0, bgX, bgY, vw, vh, time, kickEnergy, sceneFade);

            // =========================================================================
            // 3. CENTRAL ORGANIC CORE + TRANSLUCENT WAVY TRAIL SHELLS (Factor 0.05)
            // =========================================================================
            // Positioned slightly right of center & upper-mid so the trail flows left
            // and "P W O N Y X" / "P L A Y" sits cleanly right underneath the sphere.
            const floatY = Math.sin(time * 1.35) * 6;
            const floatX = Math.cos(time * 0.95) * 4;
            const baseCoreX = vw * 0.54 - coreX * 1.15 + floatX;
            const baseCoreY = vh * 0.455 - coreY * 1.15 + floatY - (isTrans ? easeT * 420 : 0);

            // Audio-reactive scale & bloom intensity on low-frequency kick
            const kickScale = 1 + kickEnergy * 0.075 + (isTrans ? easeT * 0.35 : 0);
            const coreRadius = minDim * 0.148 * kickScale;

            // Trail direction vector pointing toward the upper-left (~ -163 deg, matching Creo - Flow)
            const trailAngle = -2.84 + rot3D * 0.28 + Math.sin(time * 0.7) * 0.025;
            const dirX = Math.cos(trailAngle);
            const dirY = Math.sin(trailAngle);
            const perpX = -dirY;
            const perpY = dirX;

            // --- 3A. Translucent Wavy Trail Silhouette Shells (Back-to-Front: 7 down to 1) ---
            const numShells = 7;
            const maxTrailDist = coreRadius * 2.55;

            ctx.save();
            for (let i = numShells; i >= 1; i--) {
                const frac = i / numShells; // 1.0 (furthest left) -> 0.14 (closest to core)
                // Subtle 3D parallax foreshortening when rotating with mouse
                const depth3DShift = rot3D * coreRadius * 1.45 * frac;
                const waveUndulation = Math.sin(time * 1.8 - i * 0.65) * (coreRadius * 0.045 * frac);

                const sx = baseCoreX + dirX * (maxTrailDist * Math.pow(frac, 0.92)) + depth3DShift + perpX * waveUndulation;
                const sy = baseCoreY + dirY * (maxTrailDist * Math.pow(frac, 0.92)) + perpY * waveUndulation;

                // Shells taper down as they trail to the upper-left and compress slightly along the trail axis
                const shellScale = (1 - frac * 0.54) * (1 + kickEnergy * 0.03 * (1 - frac));
                const rx = coreRadius * shellScale * (0.86 + 0.06 * Math.cos(rot3D));
                const ry = coreRadius * shellScale * 1.04;
                const shellPhase = i * 1.35 + time * 0.55;

                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(trailAngle + Math.PI + rot3D * 0.2 * frac);

                // Trace organic wavy jellyfish-bell / frozen-smoke silhouette
                this.traceOrganicContour(ctx, 0, 0, rx, ry, shellPhase, rot3D, 0.085 + frac * 0.03);

                // Translucent smoky cyan-petrol fill with brighter rim toward the core
                const shellAlpha = (0.11 + (1 - frac) * 0.22) * sceneFade;
                const fillGrad = ctx.createLinearGradient(-rx, -ry * 0.3, rx * 1.1, ry * 0.4);
                fillGrad.addColorStop(0, `rgba(14, 42, 68, ${shellAlpha * 0.55})`);
                fillGrad.addColorStop(0.55, `rgba(62, 138, 185, ${shellAlpha * 0.85})`);
                fillGrad.addColorStop(1, `rgba(175, 230, 255, ${shellAlpha * 1.25})`);
                ctx.fillStyle = fillGrad;
                ctx.fill();

                // Crisp gossamer rim highlight (characteristic translucent layered ridge in Creo - Flow)
                ctx.lineWidth = 1.2 + (1 - frac) * 1.3;
                ctx.strokeStyle = `rgba(182, 232, 255, ${(0.16 + (1 - frac) * 0.34 + kickEnergy * 0.08) * sceneFade})`;
                ctx.shadowColor = '#7fd8ff';
                ctx.shadowBlur = 10 + (1 - frac) * 12;
                ctx.stroke();

                // Delicate internal curved membrane ribs (frozen smoke / jellyfish striations)
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(195, 238, 255, ${(0.07 + (1 - frac) * 0.12) * sceneFade})`;
                ctx.lineWidth = 0.85;
                for (let rib = -1; rib <= 1; rib++) {
                    ctx.beginPath();
                    const ribY = rib * ry * 0.36;
                    ctx.moveTo(-rx * 0.65, ribY * 0.7);
                    ctx.quadraticCurveTo(
                        0,
                        ribY + Math.sin(shellPhase + rib) * ry * 0.14,
                        rx * 0.78,
                        ribY * 0.85
                    );
                    ctx.stroke();
                }

                ctx.restore();
            }
            ctx.restore();

            // --- 3B. Intense Outer Cyan-Blue Atmospheric Bloom around Central Core ---
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const bloomRadius = coreRadius * (2.65 + kickEnergy * 0.55);
            const outerBloom = ctx.createRadialGradient(
                baseCoreX, baseCoreY, coreRadius * 0.25,
                baseCoreX, baseCoreY, bloomRadius
            );
            const bloomIntensity = Math.min(1, (0.62 + kickEnergy * 0.35) * sceneFade);
            outerBloom.addColorStop(0, `rgba(235, 250, 255, ${bloomIntensity})`);
            outerBloom.addColorStop(0.28, `rgba(120, 212, 255, ${bloomIntensity * 0.78})`);
            outerBloom.addColorStop(0.58, `rgba(42, 138, 204, ${bloomIntensity * 0.36})`);
            outerBloom.addColorStop(1, 'rgba(12, 55, 95, 0)');
            ctx.fillStyle = outerBloom;
            ctx.beginPath();
            ctx.arc(baseCoreX, baseCoreY, bloomRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // --- 3C. Sculpted Translucent Rim Folds Embracing the Core ---
            for (let fold = 2; fold >= 1; fold--) {
                const foldScale = 1.06 + fold * 0.075 + kickEnergy * 0.03;
                const foldShiftX = -dirX * coreRadius * 0.06 * fold + rot3D * coreRadius * 0.25;
                const foldShiftY = -dirY * coreRadius * 0.06 * fold;

                ctx.save();
                ctx.translate(baseCoreX + foldShiftX, baseCoreY + foldShiftY);
                ctx.rotate(rot3D * 0.18);
                this.traceOrganicContour(
                    ctx,
                    0,
                    0,
                    coreRadius * foldScale,
                    coreRadius * foldScale * 0.96,
                    time * 0.8 + fold * 2.1,
                    rot3D,
                    0.065
                );
                const foldGrad = ctx.createRadialGradient(
                    coreRadius * 0.15, -coreRadius * 0.1, coreRadius * 0.2,
                    0, 0, coreRadius * foldScale * 1.1
                );
                foldGrad.addColorStop(0, `rgba(255, 255, 255, ${0.45 * sceneFade})`);
                foldGrad.addColorStop(0.65, `rgba(155, 222, 255, ${0.32 * sceneFade})`);
                foldGrad.addColorStop(1, `rgba(70, 165, 225, ${0.08 * sceneFade})`);
                ctx.fillStyle = foldGrad;
                ctx.fill();

                ctx.lineWidth = 1.4;
                ctx.strokeStyle = `rgba(200, 242, 255, ${(0.38 + kickEnergy * 0.15) * sceneFade})`;
                ctx.stroke();
                ctx.restore();
            }

            // --- 3D. White-Hot Emissive Central Core (with subtle warm cream/rose center & cyan edge reflections) ---
            ctx.save();
            ctx.translate(baseCoreX, baseCoreY);
            ctx.rotate(rot3D * 0.12);

            this.traceOrganicContour(
                ctx,
                0,
                0,
                coreRadius * 1.02,
                coreRadius * 0.97,
                time * 0.65,
                rot3D,
                0.052
            );

            // Inner gradient matching Creo - Flow's white-hot right dome, subtle warm blush core, and icy-cyan left rim
            const coreGrad = ctx.createRadialGradient(
                coreRadius * 0.22 - rot3D * coreRadius * 0.4,
                -coreRadius * 0.08,
                coreRadius * 0.08,
                0,
                0,
                coreRadius * 1.08
            );
            coreGrad.addColorStop(0, `rgba(255, 255, 255, ${sceneFade})`);
            coreGrad.addColorStop(0.42, `rgba(255, 250, 247, ${sceneFade})`);
            coreGrad.addColorStop(0.68, `rgba(244, 232, 232, ${0.98 * sceneFade})`);
            coreGrad.addColorStop(0.88, `rgba(195, 228, 250, ${0.95 * sceneFade})`);
            coreGrad.addColorStop(1, `rgba(130, 210, 255, ${0.9 * sceneFade})`);

            ctx.shadowColor = '#9be4ff';
            ctx.shadowBlur = (34 + kickEnergy * 32) * sceneFade;
            ctx.fillStyle = coreGrad;
            ctx.fill();

            // Subtle internal sculptural shading folds inside the white-hot mass (left side relief)
            ctx.save();
            ctx.clip();
            for (let c = 0; c < 3; c++) {
                const creaseX = -coreRadius * (0.28 + c * 0.22) + rot3D * coreRadius * 0.35;
                const creaseGrad = ctx.createLinearGradient(
                    creaseX - coreRadius * 0.25, 0,
                    creaseX + coreRadius * 0.35, 0
                );
                creaseGrad.addColorStop(0, 'rgba(150, 195, 230, 0)');
                creaseGrad.addColorStop(0.5, `rgba(165, 202, 232, ${0.24 * sceneFade})`);
                creaseGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = creaseGrad;
                ctx.beginPath();
                ctx.ellipse(creaseX, 0, coreRadius * 0.32, coreRadius * 0.95, 0.18, 0, Math.PI * 2);
                ctx.fill();
            }

            // Tiny warm-dark out-of-focus dust specks drifting across the bright white face (exact detail from reference)
            const faceSpecks = [
                { x: 0.08, y: 0.06, r: 0.042, a: 0.26 },
                { x: 0.26, y: 0.36, r: 0.032, a: 0.32 },
                { x: -0.38, y: 0.18, r: 0.038, a: 0.22 },
                { x: -0.14, y: -0.28, r: 0.025, a: 0.18 }
            ];
            for (let s = 0; s < faceSpecks.length; s++) {
                const sp = faceSpecks[s];
                const sx = (sp.x + Math.sin(time * 0.4 + s) * 0.02) * coreRadius - fgX * 0.15;
                const sy = (sp.y + Math.cos(time * 0.35 + s) * 0.02) * coreRadius - fgY * 0.15;
                const sr = sp.r * coreRadius;
                const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
                sg.addColorStop(0, `rgba(92, 64, 68, ${sp.a * sceneFade})`);
                sg.addColorStop(0.6, `rgba(128, 96, 102, ${sp.a * 0.45 * sceneFade})`);
                sg.addColorStop(1, 'rgba(128, 96, 102, 0)');
                ctx.fillStyle = sg;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            ctx.restore();

            // =========================================================================
            // 4. LAYER 1 & LAYER 2: MID AND FOREGROUND BOKEH & DARK SILHOUETTE DUST
            // =========================================================================
            this.renderFlowParticleLayer(ctx, 1, coreX, coreY, vw, vh, time, kickEnergy, sceneFade);
            this.renderFlowParticleLayer(ctx, 2, fgX, fgY, vw, vh, time, kickEnergy, sceneFade);

            // Render interactive click shockwaves / burst particles
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

            // 1. Pure black base (like the original)
            ctx.fillStyle = '#000';
            ctx.fillRect(-20, -20, this.viewWidth + 40, this.viewHeight + 40);

            // In widescreen, draw subtle ambient cosmic nebula in peripheral background
            if (this.arenaX > 4 && this.parallaxBgLoaded && this.parallaxBgImg) {
                ctx.save();
                ctx.globalAlpha = 0.24;
                ctx.drawImage(this.parallaxBgImg, 0, 0, this.viewWidth, this.viewHeight);
                ctx.restore();
            }

            // 2. Psychedelic Zoom-Feedback Layer (Pwong 2 background tunnel)
            if (this.feedbackMode !== 'off') {
                const fbAlpha = this.feedbackMode === 'high' ? 0.4 + pulse * 0.16 : 0.2;
                ctx.globalAlpha = fbAlpha;
                ctx.drawImage(this.fbCanvas, 0, 0, this.viewWidth, this.viewHeight);
                ctx.globalAlpha = 1;
            }

            // 3. Discreet center line inside arena
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + bass * 0.1})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 10]);
            ctx.beginPath();
            ctx.moveTo(this.arenaX, this.arenaY + this.arenaHeight / 2);
            ctx.lineTo(this.arenaX + this.arenaWidth, this.arenaY + this.arenaHeight / 2);
            ctx.stroke();

            // Subtle extension outside arena on widescreen
            if (this.arenaX > 4) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
                ctx.beginPath();
                ctx.moveTo(0, this.arenaY + this.arenaHeight / 2);
                ctx.lineTo(this.arenaX, this.arenaY + this.arenaHeight / 2);
                ctx.moveTo(this.arenaX + this.arenaWidth, this.arenaY + this.arenaHeight / 2);
                ctx.lineTo(this.viewWidth, this.arenaY + this.arenaHeight / 2);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // 4. Light trails (additive)
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(this.trailCanvas, 0, 0, this.viewWidth, this.viewHeight);
            ctx.globalCompositeOperation = 'source-over';

            // 5. Power-ups, ghost paddles, paddles
            this.renderPowerUps(ctx);
            this.renderGhostPaddles(ctx);
            this.renderPaddle(ctx, this.opponent, false, pulse);
            this.renderPaddle(ctx, this.player, true, pulse);

            // 6. Ball heads, shockwaves, floating texts
            this.renderBalls(ctx);
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

            // Darken slightly so colors stay vibrant without saturating to pure white
            fCtx.fillStyle = 'rgba(5, 5, 14, 0.14)';
            fCtx.fillRect(0, 0, fw, fh);
        }

        renderPaddle(ctx, pad, isPlayer, pulse) {
            ctx.save();
            const halfW = pad.width / 2;
            const halfH = pad.height / 2;
            const x = pad.x - halfW;
            const y = pad.y - halfH;

            let color = pad.color;
            if (isPlayer && this.buffs.overdrive > 0) color = '#fee440';
            else if (isPlayer && this.buffs.sticky > 0) color = '#f15bb5';

            ctx.shadowColor = color;
            ctx.shadowBlur = 16 + pulse * 14;
            ctx.fillStyle = color;

            // Rounded neon paddle
            ctx.beginPath();
            ctx.roundRect(x, y, pad.width, pad.height, 7);
            ctx.fill();

            // Inner white energy core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(x + 6, y + 3, pad.width - 12, pad.height - 6, 4);
            ctx.fill();

            // Draw Ghost Paddle Ammo pips under Player 1 paddle
            if (isPlayer) {
                const ammo = pad.ghostAmmo;
                const pipSpacing = 10;
                const startX = pad.x - ((ammo - 1) * pipSpacing) / 2;
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#00f5d4';
                for (let i = 0; i < ammo; i++) {
                    ctx.beginPath();
                    ctx.arc(startX + i * pipSpacing, pad.y + 15, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.restore();
        }

        renderGhostPaddles(ctx) {
            ctx.save();
            for (let i = 0; i < this.ghosts.size; i++) {
                const g = this.ghosts.items[i];
                if (!g.active) continue;

                ctx.shadowColor = g.color;
                ctx.shadowBlur = 18;
                ctx.strokeStyle = g.color;
                ctx.fillStyle = 'rgba(0, 245, 212, 0.25)';
                ctx.lineWidth = 2.5;

                ctx.beginPath();
                ctx.roundRect(g.x - g.width / 2, g.y - g.height / 2, g.width, g.height, 6);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        renderPowerUps(ctx) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 14px system-ui, sans-serif';

            for (let i = 0; i < this.powerups.size; i++) {
                const p = this.powerups.items[i];
                if (!p.active) continue;

                const def = CFG.POWERUPS[p.type] || CFG.POWERUPS.ammo;
                const r = p.radius + Math.sin(p.pulse) * 2.5;

                ctx.shadowColor = def.color;
                ctx.shadowBlur = 14;
                ctx.strokeStyle = def.color;
                ctx.fillStyle = 'rgba(10, 12, 28, 0.85)';
                ctx.lineWidth = 2.5;

                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(def.symbol, p.x, p.y + 1);
            }
            ctx.restore();
        }

        renderBalls(ctx) {
            for (let i = 0; i < this.balls.size; i++) {
                const b = this.balls.items[i];
                if (!b.active) continue;

                // Colored body + white-hot core (the glow comes from the trail layer)
                ctx.fillStyle = b.isCurvedShot ? '#fee440' : b.color;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius * 0.6, 0, Math.PI * 2);
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
            const primaryColor = flash ? '#ff0055' : '#00f5d4';
            const glowBlur = 8 + pulse * 14 + high * 8;

            const ax = this.arenaX;
            const ay = this.arenaY;
            const aw = this.arenaWidth;
            const ah = this.arenaHeight;

            // 1. Physical Left & Right Neon Laser Walls (Bouncers)
            ctx.lineWidth = 3.0 + pulse * 2.0;
            ctx.strokeStyle = primaryColor;
            ctx.shadowColor = primaryColor;
            ctx.shadowBlur = glowBlur;

            // Left Wall
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax, ay + ah);
            ctx.stroke();

            // Right Wall
            ctx.beginPath();
            ctx.moveTo(ax + aw, ay);
            ctx.lineTo(ax + aw, ay + ah);
            ctx.stroke();

            // 2. Corner Brackets & Accent Markers
            const bracketLen = 28;
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = flash ? '#ff0055' : '#fee440';
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

            // 3. Subtle Goal Lines (Top and Bottom)
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + pulse * 0.15})`;
            ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + aw, ay);
            ctx.moveTo(ax, ay + ah);
            ctx.lineTo(ax + aw, ay + ah);
            ctx.stroke();
            ctx.setLineDash([]);

            // 4. Peripheral side ambiance when on widescreen (ax > 4)
            if (ax > 4) {
                const leftGrad = ctx.createLinearGradient(0, 0, ax, 0);
                leftGrad.addColorStop(0, 'rgba(2, 4, 12, 0.65)');
                leftGrad.addColorStop(1, 'rgba(2, 4, 12, 0)');
                ctx.fillStyle = leftGrad;
                ctx.fillRect(0, 0, ax, this.viewHeight);

                const rightGrad = ctx.createLinearGradient(ax + aw, 0, this.viewWidth, 0);
                rightGrad.addColorStop(0, 'rgba(2, 4, 12, 0)');
                rightGrad.addColorStop(1, 'rgba(2, 4, 12, 0.65)');
                ctx.fillStyle = rightGrad;
                ctx.fillRect(ax + aw, 0, this.viewWidth - (ax + aw), this.viewHeight);
            }

            ctx.restore();
        }
    }

    window.PWONYX.Game = PwonyxGame;
})();
