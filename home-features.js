/* ══════════════════════════════════════════════
   HOME PAGE EXTRA FEATURES — NEW FILE, ISOLATED
   GPA Calculator (SSC×8 + HSC×12, out of 100)
   Uses existing #mainModal / #modalContent / closeModal() from index.html
   Does not touch or override any existing function or element.
   (Note: Pomodoro Timer on the home page now links directly to
   dashboard.html#pomoScreen, reusing the same timer/state as the
   profile page instead of a separate duplicate timer.)
══════════════════════════════════════════════ */

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
        resultBox.innerHTML = `<div style="color:var(--danger,#E53E3E);font-size:13px;text-align:center;padding:8px;"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#F59E0B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' /> <path d='M12 9v4' /> <path d='M12 17h.01' /></svg>️ সঠিক SSC ও HSC GPA দিন (0.00 - 5.00 এর মধ্যে)</div>`;
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
