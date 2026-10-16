/**
 * PWONYX - High-Performance Object Pooling (Zero GC Stutters)
 * Pre-allocates Balls, Particles, Ghost Paddles, Power-Ups, and Floating Texts
 */
window.PWONYX = window.PWONYX || {};

(function () {
    const CFG = window.PWONYX.CONFIG;
    const TRAIL_LENGTH = 14;

    class BallPool {
        constructor(size) {
            this.size = size;
            this.items = new Array(size);
            for (let i = 0; i < size; i++) {
                this.items[i] = {
                    active: false,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    spin: 0, // Magnus curve effect
                    radius: CFG.BALL_RADIUS,
                    color: '#00f5d4',
                    lastHitBy: 'none',
                    isCurvedShot: false,
                    // Previous-frame position: the trail is drawn as a segment px,py -> x,y
                    px: 0,
                    py: 0
                };
            }
        }

        spawn(x, y, vx, vy, color) {
            for (let i = 0; i < this.size; i++) {
                const b = this.items[i];
                if (!b.active) {
                    b.active = true;
                    b.x = x;
                    b.y = y;
                    b.px = x;
                    b.py = y;
                    b.vx = vx;
                    b.vy = vy;
                    b.spin = 0;
                    b.radius = CFG.BALL_RADIUS;
                    b.color = color || '#00f5d4';
                    b.lastHitBy = 'none';
                    b.isCurvedShot = false;
                    return b;
                }
            }
            return null;
        }

        clear() {
            for (let i = 0; i < this.size; i++) {
                this.items[i].active = false;
            }
        }

        countActive() {
            let c = 0;
            for (let i = 0; i < this.size; i++) {
                if (this.items[i].active) c++;
            }
            return c;
        }
    }

    class ParticlePool {
        constructor(size) {
            this.size = size;
            this.items = new Array(size);
            this.cursor = 0;
            for (let i = 0; i < size; i++) {
                this.items[i] = {
                    active: false,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    life: 0,
                    maxLife: 1,
                    size: 3,
                    color: '#00f5d4',
                    type: 'spark' // 'spark' | 'ring'
                };
            }
        }

        spawn(x, y, vx, vy, color, size, life, type) {
            // Ring-cursor lookup for O(1) allocation even under heavy load
            for (let step = 0; step < this.size; step++) {
                const idx = (this.cursor + step) % this.size;
                const p = this.items[idx];
                if (!p.active) {
                    this.cursor = (idx + 1) % this.size;
                    p.active = true;
                    p.x = x;
                    p.y = y;
                    p.vx = vx;
                    p.vy = vy;
                    p.color = color;
                    p.size = size || 3;
                    p.life = life || 0.45;
                    p.maxLife = p.life;
                    p.type = type || 'spark';
                    return p;
                }
            }
            // Overwrite oldest slot if full
            const p = this.items[this.cursor];
            this.cursor = (this.cursor + 1) % this.size;
            p.active = true;
            p.x = x;
            p.y = y;
            p.vx = vx;
            p.vy = vy;
            p.color = color;
            p.size = size || 3;
            p.life = life || 0.45;
            p.maxLife = p.life;
            p.type = type || 'spark';
            return p;
        }

        burst(x, y, count, color, speedMin, speedMax, sizeBase) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = speedMin + Math.random() * (speedMax - speedMin);
                this.spawn(
                    x,
                    y,
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    color,
                    (sizeBase || 3) * (0.6 + Math.random() * 0.8),
                    0.25 + Math.random() * 0.4,
                    'spark'
                );
            }
        }

        shockwave(x, y, color, maxRadius) {
            this.spawn(x, y, maxRadius || 55, 0, color, 4, 0.35, 'ring');
        }

        clear() {
            for (let i = 0; i < this.size; i++) {
                this.items[i].active = false;
            }
        }
    }

    class GhostPaddlePool {
        constructor(size) {
            this.size = size;
            this.items = new Array(size);
            for (let i = 0; i < size; i++) {
                this.items[i] = {
                    active: false,
                    x: 0,
                    y: 0,
                    vy: 0,
                    width: 100,
                    height: 10,
                    hitsRemaining: 1,
                    owner: 'player1', // 'player1' | 'player2'
                    alpha: 1,
                    color: '#00f5d4'
                };
            }
        }

        spawn(x, y, vy, width, hits, owner, color) {
            for (let i = 0; i < this.size; i++) {
                const g = this.items[i];
                if (!g.active) {
                    g.active = true;
                    g.x = x;
                    g.y = y;
                    g.vy = vy;
                    g.width = width;
                    g.height = 11;
                    g.hitsRemaining = hits || 1;
                    g.owner = owner || 'player1';
                    g.alpha = 1.0;
                    g.color = color || '#00f5d4';
                    return g;
                }
            }
            return null;
        }

        clear() {
            for (let i = 0; i < this.size; i++) {
                this.items[i].active = false;
            }
        }
    }

    class PowerUpPool {
        constructor(size) {
            this.size = size;
            this.items = new Array(size);
            for (let i = 0; i < size; i++) {
                this.items[i] = {
                    active: false,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    type: 'ammo',
                    radius: 13,
                    pulse: 0
                };
            }
        }

        spawn(x, y, vy, type) {
            const def = CFG.POWERUPS[type] || CFG.POWERUPS.ammo;
            for (let i = 0; i < this.size; i++) {
                const p = this.items[i];
                if (!p.active) {
                    p.active = true;
                    p.x = x;
                    p.y = y;
                    p.vx = (Math.random() - 0.5) * 40;
                    p.vy = vy;
                    p.type = type;
                    p.radius = def.radius;
                    p.pulse = Math.random() * Math.PI * 2;
                    return p;
                }
            }
            return null;
        }

        clear() {
            for (let i = 0; i < this.size; i++) {
                this.items[i].active = false;
            }
        }
    }

    class FloatingTextPool {
        constructor(size) {
            this.size = size;
            this.items = new Array(size);
            for (let i = 0; i < size; i++) {
                this.items[i] = {
                    active: false,
                    x: 0,
                    y: 0,
                    vy: -50,
                    text: '',
                    color: '#ffffff',
                    life: 0,
                    maxLife: 1,
                    size: 16
                };
            }
        }

        spawn(x, y, text, color, size, life) {
            for (let i = 0; i < this.size; i++) {
                const t = this.items[i];
                if (!t.active) {
                    t.active = true;
                    t.x = x;
                    t.y = y;
                    t.vy = -55;
                    t.text = text;
                    t.color = color || '#00f5d4';
                    t.size = size || 15;
                    t.life = life || 0.85;
                    t.maxLife = t.life;
                    return t;
                }
            }
            return null;
        }

        clear() {
            for (let i = 0; i < this.size; i++) {
                this.items[i].active = false;
            }
        }
    }

    window.PWONYX.Pools = {
        BallPool,
        ParticlePool,
        GhostPaddlePool,
        PowerUpPool,
        FloatingTextPool,
        TRAIL_LENGTH
    };
})();
