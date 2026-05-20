// ======================================================
// pomodoro.js — ATLAS Pomodoro Complete Module
// ======================================================

// ============================================
// STATE VARIABLES
// ============================================
let pomoInterval = null;
let pomoTimeLeft = 25 * 60;
let pomoTotalTime = 25 * 60;
let pomoRunning = false;
let pomoSessions = [];
let pomoCurrentTask = '';
const POMO_CIRCUMFERENCE = 502.65;

// ============================================
// CORE DISPLAY
// ============================================
function updatePomoDisplay() {
    const digitsEl = document.getElementById('pomoDigits');
    if (digitsEl) digitsEl.textContent = formatSeconds(pomoTimeLeft);
    
    const taskEl = document.getElementById('pomoWatchTask');
    if (taskEl) {
        taskEl.textContent = pomoCurrentTask || 'টাস্ক সেট করুন';
        taskEl.style.fontWeight = 'bold';
    }
    
    const arc = document.getElementById('pomoArc');
    if (arc) {
        const progress = pomoTotalTime > 0 ? pomoTimeLeft / pomoTotalTime : 1;
        arc.style.strokeDashoffset = POMO_CIRCUMFERENCE * (1 - progress);
    }
    
    const playBtn = document.getElementById('pomoPlayBtn');
    if (playBtn) playBtn.textContent = pomoRunning ? '⏸' : '▶';
    
    renderPomoInProfile();
}

// ============================================
// CORE CONTROLS
// ============================================
function togglePomodoro() {
    if (pomoRunning) pomoPause();
    else pomoStart();
}

function pomoStart() {
    if (pomoTimeLeft <= 0 || pomoTimeLeft === pomoTotalTime) {
        const h = parseInt(document.getElementById('pomoHours')?.value) || 0;
        const m = parseInt(document.getElementById('pomoMins')?.value) || 0;
        const total = h * 3600 + m * 60;
        if (total > 0) { pomoTimeLeft = total; pomoTotalTime = total; }
        else if (pomoTotalTime > 0) { pomoTimeLeft = pomoTotalTime; }
        else { showToast('⚠️ টাইম সেট করুন'); return; }
    }
    
    const task = document.getElementById('pomoTaskInput')?.value?.trim();
    if (task) pomoCurrentTask = task;
    
    pomoRunning = true;
    updatePomoDisplay();
    clearInterval(pomoInterval);
    
    pomoInterval = setInterval(() => {
        if (pomoTimeLeft <= 0) {
            // Timer Complete
            clearInterval(pomoInterval);
            pomoRunning = false;
            
            // Save session
            pomoSessions.unshift({
                task: pomoCurrentTask,
                duration: pomoTotalTime,
                completedAt: new Date().toISOString()
            });
            if (pomoSessions.length > 20) pomoSessions.pop();
            localStorage.setItem('pomo_sessions_' + currentUser?.phone, JSON.stringify(pomoSessions));
            
            // Clear state
            localStorage.removeItem('pomo_state_' + currentUser?.phone);
            
            // Reset UI
            resetPomoColors();
            renderPomoHistory();
            updatePomoDisplay();
            
            // Show Yes/No Modal
            showPomoCompletionModal();
            return;
        }
        
        pomoTimeLeft--;
        updatePomoDisplay();
        
        // Warning at 60 seconds
        if (pomoTimeLeft <= 60) {
            setPomoWarning(true);
        }
        
        // Save state every 5 seconds
        if (pomoTimeLeft % 5 === 0) {
            savePomoState();
        }
    }, 1000);
}

function pomoPause() {
    clearInterval(pomoInterval);
    pomoRunning = false;
    resetPomoColors();
    updatePomoDisplay();
    savePomoState();
}

function pomoReset() {
    clearInterval(pomoInterval);
    pomoRunning = false;
    pomoTimeLeft = pomoTotalTime;
    resetPomoColors();
    updatePomoDisplay();
    localStorage.removeItem('pomo_state_' + currentUser?.phone);
}

function stopPomodoro() {
    clearInterval(pomoInterval);
    pomoRunning = false;
    pomoTimeLeft = pomoTotalTime;
    resetPomoColors();
    updatePomoDisplay();
    localStorage.removeItem('pomo_state_' + currentUser?.phone);
    showToast('⏹ Pomodoro বন্ধ করা হয়েছে');
}

// ============================================
// SETUP
// ============================================
function pomoSetPreset(mins, btn) {
    if (pomoRunning) { showToast('⚠️ আগে পজ করুন'); return; }
    pomoTimeLeft = mins * 60;
    pomoTotalTime = mins * 60;
    if (document.getElementById('pomoMins')) document.getElementById('pomoMins').value = mins;
    if (document.getElementById('pomoHours')) document.getElementById('pomoHours').value = 0;
    document.querySelectorAll('.pomo-preset').forEach(b => b.classList.remove('active-preset'));
    if (btn) btn.classList.add('active-preset');
    updatePomoDisplay();
    showToast(`⏱️ ${mins} মিনিট সেট হয়েছে`);
}

function pomoApplySetup() {
    if (pomoRunning) { showToast('⚠️ আগে পজ বা রিসেট করুন'); return; }
    
    const h = parseInt(document.getElementById('pomoHours')?.value) || 0;
    const m = parseInt(document.getElementById('pomoMins')?.value) || 0;
    const task = document.getElementById('pomoTaskInput')?.value?.trim() || '';
    const total = h * 3600 + m * 60;
    
    if (total <= 0) { showToast('⚠️ সময় সেট করুন'); return; }
    
    pomoTimeLeft = total;
    pomoTotalTime = total;
    if (task) pomoCurrentTask = task;
    
    document.querySelectorAll('.pomo-preset').forEach(b => b.classList.remove('active-preset'));
    updatePomoDisplay();
    renderPomoInProfile();
    
    const watchTask = document.getElementById('pomoWatchTask');
    if (watchTask && task) {
        watchTask.textContent = task;
        watchTask.style.fontWeight = 'bold';
    }
    
    savePomoState();
    showToast('✅ Pomodoro সেট হয়েছে');
}

// ============================================
// WARNING COLORS
// ============================================
function setPomoWarning(active) {
    const digits = document.getElementById('pomoDigits');
    const watchCard = document.querySelector('.pomo-watch-card');
    if (active) {
        if (digits) digits.style.color = '#F85149';
        if (watchCard) watchCard.style.borderColor = 'rgba(248,81,73,0.6)';
        if (watchCard) watchCard.classList.add('warning');
    }
}

function resetPomoColors() {
    const digits = document.getElementById('pomoDigits');
    const watchCard = document.querySelector('.pomo-watch-card');
    if (digits) digits.style.color = '#E0E7FF';
    if (watchCard) watchCard.style.borderColor = 'rgba(99,102,241,0.4)';
    if (watchCard) watchCard.classList.remove('warning');
}

// ============================================
// STATE PERSISTENCE
// ============================================
function savePomoState() {
    if (!currentUser) return;
    localStorage.setItem('pomo_state_' + currentUser.phone, JSON.stringify({
        timeLeft: pomoTimeLeft,
        totalTime: pomoTotalTime,
        running: pomoRunning,
        task: pomoCurrentTask
    }));
}

function restorePomoState() {
    if (!currentUser) return;
    const saved = localStorage.getItem('pomo_state_' + currentUser.phone);
    if (!saved) return;
    
    try {
        const state = JSON.parse(saved);
        pomoTimeLeft = state.timeLeft || 25 * 60;
        pomoTotalTime = state.totalTime || 25 * 60;
        pomoCurrentTask = state.task || '';
        
        if (state.running && pomoTimeLeft > 0) {
            pomoRunning = true;
            updatePomoDisplay();
            clearInterval(pomoInterval);
            pomoInterval = setInterval(() => {
                if (pomoTimeLeft <= 0) {
                    clearInterval(pomoInterval);
                    pomoRunning = false;
                    pomoSessions.unshift({ task: pomoCurrentTask, duration: pomoTotalTime, completedAt: new Date().toISOString() });
                    localStorage.setItem('pomo_sessions_' + currentUser.phone, JSON.stringify(pomoSessions));
                    localStorage.removeItem('pomo_state_' + currentUser.phone);
                    resetPomoColors();
                    renderPomoHistory();
                    updatePomoDisplay();
                    showPomoCompletionModal();
                    return;
                }
                pomoTimeLeft--;
                updatePomoDisplay();
                if (pomoTimeLeft <= 60) setPomoWarning(true);
                if (pomoTimeLeft % 5 === 0) savePomoState();
            }, 1000);
        }
    } catch (e) {
        localStorage.removeItem('pomo_state_' + currentUser.phone);
    }
}

// ============================================
// HISTORY
// ============================================
function renderPomoHistory() {
    const el = document.getElementById('pomoLogList');
    if (!el) return;
    if (!pomoSessions.length) {
        el.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:12px;padding:10px;">এখনো কোনো সেশন নেই</div>';
        return;
    }
    el.innerHTML = pomoSessions.slice(0, 10).map(s => `
        <div class="pomo-history-item">
            <span>${escHtml(s.task) || 'টাস্ক'}</span>
            <div style="text-align:right;">
                <div style="font-size:10px;color:var(--accent);">${formatSeconds(s.duration)}</div>
                <div style="font-size:9px;color:var(--text2);">${toBanglaDateTime(s.completedAt)}</div>
            </div>
        </div>
    `).join('');
}

// ============================================
// PROFILE LIVE CARD
// ============================================
function renderPomoInProfile() {
    const el = document.getElementById('pomoActiveInProfile');
    if (!el) return;
    if (!pomoRunning && pomoTimeLeft >= pomoTotalTime) { el.innerHTML = ''; return; }
    
    el.innerHTML = `<div class="pomo-active-card">
        <div class="pomo-watch-face">
            <div class="pomo-watch-label">ATLAS Pomodoro Watch</div>
            <div class="pomo-watch-time" style="${pomoTimeLeft <= 60 && pomoRunning ? 'color:#F85149;' : ''}">${formatSeconds(pomoTimeLeft)}</div>
            <div class="pomo-task-name-profile">${escHtml(pomoCurrentTask) || 'পড়াশোনা চলছে...'}</div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;justify-content:center;flex-wrap:wrap;">
            ${pomoRunning
                ? `<button class="pomo-ctrl-btn" onclick="pomoPause()" style="font-size:10px;width:auto;height:auto;padding:5px 10px;border-radius:8px;">⏸ পজ</button>`
                : `<button class="pomo-ctrl-btn play" onclick="pomoStart()" style="font-size:10px;width:auto;height:auto;padding:5px 10px;border-radius:8px;">▶ শুরু</button>`
            }
            <button class="pomo-ctrl-btn" onclick="pomoReset()" style="font-size:10px;width:auto;height:auto;padding:5px 10px;border-radius:8px;" title="Reset">↺</button>
            <button class="pomo-ctrl-btn" onclick="stopPomodoro()" style="font-size:10px;width:auto;height:auto;padding:5px 10px;border-radius:8px;color:var(--red);" title="Stop">⏹</button>
            <button class="pomo-ctrl-btn" onclick="openScreen('pomoScreen');updatePomoDisplay();renderPomoHistory();" style="font-size:10px;width:auto;height:auto;padding:5px 10px;border-radius:8px;">⚙️</button>
        </div>
    </div>`;
}

// ============================================
// COMPLETION MODAL (YES/NO)
// ============================================
function showPomoCompletionModal() {
    let modal = document.getElementById('pomoCompletionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pomoCompletionModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width:360px;text-align:center;animation:modalSlide 0.3s ease;">
                <div style="font-size:48px;margin-bottom:12px;">⏰</div>
                <div style="font-size:18px;font-weight:700;color:var(--accent);margin-bottom:4px;">Pomodoro Complete!</div>
                <p style="font-size:13px;color:var(--text2);margin-bottom:4px;">
                    কাজ: <b style="color:var(--text);" id="pomoCompleteTaskName"></b>
                </p>
                <p style="font-size:11px;color:var(--text2);margin-bottom:16px;">
                    আপনি কি কাজটি সফলভাবে complete করেছেন?
                </p>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-success" id="pomoYesBtn" style="flex:1;padding:12px;font-size:14px;">✅ হ্যাঁ, সম্পন্ন!</button>
                    <button class="btn btn-danger" id="pomoNoBtn" style="flex:1;padding:12px;font-size:14px;">❌ না</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('pomoYesBtn').onclick = pomoCompleteYes;
        document.getElementById('pomoNoBtn').onclick = pomoCompleteNo;
        
        modal.onclick = function(e) {
            if (e.target === modal) pomoCompleteNo();
        };
    }
    
    document.getElementById('pomoCompleteTaskName').textContent = pomoCurrentTask || 'টাস্ক';
    modal.classList.add('active');
}

function pomoCompleteYes() {
    document.getElementById('pomoCompletionModal')?.classList.remove('active');
    
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem('pomo_daily_' + currentUser.phone);
    let daily = saved ? JSON.parse(saved) : {};
    if (!daily[today]) daily[today] = { total: 0, completed: 0 };
    daily[today].total++;
    daily[today].completed++;
    localStorage.setItem('pomo_daily_' + currentUser.phone, JSON.stringify(daily));
    
    const streak = (parseInt(localStorage.getItem('pomo_streak_' + currentUser.phone)) || 0) + 1;
    localStorage.setItem('pomo_streak_' + currentUser.phone, streak);
    
    const totalSessions = (parseInt(localStorage.getItem('total_pomo_sessions_' + currentUser.phone)) || 0) + 1;
    const totalCompleted = (parseInt(localStorage.getItem('total_pomo_completed_' + currentUser.phone)) || 0) + 1;
    localStorage.setItem('total_pomo_sessions_' + currentUser.phone, totalSessions);
    localStorage.setItem('total_pomo_completed_' + currentUser.phone, totalCompleted);
    
    showToast('✅ দারুণ! কাজ সম্পন্ন হয়েছে। 🔥 স্ট্রিক: ' + streak);
    
    setTimeout(() => showPomoSuccessGraph(), 600);
}

function pomoCompleteNo() {
    document.getElementById('pomoCompletionModal')?.classList.remove('active');
    
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem('pomo_daily_' + currentUser.phone);
    let daily = saved ? JSON.parse(saved) : {};
    if (!daily[today]) daily[today] = { total: 0, completed: 0 };
    daily[today].total++;
    localStorage.setItem('pomo_daily_' + currentUser.phone, JSON.stringify(daily));
    
    localStorage.setItem('pomo_streak_' + currentUser.phone, '0');
    
    const totalSessions = (parseInt(localStorage.getItem('total_pomo_sessions_' + currentUser.phone)) || 0) + 1;
    localStorage.setItem('total_pomo_sessions_' + currentUser.phone, totalSessions);
    
    showToast('😔 পরের বার চেষ্টা করবেন।');
}

// ============================================
// SUCCESS RATE GRAPH (3-DAY)
// ============================================
function showPomoSuccessGraph() {
    const lastShown = localStorage.getItem('pomo_graph_shown_' + currentUser.phone);
    const today = new Date().toISOString().split('T')[0];
    if (lastShown === today) return;
    
    const saved = localStorage.getItem('pomo_daily_' + currentUser.phone);
    const daily = saved ? JSON.parse(saved) : {};
    const dates = [];
    for (let i = 2; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        dates.push(d);
    }
    
    const hasData = dates.some(d => daily[d]);
    if (!hasData) return;
    
    const oldGraph = document.getElementById('pomoSuccessGraph');
    if (oldGraph) oldGraph.remove();
    
    const profileCard = document.getElementById('profileCard');
    const graphEl = document.createElement('div');
    graphEl.id = 'pomoSuccessGraph';
    graphEl.className = 'graph-card';
    graphEl.style.marginTop = '10px';
    graphEl.style.animation = 'fadeIn 0.5s ease';
    
    const rates = dates.map(d => {
        if (!daily[d]) return 0;
        return daily[d].total > 0 ? Math.round((daily[d].completed / daily[d].total) * 100) : 0;
    });
    
    const avg = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
    const maxRate = Math.max(...rates, 1);
    const streak = localStorage.getItem('pomo_streak_' + currentUser.phone) || '0';
    
    const dayLabels = dates.map(d => {
        const date = new Date(d);
        return date.toLocaleDateString('bn-BD', { weekday: 'short' });
    });
    
    graphEl.innerHTML = `
        <div class="graph-title">🍅 Pomodoro Success Rate <span class="graph-title-badge">শেষ ৩ দিন</span></div>
        <div class="bar-chart" style="height:70px;">
            ${rates.map((r, i) => {
                const h = Math.max(4, (r / 100) * 70);
                const cls = r >= 80 ? 'high' : r >= 50 ? 'mid' : 'low';
                return `<div class="bar-wrap">
                    <div style="flex:1;display:flex;align-items:flex-end;width:100%;">
                        <div class="bar ${cls}" style="height:${h}%;animation:growBar 0.8s ease ${i * 0.2}s both;" data-score="${r}%"></div>
                    </div>
                    <div class="bar-label">${dayLabels[i]}</div>
                </div>`;
            }).join('')}
        </div>
        <div class="graph-stats">
            <div class="graph-stat">
                <div class="graph-stat-val" style="color:${avg >= 80 ? 'var(--green)' : avg >= 50 ? 'var(--yellow)' : 'var(--red)'};">${avg}%</div>
                <div class="graph-stat-lbl">📈 গড়</div>
            </div>
            <div class="graph-stat">
                <div class="graph-stat-val">${maxRate}%</div>
                <div class="graph-stat-lbl">🏆 সেরা</div>
            </div>
            <div class="graph-stat">
                <div class="graph-stat-val">🔥 ${streak}</div>
                <div class="graph-stat-lbl">স্ট্রিক</div>
            </div>
        </div>
    `;
    
    profileCard.parentNode.insertBefore(graphEl, profileCard.nextSibling);
    localStorage.setItem('pomo_graph_shown_' + currentUser.phone, today);
}

// ============================================
// INIT
// ============================================
function initPomodoro() {
    const savedSessions = localStorage.getItem('pomo_sessions_' + currentUser?.phone);
    if (savedSessions) {
        try { pomoSessions = JSON.parse(savedSessions); } catch (e) {}
    }
    restorePomoState();
}

// ============================================
// CSS (auto-injected)
// ============================================
(function injectPomoCSS() {
    if (document.getElementById('pomo-inline-css')) return;
    const style = document.createElement('style');
    style.id = 'pomo-inline-css';
    style.textContent = `
        .pomo-watch-card.warning { border-color: rgba(248,81,73,0.6) !important; box-shadow: 0 0 40px rgba(248,81,73,0.25) !important; }
        #pomoCompletionModal .modal { background: var(--card); border: 2px solid var(--accent); box-shadow: 0 0 40px rgba(124,131,255,0.3); }
        #pomoCompletionModal .btn-success { background: var(--green); color: #fff; }
        #pomoCompletionModal .btn-success:hover { filter: brightness(1.1); }
        #pomoCompletionModal .btn-danger { background: var(--red); color: #fff; }
        #pomoCompletionModal .btn-danger:hover { filter: brightness(1.1); }
        #pomoSuccessGraph { border: 1px solid rgba(124,131,255,0.3); box-shadow: 0 0 20px rgba(124,131,255,0.1); }
        @keyframes growBar { from { height: 0 !important; } }
        .pomo-active-card .pomo-ctrl-btn { font-size: 10px; width: auto; height: auto; padding: 5px 10px; border-radius: 8px; transition: all 0.2s ease; }
        .pomo-active-card .pomo-ctrl-btn:hover { transform: scale(1.08); box-shadow: var(--shadow); }
    `;
    document.head.appendChild(style);
})();
