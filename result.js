// ============================================================
// result.js — ATLAS Result Page
// Handles: score display, GPA calc, 2nd timer deduction,
//          pie chart, question filters, solve sheet, PDF download
// ============================================================

import { getCurrentUser } from './auth.js';
import { supabase } from './supabase.js';
import { generateResultPDF } from './result-pdf.js';

// ─── Entry Point ──────────────────────────────────────────────
export function showResult({ exam, questions, userAnswers, resultMap, user }) {
  const container = document.getElementById('app');

  // GPA & 2nd Timer Deductions
  const deductions = calculateDeductions(resultMap, user, exam);
  const finalWithoutGPA = Math.max(0, resultMap.finalScore - deductions.secondTimerDeduction);
  const gpaScore = user ? calculateGpaScore(user) : 0;
  const finalWithGPA = finalWithoutGPA + gpaScore;

  const percent = Math.round((finalWithoutGPA / resultMap.totalMarks) * 100);

  container.innerHTML = `
    <div class="result-page">
      <!-- Header -->
      <div class="result-header">
        <button class="btn-back-home" onclick="window.location.href='index.html'">← হোম</button>
        <h2 class="result-title">📊 পরীক্ষার ফলাফল</h2>
        <div class="result-exam-name">${exam.title}</div>
      </div>

      <!-- Score Summary Row -->
      <div class="score-summary-row">
        <div class="score-card correct-card">
          <div class="score-num">${resultMap.correct}</div>
          <div class="score-label">✅ সঠিক</div>
        </div>
        <div class="score-card wrong-card">
          <div class="score-num">${resultMap.wrong}</div>
          <div class="score-label">❌ ভুল</div>
        </div>
        <div class="score-card skipped-card">
          <div class="score-num">${resultMap.skipped}</div>
          <div class="score-label">⏭ এড়ানো</div>
        </div>
        <div class="score-card negative-card">
          <div class="score-num">-${(resultMap.wrong * resultMap.negativeMark).toFixed(2)}</div>
          <div class="score-label">➖ নেগেটিভ</div>
        </div>
      </div>

      <!-- Final Score Boxes -->
      <div class="final-score-section">
        <div class="final-box without-gpa">
          <div class="final-box-label">GPA ছাড়া</div>
          <div class="final-score-anim" id="scoreWithout">
            <span class="big-score">${finalWithoutGPA.toFixed(2)}</span>
            <span class="out-of">/ ${resultMap.totalMarks}</span>
          </div>
          <div class="score-bar-wrap">
            <div class="score-bar" style="width: ${Math.min(percent, 100)}%"></div>
          </div>
          <div class="score-percent">${percent}%</div>
          ${deductions.secondTimerDeduction > 0
            ? `<div class="deduction-note">২য় টাইমার কাটা: -${deductions.secondTimerDeduction}</div>`
            : ''}
        </div>

        ${user ? `
        <div class="final-box with-gpa">
          <div class="final-box-label">GPA সহ</div>
          <div class="final-score-anim" id="scoreWith">
            <span class="big-score">${finalWithGPA.toFixed(2)}</span>
            <span class="out-of">/ ${resultMap.totalMarks + 100}</span>
          </div>
          <div class="gpa-breakdown">
            <div>SSC GPA: ${user.ssc_gpa} × 8 = <strong>${(parseFloat(user.ssc_gpa) * 8).toFixed(2)}</strong></div>
            <div>HSC GPA: ${user.hsc_gpa} × 12 = <strong>${(parseFloat(user.hsc_gpa) * 12).toFixed(2)}</strong></div>
            <div>GPA মোট: <strong>${gpaScore.toFixed(2)}</strong> / 100</div>
          </div>
        </div>` : ''}
      </div>

      <!-- Chart -->
      <div class="chart-section">
        <canvas id="resultPieChart" width="260" height="260"></canvas>
        <div class="chart-legend">
          <div><span class="legend-dot correct-dot"></span> সঠিক (${resultMap.correct})</div>
          <div><span class="legend-dot wrong-dot"></span> ভুল (${resultMap.wrong})</div>
          <div><span class="legend-dot skip-dot"></span> এড়ানো (${resultMap.skipped})</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="result-actions">
        <button class="btn-result-action" id="btnRetake">🔁 আবার দিন</button>
        <button class="btn-result-action primary" id="btnDownloadPdf">⬇ PDF ডাউনলোড</button>
      </div>

      <!-- Filter Buttons -->
      <div class="solve-filter-row">
        <button class="filter-btn active" data-filter="all">সব (${questions.length})</button>
        <button class="filter-btn" data-filter="correct">সঠিক (${resultMap.correct})</button>
        <button class="filter-btn" data-filter="wrong">ভুল (${resultMap.wrong})</button>
        <button class="filter-btn" data-filter="skipped">এড়ানো (${resultMap.skipped})</button>
      </div>

      <!-- Solve Sheet -->
      <div class="solve-sheet" id="solveSheet">
        ${renderSolveSheet(resultMap.perQuestion, 'all')}
      </div>
    </div>
  `;

  // Draw pie chart
  drawPieChart(resultMap);

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('solveSheet').innerHTML =
        renderSolveSheet(resultMap.perQuestion, btn.dataset.filter);
    });
  });

  // PDF
  document.getElementById('btnDownloadPdf').addEventListener('click', () => {
    generateResultPDF({ exam, resultMap, finalWithoutGPA, finalWithGPA, gpaScore, user });
  });

  // Retake
  document.getElementById('btnRetake').addEventListener('click', () => {
    window.location.reload();
  });

  // Animate score counters
  animateScore('scoreWithout', 0, finalWithoutGPA);
  if (user) animateScore('scoreWith', 0, finalWithGPA);
}

// ─── Solve Sheet Renderer ─────────────────────────────────────
function renderSolveSheet(perQuestion, filter) {
  const filtered = filter === 'all'
    ? perQuestion
    : perQuestion.filter(q => q.status === filter);

  if (!filtered.length) return `<p class="no-q-msg">এই ক্যাটাগরিতে কোনো প্রশ্ন নেই।</p>`;

  return filtered.map((item, idx) => {
    const opts = [
      item.question.option1, item.question.option2,
      item.question.option3, item.question.option4, item.question.option5
    ].filter(Boolean);

    return `
      <div class="solve-card ${item.status}">
        <div class="solve-q-num">${idx + 1}. <span class="solve-status-badge ${item.status}">${statusLabel(item.status)}</span></div>
        <div class="solve-q-text">${item.question.question}</div>
        <div class="solve-options">
          ${opts.map((opt, oi) => {
            const optNum = oi + 1;
            let cls = 'solve-opt';
            if (optNum === item.correctAnswer) cls += ' correct-opt';
            if (optNum === item.selected && item.selected !== item.correctAnswer) cls += ' wrong-opt';
            return `
              <div class="${cls}">
                <span class="solve-opt-label">${String.fromCharCode(64 + optNum)}</span>
                ${opt}
                ${optNum === item.correctAnswer ? '<span class="correct-tick">✓</span>' : ''}
                ${optNum === item.selected && item.selected !== item.correctAnswer ? '<span class="wrong-cross">✗</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
        ${item.question.explanation ? `
          <div class="solve-explanation">
            <strong>💡 ব্যাখ্যা:</strong> ${item.question.explanation}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ─── Deduction Logic ──────────────────────────────────────────
function calculateDeductions(resultMap, user, exam) {
  let secondTimerDeduction = 0;
  // UPDATE: Changed timer_type to timer_status matching database column
  if (user && user.timer_status === 'second') {
    secondTimerDeduction = resultMap.totalMarks <= 50 ? 1.5 : 5;
  }
  return { secondTimerDeduction };
}

// ─── GPA Score (max 100) ──────────────────────────────────────
function calculateGpaScore(user) {
  const ssc = Math.min(parseFloat(user.ssc_gpa || 0), 5.00);
  const hsc = Math.min(parseFloat(user.hsc_gpa || 0), 5.00);
  return (ssc * 8) + (hsc * 12);
}

// ─── Pie Chart ────────────────────────────────────────────────
function drawPieChart(resultMap) {
  const canvas = document.getElementById('resultPieChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const total = resultMap.correct + resultMap.wrong + resultMap.skipped;
  if (total === 0) return;

  const slices = [
    { value: resultMap.correct, color: '#22C55E' },
    { value: resultMap.wrong, color: '#EF4444' },
    { value: resultMap.skipped, color: '#94A3B8' }
  ];

  let startAngle = -Math.PI / 2;
  const cx = 130, cy = 130, r = 110;

  slices.forEach(slice => {
    const angle = (slice.value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    startAngle += angle;
  });

  // Inner circle (donut)
  ctx.beginPath();
  ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || '#1C1C1E';
  ctx.fill();

  // Center text
  ctx.fillStyle = '#F0F0F0';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pct = Math.round((resultMap.correct / total) * 100);
  ctx.fillText(`${pct}%`, cx, cy);
}

// ─── Animate Score Counter ────────────────────────────────────
function animateScore(elementId, from, to) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const scoreEl = el.querySelector('.big-score');
  if (!scoreEl) return;

  const duration = 1200;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + (to - from) * eased;
    scoreEl.textContent = current.toFixed(2);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ─── Helpers ──────────────────────────────────────────────────
function statusLabel(status) {
  return status === 'correct' ? '✅ সঠিক' : status === 'wrong' ? '❌ ভুল' : '⏭ এড়ানো';
}

export { calculateDeductions, calculateGpaScore };
