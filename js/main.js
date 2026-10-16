/**
 * PWONYX - UI Controller, Save System (localStorage), Upgrade Shop,
 * Achievements Tracker, and Suno 4-Stem Loader
 */
window.PWONYX = window.PWONYX || {};

(function () {
    const CFG = window.PWONYX.CONFIG;
    const Audio = window.PWONYX.AudioEngine;
    const SAVE_KEY = 'pwonyx_save_v1';

    const defaultSave = {
        credits: 250,
        selectedMode: 'medium',
        upgrades: { paddleSize: 0, curvePower: 0, powerupDuration: 0, ghostBooster: 0 },
        achievements: {},
        highScores: {},
        stats: { matchesPlayed: 0, ghostIntercepts: 0, curveGoals: 0, powerUpsCollected: 0 },
        settings: { tunnel: 'subtle', trailFade: 0.075 }
    };

    let saveData = loadSaveData();
    let game = null;
    const $ = (id) => document.getElementById(id);

    function loadSaveData() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return JSON.parse(JSON.stringify(defaultSave));
            const p = JSON.parse(raw);
            return {
                credits: typeof p.credits === 'number' ? p.credits : 250,
                selectedMode: CFG.MODES[p.selectedMode] ? p.selectedMode : 'medium',
                upgrades: Object.assign({}, defaultSave.upgrades, p.upgrades || {}),
                achievements: Object.assign({}, p.achievements || {}),
                highScores: Object.assign({}, p.highScores || {}),
                stats: Object.assign({}, defaultSave.stats, p.stats || {}),
                settings: Object.assign({}, defaultSave.settings, p.settings || {})
            };
        } catch (e) {
            return JSON.parse(JSON.stringify(defaultSave));
        }
    }

    function persistSave() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        } catch (e) {
            // Ignore storage quota errors
        }
        updateCreditsUI();
    }

    // ---------------- Achievements ----------------
    function unlockAchievement(id) {
        if (saveData.achievements[id]) return;
        const ach = CFG.ACHIEVEMENTS.find((a) => a.id === id);
        if (!ach) return;

        saveData.achievements[id] = Date.now();
        saveData.credits += 100;
        showToast(`${ach.icon} <strong>${ach.name}</strong> · +100 CR`);

        const otherUnlocked = CFG.ACHIEVEMENTS.filter(
            (a) => a.id !== 'table_menace' && saveData.achievements[a.id]
        ).length;
        if (otherUnlocked >= 11 && !saveData.achievements.table_menace) {
            saveData.achievements.table_menace = Date.now();
            saveData.credits += 500;
            setTimeout(() => showToast('🏆 <strong>Table Menace</strong> · +500 CR'), 1200);
        }

        persistSave();
        renderAchievementsList();
    }

    function showToast(html) {
        const container = $('toast-container');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerHTML = html;
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('hide');
            setTimeout(() => el.remove(), 400);
        }, 3200);
    }

    function renderAchievementsList() {
        const list = $('achievements-grid');
        if (!list) return;
        list.innerHTML = '';
        let unlockedCount = 0;
        CFG.ACHIEVEMENTS.forEach((a) => {
            const unlocked = !!saveData.achievements[a.id];
            if (unlocked) unlockedCount++;
            const item = document.createElement('div');
            item.className = 'ach' + (unlocked ? '' : ' locked');
            item.innerHTML = `
                <div class="ach-icon">${unlocked ? a.icon : '🔒'}</div>
                <div><h4>${a.name}</h4><p>${a.desc}</p></div>
            `;
            list.appendChild(item);
        });
        const badge = $('ach-count-badge');
        if (badge) badge.textContent = `${unlockedCount}/${CFG.ACHIEVEMENTS.length}`;
    }

    // ---------------- Menu / modes ----------------
    function updateCreditsUI() {
        document.querySelectorAll('.credits-value').forEach((el) => {
            el.textContent = saveData.credits.toLocaleString('pt-BR');
        });
    }

    function renderModeSelector() {
        const list = $('mode-selector-grid');
        if (!list) return;
        list.innerHTML = '';
        Object.values(CFG.MODES).forEach((m) => {
            const btn = document.createElement('button');
            btn.className = 'mode-btn' + (saveData.selectedMode === m.id ? ' active' : '');
            btn.style.setProperty('--mc', m.color);
            btn.textContent = m.name;
            btn.addEventListener('click', () => {
                saveData.selectedMode = m.id;
                persistSave();
                renderModeSelector();
            });
            list.appendChild(btn);
        });

        const m = CFG.MODES[saveData.selectedMode];
        const best = saveData.highScores[m.id] || 0;
        $('mode-desc').textContent = `${m.subtitle}${best ? ` · Recorde ${best.toLocaleString('pt-BR')}` : ''}`;
    }

    // ---------------- Shop ----------------
    function renderUpgradesShop() {
        const list = $('shop-items-grid');
        if (!list) return;
        list.innerHTML = '';

        CFG.UPGRADES.forEach((u) => {
            const lv = saveData.upgrades[u.id] || 0;
            const isMax = lv >= u.maxLevel;
            const cost = isMax ? 0 : Math.round(u.baseCost * Math.pow(u.costScale, lv));
            const canAfford = !isMax && saveData.credits >= cost;

            let pips = '';
            for (let i = 0; i < u.maxLevel; i++) pips += `<span class="pip ${i < lv ? 'on' : ''}"></span>`;

            const item = document.createElement('div');
            item.className = 'shop-item';
            item.innerHTML = `
                <h4>${u.icon} ${u.name}</h4>
                <button class="btn-buy" ${canAfford ? '' : 'disabled'}>${isMax ? 'MAX' : `${cost} CR`}</button>
                <p>${u.desc}</p>
                <div class="pips">${pips}</div>
            `;
            item.querySelector('.btn-buy').addEventListener('click', () => {
                if (isMax || saveData.credits < cost) return;
                saveData.credits -= cost;
                saveData.upgrades[u.id] = lv + 1;
                if (saveData.upgrades[u.id] >= u.maxLevel) unlockAchievement('max_upgrade');
                persistSave();
                if (game) game.setUpgrades(saveData.upgrades);
                Audio.playPowerUp();
                renderUpgradesShop();
            });
            list.appendChild(item);
        });
        updateCreditsUI();
    }

    // ---------------- Music & visual settings ----------------
    function setupMusicSettings() {
        ['drums', 'bass', 'arp', 'lead'].forEach((key) => {
            const fileInput = $(`file-stem-${key}`);
            const statusEl = $(`status-stem-${key}`);
            const slider = $(`slider-stem-${key}`);

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                statusEl.textContent = 'carregando…';
                try {
                    const info = await Audio.loadCustomStemFile(key, file);
                    statusEl.textContent = `${info.name} · ${info.duration.toFixed(1)}s`;
                    statusEl.classList.add('loaded');
                    $('select-audio-track').value = 'suno';
                } catch (err) {
                    statusEl.textContent = 'erro ao ler o arquivo';
                }
            });

            slider.addEventListener('input', (e) => {
                Audio.autoLayering = false;
                $('toggle-auto-stems').checked = false;
                Audio.setManualStemLevel(key, parseFloat(e.target.value));
            });
        });

        $('toggle-auto-stems').addEventListener('change', (e) => {
            Audio.autoLayering = e.target.checked;
            if (game) Audio.updateAdaptiveLayers(game.balls.countActive());
        });

        $('select-audio-track').addEventListener('change', (e) => Audio.setTrack(e.target.value));

        const tunnel = $('select-tunnel');
        tunnel.value = saveData.settings.tunnel;
        game.feedbackMode = saveData.settings.tunnel;
        tunnel.addEventListener('change', (e) => {
            game.feedbackMode = e.target.value;
            saveData.settings.tunnel = e.target.value;
            persistSave();
        });

        // Slider goes "short -> long", so invert the fade value
        const trail = $('range-trail');
        const min = parseFloat(trail.min);
        const max = parseFloat(trail.max);
        trail.value = (min + max - saveData.settings.trailFade).toFixed(3);
        game.trailFade = saveData.settings.trailFade;
        trail.addEventListener('input', (e) => {
            const fade = min + max - parseFloat(e.target.value);
            game.trailFade = fade;
            saveData.settings.trailFade = fade;
            persistSave();
        });
    }

    // ---------------- HUD ----------------
    function updateHUDLoop() {
        if (game && game.state !== 'menu') {
            $('hud-score').textContent = game.score.toLocaleString('pt-BR');
            $('hud-balls').textContent = game.balls.countActive();

            const fill = $('hud-progress-fill');
            if (game.mode.isSurvival) {
                fill.style.width = `${game.survivalHealth}%`;
                fill.style.background = game.survivalHealth < 30 ? '#ff0055' : '';
            } else {
                fill.style.width = `${game.progress}%`;
                fill.style.background = '';
            }

            const b = game.buffs;
            const buffs = [];
            if (b.wide > 0) buffs.push(`<span class="buff" style="--c:#00bbf9">↔ ${b.wide.toFixed(0)}s</span>`);
            if (b.slow > 0) buffs.push(`<span class="buff" style="--c:#fee440">⏳ ${b.slow.toFixed(0)}s</span>`);
            if (b.sticky > 0) buffs.push(`<span class="buff" style="--c:#f15bb5">🧲 ${b.sticky.toFixed(0)}s</span>`);
            if (b.overdrive > 0) buffs.push(`<span class="buff" style="--c:#ff007f">2× ${b.overdrive.toFixed(0)}s</span>`);
            $('hud-active-buffs').innerHTML = buffs.join('');
        }

        const fps = $('hud-telemetry');
        if (game && !fps.classList.contains('hidden')) {
            fps.textContent = `${Math.round(game.fpsSmooth)} FPS · ${game.physicsMs.toFixed(2)} ms`;
        }

        // Keep the stem sliders in sync while the music modal is open
        if (Audio.autoLayering && !$('modal-suno').classList.contains('hidden')) {
            ['drums', 'bass', 'arp', 'lead'].forEach((k) => {
                $(`slider-stem-${k}`).value = (Audio.stemLevels[k] || 0).toFixed(2);
            });
        }
        requestAnimationFrame(updateHUDLoop);
    }

    // ---------------- Screens ----------------
    function showOverlay(id) {
        ['overlay-menu', 'overlay-pause', 'overlay-gameover'].forEach((o) => {
            $(o).classList.toggle('hidden', o !== id);
        });
        $('hud').classList.toggle('hidden', id === 'overlay-menu');
        $('stage').classList.toggle('playing', id === null);
    }

    function goToMenu() {
        game.state = 'menu';
        Audio.setLowPassEffect('normal');
        renderModeSelector();
        $('overlay-menu').classList.remove('fading');
        showOverlay('overlay-menu');
    }

    function startMatch() {
        closeAllModals();
        if (game.state === 'menu') {
            game.triggerStartTransition(saveData.selectedMode);
        } else {
            game.startMatch(saveData.selectedMode);
        }
    }

    function openModal(id) {
        if (game.state === 'playing') game.togglePause();
        closeAllModals();
        $(id).classList.remove('hidden');
    }

    function closeAllModals() {
        document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    }

    function toggleMute() {
        const muted = Audio.toggleMute();
        showToast(muted ? '🔇 Som desligado' : '🔊 Som ligado');
    }

    window.addEventListener('DOMContentLoaded', () => {
        game = new window.PWONYX.Game($('arena-canvas'), {
            onStateChange: (state) => {
                if (state === 'playing') {
                    $('overlay-menu').classList.remove('fading');
                    showOverlay(null);
                } else if (state === 'paused') {
                    showOverlay('overlay-pause');
                } else if (state === 'menu') {
                    $('overlay-menu').classList.remove('fading');
                    showOverlay('overlay-menu');
                }
            },
            onTransitionStart: () => {
                $('overlay-menu').classList.add('fading');
                closeAllModals();
            },
            onAchievement: (achId) => unlockAchievement(achId),
            onGhostIntercept: () => {
                saveData.stats.ghostIntercepts++;
                if (saveData.stats.ghostIntercepts >= 25) unlockAchievement('ghost_25');
                persistSave();
            },
            onCurveGoal: () => {
                saveData.stats.curveGoals++;
                if (saveData.stats.curveGoals >= 10) unlockAchievement('curve_10');
                persistSave();
            },
            onPowerUpCollected: () => {
                saveData.stats.powerUpsCollected++;
                if (saveData.stats.powerUpsCollected >= 15) unlockAchievement('power_15');
                persistSave();
            },
            onToggleMute: toggleMute,
            onMatchEnd: (res) => {
                saveData.stats.matchesPlayed++;
                saveData.credits += res.creditsEarned;
                if (res.score > (saveData.highScores[res.mode.id] || 0)) {
                    saveData.highScores[res.mode.id] = res.score;
                }

                unlockAchievement('first_match');
                if (res.domination >= 97 && res.completedFullTime) unlockAchievement('domination_97');
                if (res.mode.id === 'extreme' && res.completedFullTime && res.domination >= 60) unlockAchievement('beat_extreme');
                if (res.mode.id === 'insane' && res.completedFullTime && res.domination >= 60) unlockAchievement('beat_insane');

                persistSave();

                $('go-title').textContent = res.completedFullTime ? 'PARTIDA CONCLUÍDA' : 'FIM DE JOGO';
                $('go-score').textContent = res.score.toLocaleString('pt-BR');
                $('go-credits').textContent = `+${res.creditsEarned}`;
                $('go-domination').textContent = `${res.domination}%`;
                $('go-distance').textContent = `${res.distanceTraveled.toLocaleString('pt-BR')} px`;
                showOverlay('overlay-gameover');
            }
        });

        game.setUpgrades(saveData.upgrades);
        renderModeSelector();
        renderUpgradesShop();
        renderAchievementsList();
        setupMusicSettings();
        updateCreditsUI();
        showOverlay('overlay-menu');

        $('btn-start-match').addEventListener('click', startMatch);
        $('btn-play-again').addEventListener('click', startMatch);
        $('btn-back-menu').addEventListener('click', goToMenu);
        $('btn-pause-quit').addEventListener('click', goToMenu);
        $('btn-resume').addEventListener('click', () => game.togglePause());
        $('btn-pause').addEventListener('click', () => {
            if (game.state === 'playing') game.togglePause();
        });

        document.querySelectorAll('.open-shop-btn').forEach((b) =>
            b.addEventListener('click', () => { renderUpgradesShop(); openModal('modal-shop'); }));
        document.querySelectorAll('.open-ach-btn').forEach((b) =>
            b.addEventListener('click', () => { renderAchievementsList(); openModal('modal-achievements'); }));
        document.querySelectorAll('.open-suno-btn').forEach((b) =>
            b.addEventListener('click', () => openModal('modal-suno')));
        document.querySelectorAll('.btn-close-modal').forEach((b) =>
            b.addEventListener('click', closeAllModals));
        document.querySelectorAll('.modal').forEach((m) =>
            m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); }));

        $('btn-sandbox-credits').addEventListener('click', () => {
            saveData.credits += 1000;
            persistSave();
            renderUpgradesShop();
        });

        $('btn-reset-upgrades').addEventListener('click', () => {
            saveData.upgrades = { paddleSize: 0, curvePower: 0, powerupDuration: 0, ghostBooster: 0 };
            persistSave();
            game.setUpgrades(saveData.upgrades);
            renderUpgradesShop();
        });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyF') toggleFullscreen();
            if (e.code === 'F3') {
                e.preventDefault();
                $('hud-telemetry').classList.toggle('hidden');
            }
            if (e.code === 'Enter' && game.state === 'menu' && !game.mode.isTwoPlayer) startMatch();
        });

        requestAnimationFrame(updateHUDLoop);
    });
})();
