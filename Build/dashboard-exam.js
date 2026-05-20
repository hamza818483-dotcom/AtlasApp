// ======================================================
// dashboard-exam.js — ATLAS EXAM DASHBOARD (Complete)
// ======================================================
const SUPABASE_URL = 'https://btezborkuiqfogykrjrn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZXpib3JrdWlxZm9neWtyanJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTIyNzUsImV4cCI6MjA5NDIyODI3NX0.G4C7YTmk-AEvhWXnx-phMjTh9pxbdhCiapYVDpSVsEw';

let isDarkMode = true, currentUser = null, confirmCallback = null, examResultsCache = [], currentQFilter = 'all', resultOverlayAllData = [];
let practiceQuestions = [], practiceAnswers = {}, practiceCurrentIdx = 0, practiceTimer = null, practiceTimeLeft = 0, practiceTitle = '', practiceRetryFn = null;

function showToast(m, d = 2500) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), d); }
function toggleTheme() { isDarkMode = !isDarkMode; document.body.classList.toggle('light-mode', !isDarkMode); document.getElementById('themeBtn').textContent = isDarkMode ? '🌙' : '☀️'; localStorage.setItem('atlas-theme', isDarkMode ? 'dark' : 'light'); }
function goBack() { window.history.back(); }
function toBanglaNum(n) { const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']; return String(n).replace(/[0-9]/g, d => bn[d]); }
function toBanglaDate(s) { try { return new Date(s).toLocaleString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return s || '—'; } }
function toBanglaDateTime(s) { try { const d = new Date(s); return d.toLocaleString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s || '—'; } }
function escHtml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatSeconds(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), se = s % 60; if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')}`; return `${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')}`; }

function showConfirm(t, m, l, cb) { document.getElementById('confirmTitle').textContent = t; document.getElementById('confirmMsg').textContent = m; document.getElementById('confirmOkBtn').textContent = l || '✅ হ্যাঁ'; confirmCallback = cb; document.getElementById('confirmDialog').classList.add('active'); }
function closeConfirm() { confirmCallback = null; document.getElementById('confirmDialog').classList.remove('active'); }
document.getElementById('confirmOkBtn').onclick = () => { if (confirmCallback) confirmCallback(); closeConfirm(); };

function checkAuth() { try { currentUser = JSON.parse(localStorage.getItem('atlas-session')); if (!currentUser) { location.replace('auth.html'); return false; } return true; } catch (e) { location.replace('auth.html'); return false; } }

async function safeFetch(url, opts = {}) { opts.headers = Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, opts.headers || {}); if (!opts.headers['Content-Type'] && opts.method !== 'DELETE') opts.headers['Content-Type'] = 'application/json'; try { const res = await fetch(url, opts); const text = await res.text(); if (!text?.trim()) return []; const data = JSON.parse(text); if (!res.ok) throw new Error(data.message || 'Server error'); return data; } catch (e) { console.error('❌ safeFetch:', e.message); return []; } }

// ======================================================
// EXAM HISTORY
// ======================================================
async function loadHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="skeleton skeleton-block"></div><div class="skeleton skeleton-block"></div>';
    try {
        const data = await safeFetch(`${SUPABASE_URL}/rest/v1/exam_results?phone=eq.${currentUser.phone}&select=*&order=submitted_at.desc&limit=100`);
        examResultsCache = data || [];
        document.getElementById('historySubtitle').textContent = `মোট ${toBanglaNum(examResultsCache.length)}টি এক্সাম`;
        const cats = [...new Set(examResultsCache.map(r => r.category).filter(Boolean))];
        const subs = [...new Set(examResultsCache.map(r => r.subject).filter(Boolean))];
        const catSel = document.getElementById('filterCat'), subSel = document.getElementById('filterSub');
        catSel.innerHTML = '<option value="all">সব ক্যাটাগরি</option>' + cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
        subSel.innerHTML = '<option value="all">সব সাবজেক্ট</option>' + subs.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
        let filtered = examResultsCache;
        if (catSel.value !== 'all') filtered = filtered.filter(r => r.category === catSel.value);
        if (subSel.value !== 'all') filtered = filtered.filter(r => r.subject === subSel.value);
        if (!filtered.length) { list.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><div class="empty-state-text">কোনো এক্সাম হিস্টোরি নেই</div></div>`; return; }
        list.innerHTML = filtered.map(r => buildHistoryCard(r)).join('');
        buildExamGraph(examResultsCache);
    } catch (e) { list.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠️</span><div class="empty-state-text">লোড করতে সমস্যা হয়েছে</div></div>`; }
}

function buildHistoryCard(r) {
    const score = parseFloat(r.final_score) || 0, total = r.total_questions || 50;
    const pct = Math.round((score / total) * 100);
    const badge = pct >= 80 ? 'score-high' : pct >= 50 ? 'score-mid' : 'score-low';
    const examName = r.exam_name || `এক্সাম #${r.exam_id}`;
    return `<div class="card-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div class="card-item-title" style="flex:1;margin-bottom:0;font-size:13px;">📝 ${escHtml(examName)}</div>
            <span class="score-badge ${badge}" style="margin-left:6px;white-space:nowrap;">${score.toFixed(1)}/${total}</span>
        </div>
        <div style="margin-bottom:5px;">${r.subject ? `<span class="meta-chip">📘 ${escHtml(r.subject)}${r.chapter ? ' › ' + escHtml(r.chapter) : ''}${r.category ? ' › ' + escHtml(r.category) : ''}</span>` : ''}</div>
        <div class="card-item-row"><span>✅ সঠিক</span><span style="color:var(--green);font-weight:700;">${r.correct || 0}</span></div>
        <div class="card-item-row"><span>❌ ভুল</span><span style="color:var(--red);font-weight:700;">${r.wrong || 0}</span></div>
        <div class="card-item-row" style="border-bottom:none;"><span>⏭️ স্কিপ</span><span style="color:var(--yellow);font-weight:700;">${r.skipped || 0}</span></div>
        <div class="card-item-sub" style="margin-top:4px;">📅 ${toBanglaDateTime(r.submitted_at)}</div>
        <div class="btn-row">
            <button class="btn btn-outline" onclick="viewDetails('${r.id}','${r.exam_id}')">📋 বিস্তারিত</button>
            <button class="btn btn-primary" onclick="retakeExam('${r.exam_id}')">🔄 আবার এক্সাম দাও</button>
            <button class="btn btn-outline" onclick="viewQuestions('${r.exam_id}')">📝 প্রশ্ন দেখো</button>
            <button class="btn btn-danger" onclick="deleteHistory('${r.id}')">🗑️</button>
        </div>
    </div>`;
}

async function viewQuestions(examId) {
    showToast('⏳ প্রশ্ন লোড হচ্ছে...');
    let questions = [];
    try { questions = await safeFetch(`${SUPABASE_URL}/rest/v1/questions?exam_id=eq.${examId}&select=*&order=id.asc`); } catch (e) { }
    if (!questions.length) { showToast('❌ প্রশ্ন পাওয়া যায়নি'); return; }
    const modal = document.getElementById('detailModal'), content = document.getElementById('detailModalContent');
    const optBn = ['ক', 'খ', 'গ', 'ঘ', 'ঙ'];
    content.innerHTML = `<div class="modal-title">📝 প্রশ্নসমূহ</div>${questions.map((q, i) => {
        const opts = [q.option1, q.option2, q.option3, q.option4, q.option5].filter(Boolean);
        const optsHtml = opts.map((opt, j) => { const isCorrect = (j + 1) === parseInt(q.answer_index || 1); return `<li class="option-item ${isCorrect ? 'correct' : ''}"><span class="option-key">${optBn[j]}</span>${escHtml(opt)}${isCorrect ? ' ✅' : ''}</li>`; }).join('');
        return `<div class="question-card"><div class="question-text">${i + 1}. ${escHtml(q.question_text || q.question || '')}</div>${q.image_url ? `<img class="question-img" src="${escHtml(q.image_url)}" loading="lazy">` : ''}<ul class="options-list">${optsHtml}</ul>${q.explanation ? `<div class="explanation-box">💡 ${escHtml(q.explanation)}</div>` : ''}</div>`;
    }).join('')}<div class="modal-close-strip"><button class="btn btn-outline" onclick="document.getElementById('detailModal').classList.remove('active')" style="width:100%;">✕ বন্ধ</button></div>`;
    modal.classList.add('active');
}

async function deleteHistory(resultId) {
    showConfirm('ডিলিট করুন', 'এই এক্সাম ইতিহাস মুছে ফেলবেন?', '🗑️ ডিলিট', async () => { await safeFetch(`${SUPABASE_URL}/rest/v1/exam_results?id=eq.${resultId}`, { method: 'DELETE' }); showToast('🗑️ ডিলিট সম্পন্ন'); loadHistory(); });
}

// ======================================================
// EXAM DETAIL MODAL
// ======================================================
async function viewDetails(resultId, examId) {
    const modal = document.getElementById('detailModal'), content = document.getElementById('detailModalContent');
    currentQFilter = 'all';
    const result = examResultsCache.find(r => String(r.id) === String(resultId));
    if (!result) { content.innerHTML = `<div class="modal-title">📋 বিস্তারিত</div><p style="text-align:center;color:var(--text2);padding:20px;">তথ্য পাওয়া যাচ্ছে না</p><button class="btn btn-outline" onclick="document.getElementById('detailModal').classList.remove('active')" style="width:100%;margin-top:8px;">✕ বন্ধ</button>`; modal.classList.add('active'); return; }
    content.innerHTML = `<div class="modal-title">📋 ${escHtml(result.exam_name || 'এক্সাম')}</div><div style="padding:20px;text-align:center;color:var(--text2);">প্রশ্ন লোড হচ্ছে...</div>`;
    modal.classList.add('active');
    let questions = []; try { questions = await safeFetch(`${SUPABASE_URL}/rest/v1/questions?exam_id=eq.${examId}&select=*&order=id.asc`); } catch (e) { }
    let answers = {}; try { answers = typeof result.answers === 'string' ? JSON.parse(result.answers) : (result.answers || {}); } catch (e) { }
    renderDetailModal(result, questions, answers, result.exam_name || `এক্সাম #${examId}`, parseFloat(result.final_score) || 0, result.total_questions || 50);
}

function renderDetailModal(result, questions, answers, examName, score, total) {
    const content = document.getElementById('detailModalContent');
    const pct = Math.round((score / total) * 100);
    const badge = pct >= 80 ? 'score-high' : pct >= 50 ? 'score-mid' : 'score-low';
    content._questions = questions; content._answers = answers; content._result = result;
    let html = `<div class="modal-title">📋 ${escHtml(examName)}</div>
        <div style="text-align:center;margin-bottom:10px;"><span class="score-badge ${badge}" style="font-size:14px;padding:4px 14px;">${score.toFixed(1)} / ${total} (${pct}%)</span></div>
        <div style="display:flex;justify-content:space-around;padding:8px;background:var(--hover);border-radius:8px;margin-bottom:10px;">
            <div style="text-align:center;"><div style="color:var(--green);font-size:16px;font-weight:800;">✅ ${result.correct || 0}</div><div style="font-size:9px;color:var(--text2);">সঠিক</div></div>
            <div style="text-align:center;"><div style="color:var(--red);font-size:16px;font-weight:800;">❌ ${result.wrong || 0}</div><div style="font-size:9px;color:var(--text2);">ভুল</div></div>
            <div style="text-align:center;"><div style="color:var(--yellow);font-size:16px;font-weight:800;">⏭️ ${result.skipped || 0}</div><div style="font-size:9px;color:var(--text2);">স্কিপ</div></div>
        </div>`;
    if (questions.length > 0) {
        html += `<div class="q-filter-tabs" id="detailFilterTabs">
            <button class="q-filter-tab active" onclick="setQFilter('all',this)">📋 সব (${questions.length})</button>
            <button class="q-filter-tab" onclick="setQFilter('correct',this)">✅ সঠিক</button>
            <button class="q-filter-tab" onclick="setQFilter('wrong',this)">❌ ভুল</button>
            <button class="q-filter-tab" onclick="setQFilter('skipped',this)">⏭️ স্কিপ</button>
        </div><div id="questionsList">${buildQuestionsHtml(questions, answers, 'all')}</div>`;
    } else { html += `<p style="text-align:center;color:var(--text2);padding:10px;">প্রশ্ন পাওয়া যাচ্ছে না</p>`; }
    html += `<div class="modal-close-strip"><div class="btn-row">
        <button class="btn btn-primary" onclick="retakeExam('${result.exam_id}')" style="flex:1;">🔄 আবার এক্সাম দাও</button>
        <button class="btn btn-outline" onclick="document.getElementById('detailModal').classList.remove('active')" style="flex:1;">✕ বন্ধ</button>
    </div></div>`;
    content.innerHTML = html;
}

function setQFilter(filter, btn) {
    currentQFilter = filter;
    document.querySelectorAll('#detailFilterTabs .q-filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const content = document.getElementById('detailModalContent');
    const qList = document.getElementById('questionsList');
    if (qList) qList.innerHTML = buildQuestionsHtml(content._questions || [], content._answers || {}, filter);
}

function buildQuestionsHtml(questions, answers, filter) {
    if (!questions || !questions.length) return '<p style="text-align:center;color:var(--text2);padding:10px;">প্রশ্ন পাওয়া যায়নি</p>';
    const optBn = ['ক', 'খ', 'গ', 'ঘ', 'ঙ'];
    let items = questions.map((q, idx) => {
        const userAns = answers[q.id] !== undefined ? answers[q.id] : (answers[idx] !== undefined ? answers[idx] : null);
        const correctIdx = q.answer_index !== undefined ? q.answer_index : q.correct_option;
        let status = 'skipped'; if (userAns !== null && userAns !== undefined && String(userAns) !== '') status = String(userAns) === String(correctIdx) ? 'correct' : 'wrong';
        return { q, userAns, status, correctIdx, idx };
    });
    if (filter !== 'all') items = items.filter(i => i.status === filter);
    if (!items.length) return `<div class="empty-state" style="padding:20px;"><span class="empty-state-icon">${filter === 'correct' ? '✅' : filter === 'wrong' ? '❌' : '⏭️'}</span><div class="empty-state-text">কোনো প্রশ্ন নেই</div></div>`;
    return items.map(({ q, userAns, status, correctIdx }) => {
        const statusLabel = status === 'correct' ? '✅ সঠিক' : status === 'wrong' ? '❌ ভুল' : '⏭️ স্কিপ';
        const opts = [q.option1, q.option2, q.option3, q.option4, q.option5].filter(o => o && o !== '—');
        const optsHtml = opts.map((opt, i) => { const isC = (i + 1) === parseInt(correctIdx); const isUW = String(userAns) === String(i + 1) && !isC; return `<li class="option-item ${isC ? 'correct' : isUW ? 'wrong' : ''}"><span class="option-key">${optBn[i]}</span>${escHtml(opt)} ${isC ? '✅' : ''} ${isUW ? '❌' : ''}</li>`; }).join('');
        return `<div class="question-card"><span class="q-status ${status}">${statusLabel}</span>${q.image_url ? `<img class="question-img" src="${escHtml(q.image_url)}" loading="lazy">` : ''}<div class="question-text">${escHtml(q.question_text || q.question || '')}</div><ul class="options-list">${optsHtml}</ul>${q.explanation ? `<div class="explanation-box">💡 ${escHtml(q.explanation)}</div>` : ''}</div>`;
    }).join('');
}

// ======================================================
// PRACTICE EXAM ENGINE (Full)
// ======================================================
function startPracticeExam(questions, title, retryFn) {
    practiceQuestions = questions; practiceAnswers = {}; practiceCurrentIdx = 0;
    practiceTitle = title; practiceRetryFn = retryFn;
    practiceTimeLeft = questions.length * 60;
    document.getElementById('examOverlayTitle').textContent = title;
    document.getElementById('examOverlay').classList.add('active');
    renderExamQuestion(); renderExamNavGrid(); startExamTimer();
}
function renderExamQuestion() {
    const q = practiceQuestions[practiceCurrentIdx]; if (!q) return;
    const optBn = ['ক', 'খ', 'গ', 'ঘ', 'ঙ'];
    const opts = [q.option1, q.option2, q.option3, q.option4, q.option5].filter(o => o && o !== '—');
    const userAns = practiceAnswers[practiceCurrentIdx];
    const total = practiceQuestions.length;
    document.getElementById('examOverlayProgress').textContent = `${practiceCurrentIdx + 1} / ${total}`;
    document.getElementById('examProgressFill').style.width = ((practiceCurrentIdx + 1) / total * 100) + '%';
    document.getElementById('examBody').innerHTML = `<div class="exam-q-card">
        <div style="font-size:10px;color:var(--text2);margin-bottom:6px;">প্রশ্ন ${practiceCurrentIdx + 1} / ${total}</div>
        ${q.image_url ? `<img class="question-img" src="${escHtml(q.image_url)}" loading="lazy">` : ''}
        <div class="exam-q-text">${escHtml(q.question_text || q.question || '')}</div>
        ${opts.map((opt, i) => `<div class="exam-option ${userAns === (i + 1) ? 'selected' : ''}" onclick="selectExamOption(${i + 1})"><span class="exam-option-key">${optBn[i]}</span><span>${escHtml(opt)}</span></div>`).join('')}
    </div>`;
}
function selectExamOption(idx) { practiceAnswers[practiceCurrentIdx] = idx; renderExamQuestion(); renderExamNavGrid(); }
function examNav(dir) { const n = practiceCurrentIdx + dir; if (n < 0 || n >= practiceQuestions.length) return; practiceCurrentIdx = n; renderExamQuestion(); }
function renderExamNavGrid() { document.getElementById('examNavGrid').innerHTML = practiceQuestions.map((_, i) => { const cls = practiceAnswers[i] ? 'answered' : '', cur = i === practiceCurrentIdx ? 'current' : ''; return `<div class="exam-nav-num ${cls} ${cur}" onclick="practiceCurrentIdx=${i};renderExamQuestion();">${i + 1}</div>`; }).join(''); }
function toggleExamNav() { const panel = document.getElementById('examNavPanel'); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; if (panel.style.display === 'block') renderExamNavGrid(); }
function startExamTimer() {
    clearInterval(practiceTimer);
    practiceTimer = setInterval(() => {
        practiceTimeLeft--;
        const m = Math.floor(practiceTimeLeft / 60), s = practiceTimeLeft % 60;
        const timerEl = document.getElementById('examOverlayTimer');
        timerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        if (practiceTimeLeft <= 60) timerEl.classList.add('warning'); else timerEl.classList.remove('warning');
        if (practiceTimeLeft <= 0) submitPracticeExam();
    }, 1000);
}
function exitPracticeExam() { showConfirm('বের হবেন?', 'পরীক্ষা বাতিল করবেন?', 'হ্যাঁ', () => { clearInterval(practiceTimer); document.getElementById('examOverlay').classList.remove('active'); closeConfirm(); }); }
function submitPracticeExam() {
    clearInterval(practiceTimer); document.getElementById('examOverlay').classList.remove('active');
    document.getElementById('examOverlayTimer').classList.remove('warning');
    let correct = 0, wrong = 0, skipped = 0; const reviewData = [];
    practiceQuestions.forEach((q, i) => { const userAns = practiceAnswers[i], correctAns = q.answer_index || q.correct_option; let status = 'skipped'; if (userAns !== undefined && userAns !== null) status = String(userAns) === String(correctAns) ? 'correct' : 'wrong'; if (status === 'correct') correct++; else if (status === 'wrong') wrong++; else skipped++; reviewData.push({ q, userAns, status, correctAns }); });
    const total = practiceQuestions.length, negMark = wrong * 0.25;
    const sscGpa = parseFloat(currentUser?.ssc_gpa) || 0, hscGpa = parseFloat(currentUser?.hsc_gpa) || 0;
    const gpaScore = (sscGpa * 8) + (hscGpa * 12);
    const isSecondTimer = currentUser?.timer_type === 'second';
    const timerDeduction = isSecondTimer ? (total <= 50 ? 1.50 : 3.00) : 0;
    const finalScore = correct - negMark - timerDeduction, withGpa = finalScore + gpaScore;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const wrongQs = reviewData.filter(r => r.status === 'wrong' || r.status === 'skipped');
    if (wrongQs.length && currentUser) {
        const savedM = localStorage.getItem('mistakes_' + currentUser.phone);
        const mistakes = savedM ? JSON.parse(savedM) : [];
        wrongQs.forEach(r => { if (!mistakes.find(m => String(m.question_id || (m.question || m).id) === String(r.q.id))) mistakes.push({ question_id: r.q.id, question: r.q, user_answer: r.status === 'skipped' ? null : r.userAns, exam_name: practiceTitle, subject: r.q.subject || '', category: r.q.category || '', timestamp: new Date().toISOString() }); });
        localStorage.setItem('mistakes_' + currentUser.phone, JSON.stringify(mistakes));
    }
    showResultScreen(finalScore, total, correct, wrong, skipped, pct, practiceTitle, reviewData, negMark, gpaScore, withGpa, isSecondTimer, timerDeduction);
}

function showResultScreen(score, total, correct, wrong, skipped, pct, title, reviewData, negMark, gpaScore, withGpa, isSecondTimer, timerDeduction) {
    document.getElementById('resultScore').textContent = score.toFixed(2) + '/' + total;
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSubtitle').textContent = pct + '% সঠিক';
    document.getElementById('resCorrect').textContent = correct; document.getElementById('resWrong').textContent = wrong;
    document.getElementById('resSkipped').textContent = skipped; document.getElementById('resPct').textContent = pct + '%';
    resultOverlayAllData = reviewData;
    let summaryHtml = `<div class="card-item" style="padding:14px;margin-bottom:10px;">
        <div class="card-item-row"><span>📋 মোট প্রশ্ন</span><span style="font-weight:700;">${total}</span></div>
        <div class="card-item-row"><span>✅ সঠিক</span><span style="color:var(--green);font-weight:700;">+${correct}</span></div>
        <div class="card-item-row"><span>❌ ভুল (ক্ষতি ${negMark.toFixed(2)})</span><span style="color:var(--red);">-${negMark.toFixed(2)}</span></div>
        ${isSecondTimer ? `<div class="card-item-row"><span>⏱️ সেকেন্ড টাইমার</span><span style="color:var(--red);">-${timerDeduction.toFixed(2)}</span></div>` : ''}
        <div class="card-item-row" style="border-top:1px solid var(--border);padding-top:6px;"><span>📊 Without GPA</span><span style="font-weight:800;color:var(--accent);">${score.toFixed(2)}</span></div>
        <div class="card-item-row" style="border-bottom:none;"><span>🎓 With GPA (+${gpaScore.toFixed(2)})</span><span style="font-weight:800;color:var(--accent);">${withGpa.toFixed(2)}</span></div>
    </div>`;
    document.getElementById('resultReviewList').innerHTML = summaryHtml + buildResultReviewHtml(reviewData, 'all');
    document.querySelectorAll('#resultFilterTabs .q-filter-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('#resultFilterTabs .q-filter-tab').classList.add('active');
    document.getElementById('resultOverlay').classList.add('active');
}

function buildResultReviewHtml(reviewData, filter) {
    const optBn = ['ক', 'খ', 'গ', 'ঘ', 'ঙ'];
    let items = reviewData; if (filter !== 'all') items = items.filter(i => i.status === filter);
    if (!items.length) return `<div class="empty-state" style="padding:20px;"><span class="empty-state-icon">${filter === 'correct' ? '✅' : filter === 'wrong' ? '❌' : '⏭️'}</span><div class="empty-state-text">কোনো প্রশ্ন নেই</div></div>`;
    return items.map(({ q, userAns, status, correctAns }) => {
        const opts = [q.option1, q.option2, q.option3, q.option4, q.option5].filter(o => o && o !== '—');
        const optsHtml = opts.map((opt, i) => { const isC = (i + 1) === parseInt(correctAns); const isUW = String(userAns) === String(i + 1) && !isC; return `<li class="option-item ${isC ? 'correct' : isUW ? 'wrong' : ''}"><span class="option-key">${optBn[i]}</span>${escHtml(opt)} ${isC ? '✅' : ''} ${isUW ? '❌' : ''}</li>`; }).join('');
        return `<div class="question-card"><span class="q-status ${status}">${status === 'correct' ? '✅ সঠিক' : status === 'wrong' ? '❌ ভুল' : '⏭️ স্কিপ'}</span>${q.image_url ? `<img class="question-img" src="${escHtml(q.image_url)}" loading="lazy">` : ''}<div class="question-text" style="font-size:12px;">${escHtml(q.question_text || q.question || '')}</div><ul class="options-list">${optsHtml}</ul>${q.explanation ? `<div class="explanation-box">💡 ${escHtml(q.explanation)}</div>` : ''}<div class="btn-row" style="margin-top:6px;"><button class="btn btn-outline" onclick="bookmarkFromResult('${q.id}')" style="font-size:9px;">🔖 বুকমার্ক</button><button class="btn btn-outline" onclick="reportQuestion('${q.id}')" style="font-size:9px;">🚩 রিপোর্ট</button><button class="ai-explain-btn" onclick="loadAiExplainInline(this,'${escHtml((q.question_text||q.question||'').substring(0,120))}')">🤖 AI ব্যাখ্যা</button><div class="ai-explain-result" style="display:none;"></div></div></div>`;
    }).join('');
}

function bookmarkFromResult(qId) { const q = resultOverlayAllData.find(r => String(r.q.id) === String(qId)); if (!q) return; const saved = localStorage.getItem('bookmarks_' + currentUser.phone); const bookmarks = saved ? JSON.parse(saved) : {}; bookmarks[qId] = { question: q.q, exam_name: practiceTitle, bookmarked_at: new Date().toISOString() }; localStorage.setItem('bookmarks_' + currentUser.phone, JSON.stringify(bookmarks)); showToast('🔖 বুকমার্ক সেভ হয়েছে'); }

async function reportQuestion(qId) { showToast('🚩 রিপোর্ট করা হচ্ছে...'); try { await safeFetch(`${SUPABASE_URL}/rest/v1/reports`, { method: 'POST', body: JSON.stringify({ phone: currentUser.phone, question_id: qId, exam_name: practiceTitle, reported_at: new Date().toISOString() }) }); showToast('✅ রিপোর্ট সাবমিট হয়েছে'); } catch (e) { showToast('❌ রিপোর্ট করা যায়নি'); } }

async function loadAiExplainInline(btn, qText) { btn.style.display = 'none'; const div = btn.nextElementSibling; div.style.display = 'block'; div.innerHTML = '<div style="font-size:10px;color:var(--text2);padding:4px;">🤖 লোড হচ্ছে...</div>'; const GROQ_KEY = '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'; try { const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 500, messages: [{ role: 'system', content: 'বাংলায় সহজ ভাষায় MCQ ব্যাখ্যা করো।' }, { role: 'user', content: `এই প্রশ্নটি ব্যাখ্যা করো: "${qText}"` }] }) }); const data = await res.json(); div.innerHTML = `<div class="explanation-box" style="background:rgba(124,131,255,0.08);border-color:var(--accent);">🤖 <b>AI:</b> ${(data.choices?.[0]?.message?.content || 'ব্যাখ্যা পাওয়া যায়নি').replace(/\n/g, '<br>')}</div>`; } catch (e) { div.innerHTML = '<div class="explanation-box" style="color:var(--red);">❌ লোড করা যায়নি</div>'; } }

function filterResultOverlay(filter, btn) { document.querySelectorAll('#resultFilterTabs .q-filter-tab').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); const el = document.getElementById('resultReviewList'); const summaryHtml = el.querySelector('.card-item')?.outerHTML || ''; el.innerHTML = summaryHtml + buildResultReviewHtml(resultOverlayAllData, filter); }
function closeResultOverlay() { document.getElementById('resultOverlay').classList.remove('active'); }
function retryFromResult() { closeResultOverlay(); if (practiceRetryFn) practiceRetryFn(); }

async function retakeExam(examId) {
    showToast('⏳ এক্সাম লোড হচ্ছে...');
    try {
        const [examData] = await safeFetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${examId}&select=*`);
        const questions = await safeFetch(`${SUPABASE_URL}/rest/v1/questions?exam_id=eq.${examId}&select=*&order=id.asc`);
        if (!questions?.length) { showToast('❌ প্রশ্ন পাওয়া যায়নি'); return; }
        const formatted = questions.map(q => ({ id: q.id, question_text: q.question_text || q.question || '', option1: q.option1 || '', option2: q.option2 || '', option3: q.option3 || '', option4: q.option4 || '', option5: q.option5 || null, answer_index: q.answer_index || 1, explanation: q.explanation || '', image_url: q.image_url || null }));
        document.getElementById('detailModal').classList.remove('active');
        startPracticeExam(formatted, '🔄 ' + (examData?.title || (examData?.subject + ' - ' + examData?.chapter) || 'এক্সাম'), () => retakeExam(examId));
    } catch (e) { showToast('❌ লোড করতে সমস্যা'); }
}

// ======================================================
// BULK PRACTICE (from URL params)
// ======================================================
function startBulkPracticeFromParams(questions, title) { startPracticeExam(questions, title, () => startBulkPracticeFromParams(questions, title)); }

// ======================================================
// GRAPH
// ======================================================
function buildExamGraph(results) {
    const card = document.getElementById('examGraphCard'); if (!results?.length) { card.style.display = 'none'; return; }
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last15 = results.filter(r => new Date(r.submitted_at) >= fifteenDaysAgo).slice(0, 15).reverse();
    const thisWeek = results.filter(r => new Date(r.submitted_at) >= oneWeekAgo).length;
    const scores = results.map(r => (parseFloat(r.final_score) || 0) / (r.total_questions || 50) * 100);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length, best = Math.max(...scores);
    document.getElementById('gAvg').textContent = avg.toFixed(0) + '%'; document.getElementById('gBest').textContent = best.toFixed(0) + '%';
    document.getElementById('gTotal').textContent = toBanglaNum(results.length); document.getElementById('gWeek').textContent = toBanglaNum(thisWeek);
    document.getElementById('examGraphBadge').textContent = `শেষ ${toBanglaNum(last15.length)} দিন`;
    document.getElementById('examBarChart').innerHTML = last15.map(r => { const pct = (parseFloat(r.final_score) || 0) / (r.total_questions || 50) * 100; const h = Math.max(4, (pct / 100) * 100), cls = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low'; const d = new Date(r.submitted_at), label = (d.getMonth() + 1) + '/' + d.getDate(); return `<div class="bar-wrap"><div style="flex:1;display:flex;align-items:flex-end;width:100%;"><div class="bar ${cls}" style="height:${h}%" data-score="${pct.toFixed(0)}%"></div></div><div class="bar-label">${label}</div></div>`; }).join('');
    card.style.display = 'block';
}

// ======================================================
// INIT
// ======================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    const savedTheme = localStorage.getItem('atlas-theme');
    if (savedTheme === 'light') { isDarkMode = false; document.body.classList.add('light-mode'); document.getElementById('themeBtn').textContent = '☀️'; }
    await loadHistory();
    const hash = (location.hash || '').replace('#', '');
    if (hash.startsWith('practice&data=')) {
        try { const d = JSON.parse(decodeURIComponent(hash.replace('practice&data=', ''))); startPracticeExam(d.questions, d.title, () => startPracticeExam(d.questions, d.title, () => { })); } catch (e) { showToast('❌ ডাটা লোড করা যায়নি'); }
    } else if (hash.startsWith('result&data=')) {
        try { const d = JSON.parse(decodeURIComponent(hash.replace('result&data=', ''))); showResultScreen(d.score, d.total, d.correct, d.wrong, d.skipped, d.pct, d.title, d.reviewData, d.negMark, d.gpaScore, d.withGpa, d.isSecondTimer, d.timerDeduction); } catch (e) { showToast('❌ রেজাল্ট লোড করা যায়নি'); }
    } else if (hash.startsWith('mistakeDetail&data=')) {
        try { const d = JSON.parse(decodeURIComponent(hash.replace('mistakeDetail&data=', ''))); startPracticeExam(d.questions, d.title, () => { }); } catch (e) { showToast('❌ মিস্টেক ডাটা লোড করা যায়নি'); }
    }
    if ('Notification' in window && Notification.permission === 'default') 
   // ✅ ফাইলের শেষ লাইন হবে:
if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});

// ❌ এরপর আর কিছু থাকবে না!