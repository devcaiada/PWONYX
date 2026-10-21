/**
 * PWONYX - Configuration, Modes, Upgrades & Achievements
 * Inspired by the classic Flash game Pwong 2 (JGames, 2009)
 */
window.PWONYX = window.PWONYX || {};

window.PWONYX.CONFIG = {
    ARENA_WIDTH: 1024,
    ARENA_HEIGHT: 768,
    SPEED_SCALE: 1.22, // mode speeds were tuned for a 620px-tall arena
    PADDLE_BASE_WIDTH: 132,
    PADDLE_HEIGHT: 14,
    PADDLE_Y_OFFSET: 40,
    BALL_RADIUS: 8,
    MAX_PARTICLES: 800,
    MAX_BALLS_POOL: 32,
    MAX_POWERUPS_POOL: 24,
    MAX_GHOSTS_POOL: 12,
    MAX_TEXTS_POOL: 32,

    // Game Difficulty Modes (inspired by Pwong 2)
    MODES: {
        easy: {
            id: 'easy',
            name: 'EASY',
            subtitle: 'Aquecimento Neon • Até 8 bolas • Queda abundante de Ammo (3x)',
            maxBalls: 8,
            duration: 60, // seconds
            spawnInterval: 6.0,
            baseBallSpeed: 330,
            maxBallSpeed: 540,
            aiSpeed: 340,
            aiReaction: 0.82,
            scoreMultiplier: 1.0,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 3,
            maxAmmo: 99,
            ammoSpawnInterval: 4.0,
            color: '#00f5d4'
        },
        medium: {
            id: 'medium',
            name: 'MEDIUM',
            subtitle: 'Ritmo Clássico • Até 12 bolas • Queda alta de Ammo (até 3x)',
            maxBalls: 12,
            duration: 75,
            spawnInterval: 4.8,
            baseBallSpeed: 380,
            maxBallSpeed: 640,
            aiSpeed: 430,
            aiReaction: 0.88,
            scoreMultiplier: 1.5,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 3,
            maxAmmo: 99,
            ammoSpawnInterval: 5.0,
            color: '#00bbf9'
        },
        hard: {
            id: 'hard',
            name: 'HARD',
            subtitle: 'Caos Frenético • Até 16 bolas • Queda moderada de Ammo (2x)',
            maxBalls: 16,
            duration: 90,
            spawnInterval: 3.9,
            baseBallSpeed: 430,
            maxBallSpeed: 740,
            aiSpeed: 520,
            aiReaction: 0.92,
            scoreMultiplier: 2.2,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 2,
            maxAmmo: 99,
            ammoSpawnInterval: 6.5,
            color: '#fee440'
        },
        extreme: {
            id: 'extreme',
            name: 'EXTREME',
            subtitle: 'Enxame Total • Até 20 bolas • Queda reduzida de Ammo (1–2x)',
            maxBalls: 20,
            duration: 90,
            spawnInterval: 3.1,
            baseBallSpeed: 480,
            maxBallSpeed: 840,
            aiSpeed: 620,
            aiReaction: 0.95,
            scoreMultiplier: 3.2,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 1,
            maxAmmo: 99,
            ammoSpawnInterval: 8.2,
            color: '#ff6b35'
        },
        insane: {
            id: 'insane',
            name: 'INSANE',
            subtitle: 'Velocidade Brutal • 20 bolas • Queda rara de Ammo (1x)',
            maxBalls: 20,
            duration: 90,
            spawnInterval: 2.1,
            baseBallSpeed: 540,
            maxBallSpeed: 960,
            aiSpeed: 730,
            aiReaction: 0.98,
            scoreMultiplier: 5.0,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 1,
            maxAmmo: 99,
            ammoSpawnInterval: 10.5,
            color: '#ff007f'
        },
        survival: {
            id: 'survival',
            name: 'SURVIVAL ∞',
            subtitle: 'Modo Infinito • Começa caindo 3 itens de Ammo e reduz com a fase',
            maxBalls: 20,
            duration: Infinity,
            spawnInterval: 3.6,
            baseBallSpeed: 410,
            maxBallSpeed: 900,
            aiSpeed: 560,
            aiReaction: 0.93,
            scoreMultiplier: 2.5,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 3,
            maxAmmo: 99,
            ammoSpawnInterval: 4.5,
            isSurvival: true,
            color: '#9b5de5'
        },
        versus: {
            id: 'versus',
            name: '2P VERSUS',
            subtitle: 'Local 2 Jogadores • P1 (Mouse/A-D) vs P2 (Setas)',
            maxBalls: 16,
            duration: 90,
            spawnInterval: 4.2,
            baseBallSpeed: 410,
            maxBallSpeed: 780,
            aiSpeed: 500,
            aiReaction: 1.0,
            scoreMultiplier: 2.0,
            startAmmo: 0,
            ammoPerPickup: 10,
            ammoDropCount: 2,
            maxAmmo: 99,
            ammoSpawnInterval: 5.2,
            isTwoPlayer: true,
            color: '#f15bb5'
        }
    },

    // Upgrades Shop (Pwong 2 Core + Modern Additions)
    UPGRADES: [
        {
            id: 'paddleSize',
            name: 'Extensão da Raquete',
            desc: 'Aumenta permanentemente a largura da sua raquete para defender enxames de bolas.',
            icon: '↔️',
            maxLevel: 8,
            baseCost: 120,
            costScale: 1.55,
            effectPerLevel: 12 // +12px per level
        },
        {
            id: 'curvePower',
            name: 'Efeito Curva (Spin)',
            desc: 'Amplifica o efeito Magnus e o ângulo extremo ao rebater bolas em movimento.',
            icon: '🌀',
            maxLevel: 8,
            baseCost: 150,
            costScale: 1.6,
            effectPerLevel: 0.18 // +18% curve spin per level
        },
        {
            id: 'powerupDuration',
            name: 'Maestria de Bônus & Munição',
            desc: 'Aumenta a duração dos Power-Ups, frequência de queda e munição inicial do Ghost Paddle.',
            icon: '⚡',
            maxLevel: 8,
            baseCost: 140,
            costScale: 1.55,
            effectPerLevel: 0.15 // +15% duration & drop rate
        },
        {
            id: 'ghostBooster',
            name: 'Propulsor Ghost Paddle',
            desc: 'Deixa a raquete fantasma mais larga e capaz de rebater múltiplas bolas antes de sumir.',
            icon: '👻',
            maxLevel: 8,
            baseCost: 180,
            costScale: 1.65,
            effectPerLevel: 1 // extra durability & width
        }
    ],

    // Power-up types that drop during matches
    POWERUPS: {
        ammo: {
            id: 'ammo',
            label: '+GHOST AMMO',
            symbol: '👻',
            color: '#00f5d4',
            radius: 13
        },
        wide: {
            id: 'wide',
            label: 'MEGA PADDLE',
            symbol: '↔',
            color: '#00bbf9',
            radius: 15,
            baseDuration: 10
        },
        slow: {
            id: 'slow',
            label: 'SLOW MOTION',
            symbol: '⏳',
            color: '#fee440',
            radius: 15,
            baseDuration: 7
        },
        sticky: {
            id: 'sticky',
            label: 'MAGNET PADDLE',
            symbol: '🧲',
            color: '#f15bb5',
            radius: 15,
            baseDuration: 9
        },
        overdrive: {
            id: 'overdrive',
            label: 'SCORE 2X OVERDRIVE',
            symbol: '★',
            color: '#ff007f',
            radius: 15,
            baseDuration: 10
        }
    },

    // 12 Classic Achievements (Kongregate / Pwong 2 homage)
    ACHIEVEMENTS: [
        { id: 'first_match', name: 'Primeiro Rebate', desc: 'Complete sua primeira partida em qualquer modo.', icon: '🏓' },
        { id: 'swarm_10', name: 'Domador do Enxame', desc: 'Mantenha 10 ou mais bolas simultâneas na arena.', icon: '🔥' },
        { id: 'chaos_20', name: 'Caos Absoluto (20 Bolas)', desc: 'Atinja o limite máximo de 20 bolas na tela ao mesmo tempo.', icon: '💥' },
        { id: 'ghost_25', name: 'Mestre Fantasma', desc: 'Intercepte 25 bolas usando o Ghost Paddle.', icon: '👻' },
        { id: 'curve_10', name: 'Mago da Curva', desc: 'Marque 10 gols na IA com bolas de efeito curvo intenso.', icon: '🌀' },
        { id: 'domination_97', name: 'Clube dos 97%', desc: 'Termine uma partida com 97% ou mais de taxa de domínio.', icon: '👑' },
        { id: 'marathon_50k', name: 'Maratona 50.000px', desc: 'Percorra 50.000 pixels com sua raquete em uma única partida.', icon: '🚀' },
        { id: 'power_15', name: 'Sobrecarga Neon', desc: 'Colete 15 power-ups na arena.', icon: '⚡' },
        { id: 'max_upgrade', name: 'Engenharia Máxima', desc: 'Maximize qualquer categoria de upgrade na loja.', icon: '🛠️' },
        { id: 'beat_extreme', name: 'Sobrevivente Extreme', desc: 'Vença uma partida no modo EXTREME.', icon: '☄️' },
        { id: 'beat_insane', name: 'Lenda Insane', desc: 'Vença uma partida no modo INSANE.', icon: '💎' },
        { id: 'table_menace', name: 'Table Menace', desc: 'Desbloqueie todas as outras 11 conquistas do PWONYX!', icon: '🏆' }
    ]
};
