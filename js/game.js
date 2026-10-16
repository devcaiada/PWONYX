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

            // Parallax relief layers & Transition state (inspired by Creo - Flow)
            this.parallax = {
                camX: 0,
                camY: 0,
                targetCamX: 0,
                targetCamY: 0
            };
            this.menuTime = 0;
            this.transitionProgress = 0;
            this.transitionTimer = 0;
            this.transitionDuration = 0.95;
            this.pendingModeId = null;

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

        bindInputs() {
            const updateMousePos = (clientX, clientY) => {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.viewWidth / rect.width;
                const scaleY = this.viewHeight / rect.height;
                this.input.mouseX = (clientX - rect.left) * scaleX;
                this.input.mouseY = (clientY - rect.top) * scaleY;
                this.input.mouseActive = true;

                // Parallax camera normalized from -1 to 1
                this.parallax.targetCamX = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width - 0.5) * 2));
                this.parallax.targetCamY = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height - 0.5) * 2));
            };

            this.canvas.addEventListener('mousemove', (e) => {
                updateMousePos(e.clientX, e.clientY);
            });

            this.canvas.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    if (this.state === 'playing') {
                        this.fireGhostPaddle('player1');
                    } else if (this.state === 'menu') {
                        this.triggerStartTransition();
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
                        this.triggerStartTransition();
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
            const rawDt = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;
            const dt = Math.min(rawDt, 0.05); // clamp max delta time

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
            requestAnimationFrame((t) => this.loop(t));
        }

        updateMenuParallax(dt) {
            this.menuTime += dt;
            // Smooth camera inertia for mouse parallax
            this.parallax.camX += (this.parallax.targetCamX - this.parallax.camX) * dt * 4.2;
            this.parallax.camY += (this.parallax.targetCamY - this.parallax.camY) * dt * 4.2;
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

        renderParallaxMenu(ctx, pulse, dt) {
            const time = this.menuTime;
            const camX = this.parallax.camX;
            const camY = this.parallax.camY;
            const isTrans = this.state === 'transitioning';
            const t = this.transitionProgress; // 0 to 1
            const easeT = t * t * (3 - 2 * t); // smoothstep

            // 1. Cosmic Nebula Background Layer (fills full view)
            if (this.parallaxBgLoaded && this.parallaxBgImg) {
                const bgScale = 1.14 + easeT * 0.35;
                const bw = this.viewWidth * bgScale;
                const bh = this.viewHeight * bgScale;
                const bx = (this.viewWidth - bw) / 2 - camX * 28;
                const by = (this.viewHeight - bh) / 2 - camY * 20;
                ctx.drawImage(this.parallaxBgImg, bx, by, bw, bh);
            } else {
                // Procedural deep space gradient
                const grad = ctx.createRadialGradient(
                    this.viewWidth / 2 - camX * 40, this.viewHeight * 0.4 - camY * 30, 80,
                    this.viewWidth / 2, this.viewHeight / 2, this.viewWidth * 0.75
                );
                grad.addColorStop(0, '#101432');
                grad.addColorStop(0.5, '#070918');
                grad.addColorStop(1, '#020206');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
            }

            // Dark vignette overlay to guarantee high-contrast readability
            ctx.fillStyle = `rgba(2, 3, 8, ${0.4 + easeT * 0.55})`;
            ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

            // 2. Low-Poly Mountain Relief Layer
            if (this.parallaxReliefLoaded && this.parallaxReliefImg) {
                ctx.save();
                // During transition, relief splits/slides down and away
                const rAlpha = Math.max(0, 1 - easeT * 1.3);
                ctx.globalAlpha = rAlpha;

                const rScale = 1.06 + pulse * 0.02;
                const rw = this.viewWidth * rScale;
                const imgRatio = this.parallaxReliefImg.height / Math.max(1, this.parallaxReliefImg.width);
                const rh = rw * imgRatio;
                const rx = (this.viewWidth - rw) / 2 - camX * 52;
                const ry = this.viewHeight - rh * 0.92 - camY * 32 + easeT * 380;

                ctx.drawImage(this.parallaxReliefImg, rx, ry, rw, rh);
                ctx.restore();
            }

            // 3. Flowing 3D Topographic Contour Curves (Curvas de Nível Neon em Relevo)
            ctx.save();
            const contourAlpha = Math.max(0, 1 - easeT * 1.2);
            ctx.globalAlpha = contourAlpha;

            const lines = [
                { yBase: this.viewHeight * 0.65, amp: 24, freq: 0.005, speed: 1.4, color: '#9b5de5', shift: 65 },
                { yBase: this.viewHeight * 0.74, amp: 32, freq: 0.004, speed: 1.1, color: '#00bbf9', shift: 88 },
                { yBase: this.viewHeight * 0.84, amp: 40, freq: 0.0035, speed: 0.8, color: '#00f5d4', shift: 115 }
            ];

            lines.forEach((line) => {
                ctx.strokeStyle = line.color;
                ctx.shadowColor = line.color;
                ctx.shadowBlur = 10 + pulse * 14;
                ctx.lineWidth = 2 + pulse * 1.5;

                ctx.beginPath();
                const offsetX = -camX * line.shift;
                const offsetY = -camY * (line.shift * 0.6);

                for (let x = -20; x <= this.viewWidth + 20; x += 16) {
                    const wave1 = Math.sin((x + offsetX) * line.freq + time * line.speed);
                    const wave2 = Math.cos((x + offsetX) * (line.freq * 2.1) - time * 0.7) * 0.45;
                    const audioBump = pulse * 16 * Math.sin((x / this.viewWidth) * Math.PI);
                    const y = line.yBase + offsetY + (wave1 + wave2) * line.amp - audioBump;

                    if (x === -20) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });
            ctx.restore();

            // 4. Levitating Center Orb (The Interactive Core Ball)
            const cx = this.arenaX + this.arenaWidth / 2 - camX * 18;
            let cy = this.arenaY + this.arenaHeight / 2 - 14 - camY * 14 + Math.sin(time * 3.0) * 10;

            if (isTrans) {
                // Rocket upward on click!
                cy -= easeT * 550;
            }

            // Orbiting aura rings
            const orbPulse = Math.sin(time * 4) * 0.5 + 0.5;
            const ringR = 24 + orbPulse * 16 + (isTrans ? easeT * 60 : 0);
            ctx.save();
            ctx.strokeStyle = `rgba(0, 245, 212, ${Math.max(0, 0.4 - (isTrans ? easeT * 0.4 : 0))})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();

            // Ball glow
            ctx.shadowColor = '#00f5d4';
            ctx.shadowBlur = 24 + pulse * 20;
            ctx.fillStyle = '#00f5d4';
            ctx.beginPath();
            ctx.arc(cx, cy, 9 + (isTrans ? 3 : 0), 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fill();

            // Stretch trail if transitioning upward
            if (isTrans && easeT > 0.05) {
                ctx.strokeStyle = '#00f5d4';
                ctx.lineWidth = 14 * (1 - easeT);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx, cy + easeT * 180);
                ctx.stroke();
            }
            ctx.restore();

            // Render particles & shockwaves during transition
            this.renderParticles(ctx);

            // In menu mode, draw subtle pulsing prompt under the orb
            if (!isTrans) {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.font = "700 12px 'Orbitron', system-ui, sans-serif";
                const textAlpha = 0.55 + Math.sin(time * 3.2) * 0.35;
                ctx.fillStyle = `rgba(0, 245, 212, ${textAlpha})`;
                ctx.shadowColor = '#00f5d4';
                ctx.shadowBlur = 8;
                ctx.fillText('CLIQUE NA TELA PARA INICIAR', this.arenaX + this.arenaWidth / 2, this.arenaY + this.arenaHeight / 2 + 54);
                ctx.restore();
            }
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
