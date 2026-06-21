/* ══════════════════════════════════════════════
   HOME PAGE EXTRA FEATURES — NEW FILE, ISOLATED
   1) Pomodoro Timer (mini, fully working, persists via localStorage)
   2) GPA Calculator (SSC×8 + HSC×12, out of 100)
   Uses existing #mainModal / #modalContent / closeModal() from index.html
   Does not touch or override any existing function or element.
══════════════════════════════════════════════ */

/* ---------- 1) HOME POMODORO TIMER ---------- */
let hfPomoInterval = null;

function openHomePomodoroModal() {
    const mc = document.getElementById('modalContent');
    mc.innerHTML = `
        <div class="modal-title">⏱️ Pomodoro Timer</div>
        <div style="text-align:center;padding:6px 0 4px;">
            <div id="hfPomoDigits" style="font-family:'Space Mono',monospace;font-size:clamp(28px,10vw,44px);font-weight:700;color:var(--accent,#6366F1);letter-spacing:2px;">25:00</div>
            <div id="hfPomoTaskShow" style="font-size:11px;color:var(--text-secondary,#888);margin-top:4px;min-height:14px;"></div>
        </div>
        <div style="margin-top:10px;">
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:4px;">টাস্কের নাম (ঐচ্ছিক)</label>
            <input type="text" id="hfPomoTask" placeholder="যেমন: রসায়ন রিভিশন" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;background:var(--bg,transparent);color:var(--text);font-size:13px;box-sizing:border-box;">
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
            <button class="btn btn-outline" onclick="hfPomoSetPreset(25)" style="flex:1;">25 মিনিট</button>
            <button class="btn btn-outline" onclick="hfPomoSetPreset(45)" style="flex:1;">45 মিনিট</button>
            <button class="btn btn-outline" onclick="hfPomoSetPreset(60)" style="flex:1;">৬০ মিনিট</button>
        </div>
        <div style="display:flex;gap:8px;">
            <button class="btn btn-primary" id="hfPomoToggleBtn" onclick="hfPomoToggle()" style="flex:1;">▶️ শুরু করুন</button>
            <button class="btn btn-outline" onclick="hfPomoReset()" style="flex:1;">↺ রিসেট</button>
        </div>
        <div class="modal-close">
            <button class="btn btn-outline" onclick="closeModal()" style="width:100%;">✕ বন্ধ</button>
        </div>`;
    document.getElementById('mainModal').classList.add('active');
    hfPomoRestore();
}

function hfPomoFormat(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function hfPomoSaveState(endAt, running, totalSeconds, task) {
    localStorage.setItem('hf_pomo_state', JSON.stringify({ endAt, running, totalSeconds, task }));
}

function hfPomoRestore() {
    const raw = localStorage.getItem('hf_pomo_state');
    const digitsEl = document.getElementById('hfPomoDigits');
    const taskEl = document.getElementById('hfPomoTask');
    const taskShowEl = document.getElementById('hfPomoTaskShow');
    if (!raw) { if (digitsEl) digitsEl.textContent = '25:00'; return; }
    try {
        const state = JSON.parse(raw);
        if (taskEl && state.task) taskEl.value = state.task;
        if (taskShowEl && state.task) taskShowEl.textContent = '📌 ' + state.task;
        if (state.running) {
            const remaining = Math.round((state.endAt - Date.now()) / 1000);
            if (remaining > 0) {
                hfPomoStartInterval(state.endAt, state.totalSeconds, state.task || '');
            } else {
                if (digitsEl) digitsEl.textContent = '00:00';
                localStorage.removeItem('hf_pomo_state');
            }
        } else {
            if (digitsEl) digitsEl.textContent = hfPomoFormat(state.totalSeconds || 1500);
        }
    } catch (e) { if (digitsEl) digitsEl.textContent = '25:00'; }
}

function hfPomoSetPreset(mins) {
    if (hfPomoInterval) { return; } // ignore preset change while running
    const digitsEl = document.getElementById('hfPomoDigits');
    if (digitsEl) digitsEl.textContent = hfPomoFormat(mins * 60);
    hfPomoSaveState(null, false, mins * 60, document.getElementById('hfPomoTask')?.value?.trim() || '');
}

function hfPomoStartInterval(endAt, totalSeconds, task) {
    if (hfPomoInterval) clearInterval(hfPomoInterval);
    const digitsEl = document.getElementById('hfPomoDigits');
    const btn = document.getElementById('hfPomoToggleBtn');
    if (btn) btn.textContent = '⏸️ পজ করুন';
    hfPomoInterval = setInterval(() => {
        const remaining = Math.round((endAt - Date.now()) / 1000);
        const d = document.getElementById('hfPomoDigits'); // re-fetch in case modal re-rendered
        if (remaining <= 0) {
            if (d) d.textContent = '00:00';
            clearInterval(hfPomoInterval);
            hfPomoInterval = null;
            localStorage.removeItem('hf_pomo_state');
            const b = document.getElementById('hfPomoToggleBtn');
            if (b) b.textContent = '▶️ শুরু করুন';
            if (typeof showToast === 'function') showToast('⏱️ সময় শেষ! বিরতি নিন।');
            return;
        }
        if (d) d.textContent = hfPomoFormat(remaining);
        hfPomoSaveState(endAt, true, totalSeconds, task);
    }, 1000);
    if (digitsEl) digitsEl.textContent = hfPomoFormat(Math.round((endAt - Date.now()) / 1000));
}

function hfPomoToggle() {
    const btn = document.getElementById('hfPomoToggleBtn');
    const digitsEl = document.getElementById('hfPomoDigits');
    const task = document.getElementById('hfPomoTask')?.value?.trim() || '';
    const taskShowEl = document.getElementById('hfPomoTaskShow');
    if (taskShowEl) taskShowEl.textContent = task ? ('📌 ' + task) : '';

    if (hfPomoInterval) {
        // currently running -> pause
        clearInterval(hfPomoInterval);
        hfPomoInterval = null;
        const remainingText = digitsEl ? digitsEl.textContent : '25:00';
        const parts = remainingText.split(':').map(Number);
        const remSeconds = parts[0] * 60 + parts[1];
        hfPomoSaveState(null, false, remSeconds, task);
        if (btn) btn.textContent = '▶️ শুরু করুন';
    } else {
        const currentText = digitsEl ? digitsEl.textContent : '25:00';
        const parts = currentText.split(':').map(Number);
        const totalSeconds = (parts[0] * 60 + parts[1]) || 1500;
        const endAt = Date.now() + totalSeconds * 1000;
        hfPomoSaveState(endAt, true, totalSeconds, task);
        hfPomoStartInterval(endAt, totalSeconds, task);
    }
}

function hfPomoReset() {
    if (hfPomoInterval) clearInterval(hfPomoInterval);
    hfPomoInterval = null;
    localStorage.removeItem('hf_pomo_state');
    const digitsEl = document.getElementById('hfPomoDigits');
    if (digitsEl) digitsEl.textContent = '25:00';
    const btn = document.getElementById('hfPomoToggleBtn');
    if (btn) btn.textContent = '▶️ শুরু করুন';
}

/* ---------- 2) GPA CALCULATOR ---------- */
const HF_GPA_MOTIVATIONAL_LINES = [
    "প্রতিটি পরিশ্রমের ফল একদিন আসবেই। থেমে যাবেন না! 💪",
    "আজকের কষ্টই আগামীর সাফল্যের ভিত্তি। চালিয়ে যান! 🚀",
    "নাম্বার যা-ই হোক, আপনার আত্মবিশ্বাসই আসল শক্তি। 🔥",
    "যারা স্বপ্ন দেখার সাহস করে, তারাই একদিন জিতে যায়। ✨",
    "প্রস্তুতি যত ভালো হবে, ফলাফল তত উজ্জ্বল হবে। এগিয়ে যান! 🌟",
    "একটা নাম্বার আপনার ভবিষ্যৎ ঠিক করে না, আপনার পরিশ্রম করে। 📚",
    "আপনি যতটা মনে করছেন তার চেয়েও বেশি যোগ্য। বিশ্বাস রাখুন। 🌱"
];

function openGpaCalculatorModal() {
    const mc = document.getElementById('modalContent');
    mc.innerHTML = `
        <div class="modal-title">🎯 MBBS GPA Calculator</div>
        <div style="margin-bottom:10px;">
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:4px;">SSC GPA (সর্বোচ্চ ৫.০০)</label>
            <input type="number" id="hfGpaSSC" min="0" max="5" step="0.01" placeholder="যেমন: 4.89" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;background:var(--bg,transparent);color:var(--text);font-size:13px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:10px;">
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:4px;">HSC GPA (সর্বোচ্চ ৫.০০)</label>
            <input type="number" id="hfGpaHSC" min="0" max="5" step="0.01" placeholder="যেমন: 5.00" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;background:var(--bg,transparent);color:var(--text);font-size:13px;box-sizing:border-box;">
        </div>
        <button class="btn btn-primary" onclick="hfCalculateGpa()" style="width:100%;margin-top:6px;">📊 Calculate করুন</button>
        <div id="hfGpaResultBox" style="margin-top:14px;"></div>
        <div class="modal-close">
            <button class="btn btn-outline" onclick="closeModal()" style="width:100%;">✕ বন্ধ</button>
        </div>`;
    document.getElementById('mainModal').classList.add('active');
}

function hfCalculateGpa() {
    const sscEl = document.getElementById('hfGpaSSC');
    const hscEl = document.getElementById('hfGpaHSC');
    const resultBox = document.getElementById('hfGpaResultBox');
    const ssc = parseFloat(sscEl?.value);
    const hsc = parseFloat(hscEl?.value);

    if (isNaN(ssc) || isNaN(hsc) || ssc < 0 || ssc > 5 || hsc < 0 || hsc > 5) {
        resultBox.innerHTML = `<div style="color:var(--danger,#E53E3E);font-size:13px;text-align:center;padding:8px;">⚠️ সঠিক SSC ও HSC GPA দিন (0.00 - 5.00 এর মধ্যে)</div>`;
        return;
    }

    const sscScore = ssc * 8;
    const hscScore = hsc * 12;
    const total = sscScore + hscScore; // out of 100
    const totalClamped = Math.min(100, Math.max(0, total));
    const deducted = 100 - totalClamped;

    const line = HF_GPA_MOTIVATIONAL_LINES[Math.floor(Math.random() * HF_GPA_MOTIVATIONAL_LINES.length)];

    resultBox.innerHTML = `
        <div style="background:var(--card-bg,rgba(99,102,241,0.06));border:1px solid var(--border);border-radius:10px;padding:14px;font-size:13px;line-height:1.7;color:var(--text);">
            <div style="font-weight:700;text-align:center;margin-bottom:6px;">🎯 MBBS GPA Score Result</div>
            <div style="border-top:1px dashed var(--border);margin:6px 0;"></div>
            <div>📘 SSC GPA: ${ssc.toFixed(2)} × 8 = ${sscScore.toFixed(2)}</div>
            <div>📗 HSC GPA: ${hsc.toFixed(2)} × 12 = ${hscScore.toFixed(2)}</div>
            <div style="border-top:1px dashed var(--border);margin:6px 0;"></div>
            <div>🚀 MBBS ভর্তি পরীক্ষায় আপনার GPA Score: <b>(${totalClamped.toFixed(2)}/100)</b></div>
            <div>✅ কাটা যাবে: <b>(${deducted.toFixed(2)})</b></div>
            <div style="border-top:1px dashed var(--border);margin:10px 0 6px;"></div>
            <div style="text-align:center;font-size:12px;color:var(--accent,#6366F1);font-weight:600;">${line}</div>
        </div>`;
}
