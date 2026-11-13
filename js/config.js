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

    // Game Difficulty Modes (inspired by Pwong 2 — full music-length matches)
    MODES: {
        easy: {
            id: 'easy',
            name: 'EASY',
            subtitle: 'Aquecimento Abissal • Até 6 bolas • Duração da música • Quedas frequentes',
            maxBalls: 6,
            duration: 134, // seconds (synced to track duration)
            spawnInterval: 14.0,
            baseBallSpeed: 285,
            maxBallSpeed: 470,
            aiSpeed: 270,
            aiReaction: 0.68,
            scoreMultiplier: 1.0,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 3.6,
            specialPowerInterval: 11.0,
            color: '#00f5d4'
        },
        medium: {
            id: 'medium',
            name: 'MEDIUM',
            subtitle: 'Ritmo Clássico • Até 10 bolas • Duração da música • Equilíbrio Pwong 2',
            maxBalls: 10,
            duration: 134,
            spawnInterval: 10.5,
            baseBallSpeed: 340,
            maxBallSpeed: 590,
            aiSpeed: 380,
            aiReaction: 0.82,
            scoreMultiplier: 1.5,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 4.2,
            specialPowerInterval: 13.0,
            color: '#00bbf9'
        },
        hard: {
            id: 'hard',
            name: 'HARD',
            subtitle: 'Caos Frenético • Até 14 bolas • Duração da música • IA veloz',
            maxBalls: 14,
            duration: 134,
            spawnInterval: 8.0,
            baseBallSpeed: 400,
            maxBallSpeed: 710,
            aiSpeed: 520,
            aiReaction: 0.92,
            scoreMultiplier: 2.2,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 4.8,
            specialPowerInterval: 14.5,
            color: '#fee440'
        },
        extreme: {
            id: 'extreme',
            name: 'EXTREME',
            subtitle: 'Enxame Total • Até 18 bolas • Duração da música • Reflexos no limite',
            maxBalls: 18,
            duration: 134,
            spawnInterval: 6.4,
            baseBallSpeed: 455,
            maxBallSpeed: 820,
            aiSpeed: 640,
            aiReaction: 0.96,
            scoreMultiplier: 3.2,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 5.4,
            specialPowerInterval: 16.0,
            color: '#ff6b35'
        },
        insane: {
            id: 'insane',
            name: 'INSANE',
            subtitle: 'Velocidade Brutal • 20 bolas • Duração da música • IA implacável',
            maxBalls: 20,
            duration: 134,
            spawnInterval: 5.2,
            baseBallSpeed: 510,
            maxBallSpeed: 920,
            aiSpeed: 750,
            aiReaction: 0.99,
            scoreMultiplier: 5.0,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 6.0,
            specialPowerInterval: 17.5,
            color: '#ff007f'
        },
        survival: {
            id: 'survival',
            name: 'SURVIVAL ∞',
            subtitle: 'Modo Infinito • Começa fácil e escala com o tempo • Quedas 1 por vez',
            maxBalls: 20,
            duration: Infinity,
            spawnInterval: 7.5,
            baseBallSpeed: 300,
            maxBallSpeed: 920,
            aiSpeed: 340,
            aiReaction: 0.74,
            scoreMultiplier: 2.5,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 4.2,
            specialPowerInterval: 13.5,
            isSurvival: true,
            color: '#9b5de5'
        },
        versus: {
            id: 'versus',
            name: '2P VERSUS',
            subtitle: 'Local 2 Jogadores • P1 (Mouse/A-D) vs P2 (Setas) • Duração da música',
            maxBalls: 14,
            duration: 134,
            spawnInterval: 8.5,
            baseBallSpeed: 380,
            maxBallSpeed: 740,
            aiSpeed: 480,
            aiReaction: 1.0,
            scoreMultiplier: 2.0,
            startAmmo: 2,
            ammoPerPickup: 10,
            maxAmmo: 99,
            ammoSpawnInterval: 4.5,
            specialPowerInterval: 14.0,
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
            desc: 'Aumenta a duração dos Power-Ups, frequência de queda e capacidade máxima de munição do Ghost Paddle.',
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
            shortLabel: '+AMMO',
            symbol: '👻',
            color: '#00f5d4',
            radius: 14
        },
        wide: {
            id: 'wide',
            label: 'MEGA PADDLE',
            shortLabel: 'WIDE',
            symbol: '↔',
            color: '#00bbf9',
            radius: 16,
            baseDuration: 11
        },
        slow: {
            id: 'slow',
            label: 'SLOW MOTION',
            shortLabel: 'CHRONO',
            symbol: '⏳',
            color: '#ffd166',
            radius: 16,
            baseDuration: 8
        },
        sticky: {
            id: 'sticky',
            label: 'MAGNET PADDLE',
            shortLabel: 'MAGNET',
            symbol: '🧲',
            color: '#ff4da6',
            radius: 16,
            baseDuration: 10
        },
        overdrive: {
            id: 'overdrive',
            label: 'SCORE 2X OVERDRIVE',
            shortLabel: '2X NOVA',
            symbol: '★',
            color: '#ff6b35',
            radius: 16,
            baseDuration: 11
        },
        shield: {
            id: 'shield',
            label: 'ABYSSAL AEGIS SHIELD',
            shortLabel: 'AEGIS',
            symbol: '🛡️',
            color: '#2ec4b6',
            radius: 16,
            baseDuration: 14
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
