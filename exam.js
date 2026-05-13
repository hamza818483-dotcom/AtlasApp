// ============================================================
// exam.js — ATLAS Exam Engine
// Handles: load exam, render questions, timer, lock answers,
//          auto-submit, submit button, save attempt to DB
// ============================================================

import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { showResult } from './result.js';

// 🟢 FIX: Add _supabase alias
const _supabase = supabase;

let examData = null;         // { exam meta + questions[] }
let userAnswers = {};        // { questionIndex: optionNumber }
let timerInterval = null;
let examStartTime = null;
let totalSeconds = 0;

// ─── Entry Point ─────────────────────────────────────────────
export async function initExam(examId, mockExamData = null) {
  const container = document.getElementById('app');
  if (!container) return;
  
  container.innerHTML = `<div class="loader-wrap"><div class="loader"></div><p>এক্সাম লোড হচ্ছে...</p></div>`;

  // 🟢 FIX: Handle mock exam data
  if (mockExamData) {
    examData = mockExamData;
    examData.questions = examData.questions || [];
    if (examData.questions.length === 0) {
      container.innerHTML = `<p class="error-msg">মক টেস্টের জন্য কোন প্রশ্ন নেই!</p>`;
      return;
    }
    showPreExamScreen(examData);
    return;
  }

  // 🟢 FIX: Properly fetch exam with questions from questions_data or separate table
  const { data: exam, error } = await _supabase
    .from('exams')
    .select('*')
    .eq('id', examId)
    .single();

  if (error || !exam) {
    container.innerHTML = `<p class="error-msg">এক্সাম লোড করা যায়নি। পুনরায় চেষ্টা করুন।</p>`;
    return;
  }

  // 🟢 FIX: Get questions from questions_data JSONB or fetch from questions table
  let questions = [];
  if (exam.questions_data && Array.isArray(exam.questions_data)) {
    questions = exam.questions_data;
  } else {
    // Try to fetch from questions table
    const { data: qData, qError } = await _supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('order_index', { ascending: true });
    
    if (!qError && qData) {
      questions = qData;
    }
  }

  examData = exam;
  examData.questions = questions;
  
  if (examData.questions.length === 0) {
    container.innerHTML = `<p class="error-msg">এই এক্সামে কোন প্রশ্ন নেই!</p>`;
    return;
  }

  showPreExamScreen(examData);
}

// ─── Pre-Exam Info Screen ─────────────────────────────────────
function showPreExamScreen(exam) {
  const user = getCurrentUser();
  const container = document.getElementById('app');

  const start = exam.start_time ? new Date(exam.start_time) : new Date();
  const end = exam.end_time ? new Date(exam.end_time) : new Date();
  const duration = exam.duration_minutes || Math.ceil((exam.questions?.length || 0) * 1.2);

  container.innerHTML = `
    <div class="pre-exam-wrap">
      <div class="pre-exam-card">
        <div class="pre-exam-badge">${exam.exam_type || 'MCQ Exam'}</div>
        <h1 class="pre-exam-title">${exam.title || `${exam.subject} - ${exam.chapter}`}</h1>
        <div class="pre-exam-meta">
          <div class="meta-item"><span class="meta-icon">📚</span><span>${exam.subject || '—'}</span></div>
          <div class="meta-item"><span class="meta-icon">📖</span><span>${exam.chapter || '—'}</span></div>
          <div class="meta-item"><span class="meta-icon">❓</span><span>${exam.questions?.length || 0} টি প্রশ্ন</span></div>
          <div class="meta-item"><span class="meta-icon">⏱</span><span>${duration} মিনিট</span></div>
          ${exam.start_time ? `<div class="meta-item"><span class="meta-icon">📅</span><span>${formatDate(start)} – ${formatDate(end)}</span></div>` : ''}
          ${exam.negative_marks ? `<div class="meta-item"><span class="meta-icon">➖</span><span>নেগেটিভ মার্কিং: ${exam.negative_marks} প্রতি ভুলে</span></div>` : ''}
        </div>
        <div class="pre-exam-rules">
          <h3>📋 নিয়মাবলী</h3>
          <ul>
            <li>একবার অপশন সিলেক্ট করলে পরিবর্তন করা যাবে না।</li>
            <li>সময় শেষ হলে স্বয়ংক্রিয়ভাবে সাবমিট হয়ে যাবে।</li>
            <li>সাবমিট করার পর রেজাল্ট তাৎক্ষণিক দেখা যাবে।</li>
            ${exam.negative_marks ? '<li>প্রতিটি ভুল উত্তরে নেগেটিভ মার্কিং প্রযোজ্য।</li>' : ''}
          </ul>
        </div>
        ${user
          ? `<p class="pre-exam-user">পরীক্ষার্থী: <strong>${user.name}</strong></p>`
          : `<p class="pre-exam-guest">⚠️ গেস্ট মোডে পরীক্ষা দিচ্ছেন — ফলাফল প্রোফাইলে সেভ হবে না।</p>`
        }
        <button class="btn-start-exam" id="btnStartExam">
          পরীক্ষা শুরু করুন <span>→</span>
        </button>
      </div>
    </div>
  `;

  const startBtn = document.getElementById('btnStartExam');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startExam(duration);
    });
  }
}

// ─── Start Exam ───────────────────────────────────────────────
function startExam(durationMinutes) {
  examStartTime = new Date();
  totalSeconds = durationMinutes * 60;
  userAnswers = {};
  renderExamHall();
  startTimer();
}

// ─── Render Exam Hall ─────────────────────────────────────────
function renderExamHall() {
  const container = document.getElementById('app');
  const questions = examData.questions;

  container.innerHTML = `
    <div class="exam-hall">
      <div class="exam-header sticky-header">
        <div class="exam-header-title">${examData.title || 'Exam'}</div>
        <div class="exam-timer" id="examTimer">00:00</div>
      </div>

      <div class="exam-body">
        <div class="exam-questions-col" id="questionsCol">
          ${questions.map((q, i) => renderQuestion(q, i)).join('')}
        </div>

        <div class="exam-nav-sidebar">
          <div class="nav-title">প্রশ্ন নং</div>
          <div class="nav-grid" id="navGrid">
            ${questions.map((_, i) => `
              <button class="nav-box" id="nav-${i}" data-qidx="${i}">${i + 1}</button>
            `).join('')}
          </div>
          <div class="nav-legend">
            <span class="legend-dot answered"></span> উত্তর দেওয়া
            <span class="legend-dot unanswered"></span> বাকি
          </div>
        </div>
      </div>

      <div class="exam-submit-bar">
        <button class="btn-submit-exam" id="btnSubmitExam">
          ✅ সাবমিট করুন
        </button>
      </div>
    </div>
  `;

  // Attach navigation click handlers
  document.querySelectorAll('.nav-box').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.qidx);
      const el = document.getElementById(`question-${idx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  const submitBtn = document.getElementById('btnSubmitExam');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      confirmAndSubmit();
    });
  }

  attachOptionListeners();
}

// ─── Render Single Question Card ──────────────────────────────
function renderQuestion(q, index) {
  // 🟢 FIX: Support both column naming (option1 vs option1 from CSV)
  const options = [
    q.option1 || q.options?.[0],
    q.option2 || q.options?.[1],
    q.option3 || q.options?.[2],
    q.option4 || q.options?.[3],
    q.option5 || q.options?.[4]
  ].filter(Boolean);
  
  const questionText = q.question_text || q.question || 'প্রশ্ন';
  
  return `
    <div class="question-card" id="question-${index}">
      <div class="q-number-row">
        <span class="q-number">${index + 1}</span>
        <button class="btn-bookmark" data-qid="${q.id || index}" title="বুকমার্ক করুন">🔖</button>
      </div>
      <div class="q-text">${questionText}</div>
      <div class="q-options" id="options-${index}">
        ${options.map((opt, oi) => `
          <button
            class="option-btn"
            data-qindex="${index}"
            data-optindex="${oi + 1}"
            id="opt-${index}-${oi + 1}"
          >
            <span class="opt-label">${String.fromCharCode(65 + oi)}</span>
            <span class="opt-text">${opt}</span>
            <span class="lock-icon hidden" id="lock-${index}-${oi + 1}">🔒</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Attach Option Click Listeners ───────────────────────────
function attachOptionListeners() {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = parseInt(btn.dataset.qindex);
      const oi = parseInt(btn.dataset.optindex);

      if (userAnswers[qi] !== undefined) return;

      userAnswers[qi] = oi;

      const optionsWrap = document.getElementById(`options-${qi}`);
      if (optionsWrap) {
        optionsWrap.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      }
      btn.classList.add('selected', 'locked');

      const lockIcon = document.getElementById(`lock-${qi}-${oi}`);
      if (lockIcon) lockIcon.classList.remove('hidden');

      const navBox = document.getElementById(`nav-${qi}`);
      if (navBox) navBox.classList.add('answered');
    });
  });

  document.querySelectorAll('.btn-bookmark').forEach(btn => {
    btn.addEventListener('click', () => toggleBookmark(btn.dataset.qid, btn));
  });
}

// ─── Timer ────────────────────────────────────────────────────
function startTimer() {
  let remaining = totalSeconds;
  updateTimerDisplay(remaining);

  timerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(remaining);
    if (remaining <= 0) {
      clearInterval(timerInterval);
      autoSubmit();
    }
    if (remaining === 60) {
      document.getElementById('examTimer')?.classList.add('timer-warning');
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const el = document.getElementById('examTimer');
  if (!el) return;
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

// ─── Submit Logic ─────────────────────────────────────────────
function confirmAndSubmit() {
  const total = examData.questions.length;
  const answered = Object.keys(userAnswers).length;
  const skipped = total - answered;

  if (skipped > 0) {
    const ok = confirm(`⚠️ আপনি ${skipped}টি প্রশ্ন এড়িয়ে গেছেন। তারপরও সাবমিট করবেন?`);
    if (!ok) return;
  }
  submitExam();
}

function autoSubmit() {
  const container = document.getElementById('app');
  if (!container) return;
  const banner = document.createElement('div');
  banner.className = 'auto-submit-banner';
  banner.textContent = '⏰ সময় শেষ! স্বয়ংক্রিয়ভাবে সাবমিট হচ্ছে...';
  container.prepend(banner);
  setTimeout(submitExam, 1500);
}

async function submitExam() {
  if (timerInterval) clearInterval(timerInterval);
  const user = getCurrentUser();
  const questions = examData.questions;

  const resultMap = buildResultMap(questions);

  if (user && !examData.is_mock) {
    await saveAttemptToDb(user.id, resultMap);
  }

  // 🟢 FIX: Call showResult properly
  if (typeof showResult === 'function') {
    showResult({
      exam: examData,
      questions,
      userAnswers,
      resultMap,
      user
    });
  } else {
    console.error('showResult function not found');
    alert('রেজাল্ট দেখাতে সমস্যা হয়েছে।');
  }
}

// ─── Build Result Map ─────────────────────────────────────────
function buildResultMap(questions) {
  let correct = 0, wrong = 0, skipped = 0;
  const perQuestion = [];

  questions.forEach((q, i) => {
    const selected = userAnswers[i];
    const correctAns = parseInt(q.answer);
    let status = 'skipped';

    if (selected === undefined || selected === null) {
      status = 'skipped';
      skipped++;
    } else if (selected === correctAns) {
      status = 'correct';
      correct++;
    } else {
      status = 'wrong';
      wrong++;
    }

    perQuestion.push({
      question: q,
      selected: selected || null,
      correctAnswer: correctAns,
      status
    });
  });

  const negativeMark = parseFloat(examData.negative_marks || 0);
  const marksPerCorrect = parseFloat(examData.marks_per_question || 1);
  const totalMarks = examData.total_marks || questions.length;

  const rawScore = (correct * marksPerCorrect) - (wrong * negativeMark);
  const finalScore = Math.max(0, rawScore);

  return {
    correct, wrong, skipped,
    rawScore, finalScore,
    totalMarks, marksPerCorrect, negativeMark,
    perQuestion
  };
}

// ─── Save Attempt to Supabase ─────────────────────────────────
async function saveAttemptToDb(userId, resultMap) {
  const attemptData = {
    user_id: userId,
    exam_id: examData.id,
    correct: resultMap.correct,
    wrong: resultMap.wrong,
    skipped: resultMap.skipped,
    score: resultMap.finalScore,
    total_marks: resultMap.totalMarks,
    answers: userAnswers,
    taken_at: new Date().toISOString()
  };

  const { error } = await _supabase.from('exam_attempts').insert(attemptData);
  if (error) console.error('Attempt save error:', error.message);
}

// ─── Bookmark ─────────────────────────────────────────────────
async function toggleBookmark(questionId, btn) {
  const user = getCurrentUser();
  if (!user) { 
    alert('বুকমার্ক করতে লগইন করুন।'); 
    return; 
  }

  const { data: existing } = await _supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', questionId.toString())
    .maybeSingle();

  if (existing) {
    await _supabase.from('bookmarks').delete().eq('id', existing.id);
    btn.classList.remove('bookmarked');
    btn.title = 'বুকমার্ক করুন';
  } else {
    await _supabase.from('bookmarks').insert({ user_id: user.id, question_id: questionId.toString() });
    btn.classList.add('bookmarked');
    btn.title = 'বুকমার্ক সরান';
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(d) {
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
}

export function getExamData() { return examData; }
export function getUserAnswers() { return userAnswers; }

// ============================================================
// 🟥 GLOBAL EXPOSURE FOR APP.JS INTEGRATION 🟥
// ============================================================
window.ExamModule = {
    loadCategory: async function(category, subtype) {
        console.log(`Loading category: ${category}, Subtype: ${subtype}`);
        const container = document.getElementById(`page-exam-${category}`);
        if(container) {
            container.innerHTML = `<div style="padding: 20px; text-align: center;">এক্সাম লোড হচ্ছে ${category}...</div>`;
        }
        if (typeof showToast === 'function') {
            showToast(`এক্সাম সেকশন লোড হচ্ছে...`, 'info');
        }
    },
    
    startMock: async function(standard, count) {
        console.log(`Starting mock test for standard: ${standard}, count: ${count}`);
        if (typeof showToast === 'function') {
            showToast(`Mock Test প্রস্তুত করা হচ্ছে... (${standard} - ${count}টি প্রশ্ন)`, 'success');
        }
        
        // 🟢 FIX: Better mock implementation
        try {
            const { data: questions, error } = await _supabase
                .from('mock_questions')
                .select('*')
                .eq('standard', standard)
                .limit(100);
            
            if (error || !questions || questions.length === 0) {
                showToast(`মক টেস্টের জন্য ${standard} স্ট্যান্ডার্ডের কোন প্রশ্ন নেই!`, 'error');
                return;
            }
            
            const shuffled = questions.sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, Math.min(count, questions.length));
            
            const mockExam = {
                id: 'mock-' + Date.now(),
                title: `Mock Test - ${standard}`,
                subject: selected[0]?.subject || 'General',
                chapter: selected[0]?.chapter || 'Mixed',
                duration_minutes: Math.ceil(count * 1.2),
                total_marks: count,
                marks_per_question: 1,
                negative_marks: 0.25,
                questions: selected,
                is_mock: true
            };
            
            await initExam(null, mockExam);
        } catch (err) {
            console.error('Mock test error:', err);
            showToast('মক টেস্ট শুরু করতে সমস্যা হয়েছে', 'error');
        }
    },
    
    loadMockSubjects: async function() {
        console.log('Loading mock subjects');
        const { data } = await _supabase
            .from('mock_questions')
            .select('subject')
            .limit(100);
        
        if (data && data.length > 0) {
            const subjects = [...new Set(data.map(d => d.subject))];
            const container = document.getElementById('page-exam-mock');
            if (container) {
                // Update UI with subjects
                console.log('Available subjects:', subjects);
            }
        }
    }
};