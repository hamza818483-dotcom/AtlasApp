// ============================================================
// exam.js — ATLAS Exam Engine
// Handles: load exam, render questions, timer, lock answers,
//          auto-submit, submit button, save attempt to DB
// ============================================================

import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { showResult } from './result.js';

let examData = null;         // { exam meta + questions[] }
let userAnswers = {};        // { questionIndex: optionNumber }
let timerInterval = null;
let examStartTime = null;
let totalSeconds = 0;

// ─── Entry Point ─────────────────────────────────────────────
export async function initExam(examId) {
  const container = document.getElementById('app');
  container.innerHTML = `<div class="loader-wrap"><div class="loader"></div><p>এক্সাম লোড হচ্ছে...</p></div>`;

  const { data: exam, error } = await supabase
    .from('exams')
    .select('*, questions(*)')
    .eq('id', examId)
    .single();

  if (error || !exam) {
    container.innerHTML = `<p class="error-msg">এক্সাম লোড করা যায়নি। পুনরায় চেষ্টা করুন।</p>`;
    return;
  }

  examData = exam;
  examData.questions.sort((a, b) => a.order_index - b.order_index);

  showPreExamScreen(exam);
}

// ─── Pre-Exam Info Screen ─────────────────────────────────────
function showPreExamScreen(exam) {
  const user = getCurrentUser();
  const container = document.getElementById('app');

  const now = new Date();
  const start = new Date(exam.start_time);
  const end = new Date(exam.end_time);
  const duration = exam.duration_minutes;

  container.innerHTML = `
    <div class="pre-exam-wrap">
      <div class="pre-exam-card">
        <div class="pre-exam-badge">${exam.exam_type_label || 'MCQ Exam'}</div>
        <h1 class="pre-exam-title">${exam.title}</h1>
        <div class="pre-exam-meta">
          <div class="meta-item"><span class="meta-icon">📚</span><span>${exam.subject}</span></div>
          <div class="meta-item"><span class="meta-icon">📖</span><span>${exam.chapter}</span></div>
          <div class="meta-item"><span class="meta-icon">❓</span><span>${examData.questions.length} টি প্রশ্ন</span></div>
          <div class="meta-item"><span class="meta-icon">⏱</span><span>${duration} মিনিট</span></div>
          <div class="meta-item"><span class="meta-icon">📅</span><span>${formatDate(start)} – ${formatDate(end)}</span></div>
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

  document.getElementById('btnStartExam').addEventListener('click', () => {
    startExam(duration);
  });
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
      <!-- Sticky Header -->
      <div class="exam-header sticky-header">
        <div class="exam-header-title">${examData.title}</div>
        <div class="exam-timer" id="examTimer">00:00</div>
      </div>

      <div class="exam-body">
        <!-- Questions Column -->
        <div class="exam-questions-col" id="questionsCol">
          ${questions.map((q, i) => renderQuestion(q, i)).join('')}
        </div>

        <!-- Nav Sidebar -->
        <div class="exam-nav-sidebar">
          <div class="nav-title">প্রশ্ন নং</div>
          <div class="nav-grid" id="navGrid">
            ${questions.map((_, i) => `
              <button class="nav-box" id="nav-${i}" onclick="scrollToQuestion(${i})">${i + 1}</button>
            `).join('')}
          </div>
          <div class="nav-legend">
            <span class="legend-dot answered"></span> উত্তর দেওয়া
            <span class="legend-dot unanswered"></span> বাকি
          </div>
        </div>
      </div>

      <!-- Fixed Submit Button -->
      <div class="exam-submit-bar">
        <button class="btn-submit-exam" id="btnSubmitExam">
          ✅ সাবমিট করুন
        </button>
      </div>
    </div>
  `;

  // Expose scroll helper globally
  window.scrollToQuestion = (index) => {
    const el = document.getElementById(`question-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  document.getElementById('btnSubmitExam').addEventListener('click', () => {
    confirmAndSubmit();
  });

  attachOptionListeners();
}

// ─── Render Single Question Card ──────────────────────────────
function renderQuestion(q, index) {
  const options = [q.option1, q.option2, q.option3, q.option4, q.option5].filter(Boolean);
  return `
    <div class="question-card" id="question-${index}">
      <div class="q-number-row">
        <span class="q-number">${index + 1}</span>
        <button class="btn-bookmark" data-qid="${q.id}" title="বুকমার্ক করুন">🔖</button>
      </div>
      <div class="q-text">${q.question}</div>
      <div class="q-options" id="options-${index}">
        ${options.map((opt, oi) => `
          <button
            class="option-btn"
            data-qindex="${index}"
            data-optindex="${oi + 1}"
            id="opt-${index}-${oi + 1}"
          >
            <span class="opt-label">${String.fromCharCode(64 + oi + 1)}</span>
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

      // Already answered → locked, ignore
      if (userAnswers[qi] !== undefined) return;

      // Save answer
      userAnswers[qi] = oi;

      // Style: select this option
      const optionsWrap = document.getElementById(`options-${qi}`);
      optionsWrap.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected', 'locked');

      // Show lock icon
      document.getElementById(`lock-${qi}-${oi}`).classList.remove('hidden');

      // Update nav box
      const navBox = document.getElementById(`nav-${qi}`);
      if (navBox) navBox.classList.add('answered');

      // Bookmark listener (must be attached per card after render)
    });
  });

  // Bookmark buttons
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
    // Warning at 60s
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
  const banner = document.createElement('div');
  banner.className = 'auto-submit-banner';
  banner.textContent = '⏰ সময় শেষ! স্বয়ংক্রিয়ভাবে সাবমিট হচ্ছে...';
  container.prepend(banner);
  setTimeout(submitExam, 1500);
}

async function submitExam() {
  clearInterval(timerInterval);
  const user = getCurrentUser();
  const questions = examData.questions;

  // Build results
  const resultMap = buildResultMap(questions);

  // Save to DB if logged in
  if (user) {
    await saveAttemptToDb(user.id, resultMap);
  }

  showResult({
    exam: examData,
    questions,
    userAnswers,
    resultMap,
    user
  });
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

  const { error } = await supabase.from('exam_attempts').insert(attemptData);
  if (error) console.error('Attempt save error:', error.message);
}

// ─── Bookmark ─────────────────────────────────────────────────
async function toggleBookmark(questionId, btn) {
  const user = getCurrentUser();
  if (!user) { alert('বুকমার্ক করতে লগইন করুন।'); return; }

  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .single();

  if (existing) {
    await supabase.from('bookmarks').delete().eq('id', existing.id);
    btn.classList.remove('bookmarked');
    btn.title = 'বুকমার্ক করুন';
  } else {
    await supabase.from('bookmarks').insert({ user_id: user.id, question_id: questionId });
    btn.classList.add('bookmarked');
    btn.title = 'বুকমার্ক সরান';
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(d) {
  return d.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
}

export function getExamData() { return examData; }
export function getUserAnswers() { return userAnswers; }