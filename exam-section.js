// ============================================================
// exam-section.js — ATLAS Free Exam Section
// Handles: top-level category nav, sub-category routing,
//          chapter/board/year hierarchy, exam card listing
// ============================================================

import { supabase } from './supabase.js';
import { initExam } from './exam.js';
import { requireLogin } from './auth.js';

// ─── Entry Point ──────────────────────────────────────────────
export function initExamSection() {
  renderCategoryMenu();
}

// ─── Top-Level Category Menu ──────────────────────────────────
function renderCategoryMenu() {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" onclick="window.history.back()">← ফিরে যান</button>
        <h2 class="page-title">🎯 ফ্রি এক্সাম সেকশন</h2>
      </div>
      <div class="category-grid">
        ${renderCategoryCard('board', '📋', 'বোর্ড প্রস্তুতি', 'Board Preparation')}
        ${renderCategoryCard('medical', '🏥', 'মেডিকেল প্রস্তুতি', 'Medical Preparation')}
        ${renderCategoryCard('varsity', '🎓', 'ভার্সিটি প্রস্তুতি', 'University Preparation')}
        ${renderCategoryCard('practice', '📝', 'অনুশীলনী এক্সাম', 'Practice Exam')}
        ${renderCategoryCard('mock', '⚡', 'Unlimited Mock Test', 'Random Questions')}
      </div>
    </div>
  `;
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => showSubCategory(card.dataset.cat));
  });
}

function renderCategoryCard(cat, icon, title, subtitle) {
  return `
    <div class="category-card" data-cat="${cat}">
      <div class="cat-icon">${icon}</div>
      <div class="cat-title">${title}</div>
      <div class="cat-subtitle">${subtitle}</div>
      <div class="cat-arrow">→</div>
    </div>
  `;
}

// ─── Sub-Category Menus ───────────────────────────────────────
function showSubCategory(cat) {
  const container = document.getElementById('app');

  const subMenus = {
    board: [
      { key: 'board_board', label: 'বোর্ড প্রশ্ন এক্সাম' },
      { key: 'board_college', label: 'কলেজ প্রশ্ন এক্সাম' },
      { key: 'board_ka', label: 'ক ভান্ডার' },
      { key: 'board_kha', label: 'খ ভান্ডার' },
      { key: 'board_cq', label: 'টাইপভিত্তিক CQ' },
    ],
    medical: [
      { key: 'medical_demo', label: 'মেডিকেল স্ট্যান্ডার্ড Demo এক্সাম' },
      { key: 'medical_prev_chap', label: 'বিগত প্রশ্ন (সাবজেক্ট ও চাপ্টারভিত্তিক)' },
      { key: 'medical_prev_year', label: 'বিগত প্রশ্ন (সাবজেক্ট ও সালওয়াইজ)' },
    ],
    varsity: [
      { key: 'varsity_wise', label: 'Varsitywise Exam' },
      { key: 'varsity_year', label: 'বিগত প্রশ্ন (সাবজেক্ট ও সালওয়াইজ)' },
      { key: 'varsity_chap', label: 'বিগত প্রশ্ন (সাবজেক্ট ও চাপ্টারভিত্তিক)' },
    ],
    practice: [
      { key: 'practice_onushiloni', label: 'অনুশীলনী এক্সাম → Subject → Chapter → Writer' },
    ],
    mock: [
      { key: 'mock_test', label: 'Unlimited Mock Test' },
    ],
  };

  const items = subMenus[cat] || [];
  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">${categoryTitle(cat)}</h2>
      </div>
      <div class="sub-category-list">
        ${items.map(item => `
          <div class="sub-cat-item" data-key="${item.key}">
            <span class="sub-cat-label">${item.label}</span>
            <span class="sub-cat-arrow">›</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', renderCategoryMenu);
  document.querySelectorAll('.sub-cat-item').forEach(el => {
    el.addEventListener('click', () => routeSubCategory(el.dataset.key));
  });
}

// ─── Routing per SubCategory ──────────────────────────────────
function routeSubCategory(key) {
  if (key === 'mock_test') { showMockTestSetup(); return; }

  // Board sub-cats have chapter + optional year/board
  const chapterThenYear = ['board_board', 'board_college', 'board_ka', 'board_kha', 'board_cq',
                            'medical_prev_year', 'varsity_year', 'varsity_chap',
                            'medical_prev_chap', 'medical_demo'];
  const varsityFirst = ['varsity_wise'];
  const writerPath = ['practice_onushiloni'];

  if (varsityFirst.includes(key)) { showVarsityList(key); return; }
  if (writerPath.includes(key)) { showSubjectList(key, 'writer'); return; }
  showSubjectList(key);
}

// ─── Subject List ─────────────────────────────────────────────
async function showSubjectList(key, extraParam) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('সাবজেক্ট লোড হচ্ছে...');

  const { data: subjects, error } = await supabase
    .from('exams')
    .select('subject')
    .eq('sub_category', key)
    .order('subject');

  if (error) { container.innerHTML = errorHTML(); return; }
  const unique = [...new Set(subjects.map(e => e.subject))];

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">সাবজেক্ট বেছে নিন</h2>
      </div>
      <div class="list-grid">
        ${unique.map(s => `
          <div class="list-item" data-val="${s}">${s}</div>
        `).join('')}
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => routeSubCategory(key));
  document.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => showChapterList(key, el.dataset.val, extraParam));
  });
}

// ─── Chapter List ─────────────────────────────────────────────
async function showChapterList(key, subject, extraParam) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('চাপ্টার লোড হচ্ছে...');

  const { data, error } = await supabase
    .from('exams')
    .select('chapter')
    .eq('sub_category', key)
    .eq('subject', subject);

  if (error) { container.innerHTML = errorHTML(); return; }
  const unique = [...new Set(data.map(e => e.chapter))];

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">${subject} — চাপ্টার</h2>
      </div>
      <div class="list-grid">
        ${unique.map(c => `<div class="list-item" data-val="${c}">${c}</div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => showSubjectList(key, extraParam));
  document.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => {
      if (extraParam === 'writer') {
        showWriterList(key, subject, el.dataset.val);
      } else if (['board_board', 'board_college', 'medical_prev_year', 'varsity_year'].includes(key)) {
        showYearOrBoardOptions(key, subject, el.dataset.val);
      } else {
        showExamList(key, subject, el.dataset.val);
      }
    });
  });
}

// ─── Year / Board Options ─────────────────────────────────────
function showYearOrBoardOptions(key, subject, chapter) {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">${chapter}</h2>
      </div>
      <div class="two-option-row">
        <div class="option-card" id="optChapBased">
          <div class="opt-icon">📂</div>
          <div class="opt-label">চাপ্টারভিত্তিক</div>
        </div>
        <div class="option-card" id="optYearBased">
          <div class="opt-icon">📅</div>
          <div class="opt-label">সালভিত্তিক</div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => showChapterList(key, subject));
  document.getElementById('optChapBased').addEventListener('click', () => showExamList(key, subject, chapter));
  document.getElementById('optYearBased').addEventListener('click', () => showBoardList(key, subject, chapter));
}

// ─── Board List (for board exams) ────────────────────────────
async function showBoardList(key, subject, chapter) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('বোর্ড লোড হচ্ছে...');

  const { data, error } = await supabase
    .from('exams')
    .select('board_name')
    .eq('sub_category', key).eq('subject', subject).eq('chapter', chapter)
    .not('board_name', 'is', null);

  if (error) { container.innerHTML = errorHTML(); return; }
  const unique = [...new Set(data.map(e => e.board_name).filter(Boolean))];

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">বোর্ড বেছে নিন</h2>
      </div>
      <div class="list-grid">
        ${unique.map(b => `<div class="list-item" data-val="${b}">${b}</div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => showYearOrBoardOptions(key, subject, chapter));
  document.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => showYearList(key, subject, chapter, el.dataset.val));
  });
}

// ─── Year List ────────────────────────────────────────────────
async function showYearList(key, subject, chapter, board) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('সাল লোড হচ্ছে...');

  let query = supabase.from('exams').select('exam_year')
    .eq('sub_category', key).eq('subject', subject).eq('chapter', chapter);
  if (board) query = query.eq('board_name', board);

  const { data, error } = await query;
  if (error) { container.innerHTML = errorHTML(); return; }
  const unique = [...new Set(data.map(e => e.exam_year).filter(Boolean))].sort().reverse();

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">${board || chapter} — সাল</h2>
      </div>
      <div class="list-grid">
        ${unique.map(y => `<div class="list-item" data-val="${y}">${y}</div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => showBoardList(key, subject, chapter));
  document.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => showExamList(key, subject, chapter, board, el.dataset.val));
  });
}

// ─── Varsity List ─────────────────────────────────────────────
async function showVarsityList(key) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('ভার্সিটি লোড হচ্ছে...');

  const { data, error } = await supabase.from('exams').select('varsity_name').eq('sub_category', key);
  if (error) { container.innerHTML = errorHTML(); return; }
  const unique = [...new Set(data.map(e => e.varsity_name).filter(Boolean))];

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">ভার্সিটি বেছে নিন</h2>
      </div>
      <div class="list-grid">
        ${unique.map(v => `<div class="list-item" data-val="${v}">${v}</div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => showSubCategory('varsity'));
  document.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => showYearList(key, null, null, el.dataset.val));
  });
}

// ─── Writer List (Onushiloni) ─────────────────────────────────
async function showWriterList(key, subject, chapter) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('লেখক লোড হচ্ছে...');

  const { data, error } = await supabase.from('exams').select('writer')
    .eq('sub_category', key).eq('subject', subject).eq('chapter', chapter);
  if (error) { container.innerHTML = errorHTML(); return; }
  const unique = [...new Set(data.map(e => e.writer).filter(Boolean))];

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" id="backBtn">← ফিরে যান</button>
        <h2 class="page-title">লেখক বেছে নিন</h2>
      </div>
      <div class="list-grid">
        ${unique.map(w => `<div class="list-item" data-val="${w}">${w}</div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => showChapterList(key, subject, 'writer'));
  document.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => showExamList(key, subject, chapter, null, null, el.dataset.val));
  });
}

// ─── Exam List (Final step — show exam cards) ─────────────────
async function showExamList(key, subject, chapter, board, year, writer) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('এক্সাম লোড হচ্ছে...');

  let query = supabase.from('exams').select('*').eq('sub_category', key);
  if (subject) query = query.eq('subject', subject);
  if (chapter) query = query.eq('chapter', chapter);
  if (board)   query = query.eq('board_name', board);
  if (year)    query = query.eq('exam_year', year);
  if (writer)  query = query.eq('writer', writer);
  query = query.order('created_at', { ascending: false });

  const { data: exams, error } = await query;
  if (error) { container.innerHTML = errorHTML(); return; }

  if (!exams.length) {
    container.innerHTML = `
      <div class="section-page">
        <div class="page-header"><button class="btn-back" onclick="window.history.back()">← ফিরে যান</button></div>
        <p class="empty-msg">এখানে কোনো এক্সাম নেই।</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-page">
      <div class="page-header">
        <button class="btn-back" onclick="window.history.back()">← ফিরে যান</button>
        <h2 class="page-title">${chapter || subject || 'এক্সাম তালিকা'}</h2>
      </div>
      <div class="exam-card-list">
        ${exams.map(ex => renderExamCard(ex)).join('')}
      </div>
    </div>
  `;

  document.querySelectorAll('.btn-start-exam-card').forEach(btn => {
    btn.addEventListener('click', () => {
      requireLogin(() => initExam(btn.dataset.id));
    });
  });

  document.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const link = `${window.location.origin}/exam.html?id=${btn.dataset.id}`;
      navigator.clipboard.writeText(link);
      btn.textContent = '✅ কপি হয়েছে';
      setTimeout(() => { btn.textContent = '🔗 লিংক কপি'; }, 2000);
    });
  });
}

function renderExamCard(ex) {
  const start = new Date(ex.start_time);
  const end   = new Date(ex.end_time);
  const now   = new Date();
  const live  = now >= start && now <= end;

  return `
    <div class="exam-card ${live ? 'live' : ''}">
      ${live ? '<span class="live-badge">🔴 Live</span>' : ''}
      <div class="ec-title">${ex.title}</div>
      <div class="ec-meta">
        <span>⏱ ${ex.duration_minutes} মিনিট</span>
        <span>❓ ${ex.total_questions || '?'} প্রশ্ন</span>
        <span>📅 ${start.toLocaleDateString('bn-BD')}</span>
      </div>
      <div class="ec-actions">
        <button class="btn-start-exam-card" data-id="${ex.id}">শুরু করুন →</button>
        <button class="btn-copy-link" data-id="${ex.id}">🔗 লিংক কপি</button>
      </div>
    </div>
  `;
}

// ─── Mock Test Setup ──────────────────────────────────────────
async function showMockTestSetup() {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('সাবজেক্ট লোড হচ্ছে...');

  const { data, error } = await supabase.from('mock_questions').select('subject, chapter').order('subject');
  if (error) { container.innerHTML = errorHTML(); return; }

  const subjects = [...new Set(data.map(d => d.subject))];
  let selectedSubject = null, selectedChapter = null, selectedStandard = null, selectedCount = 25;

  function render() {
    container.innerHTML = `
      <div class="section-page">
        <div class="page-header">
          <button class="btn-back" id="mockBack">← ফিরে যান</button>
          <h2 class="page-title">⚡ Unlimited Mock Test</h2>
        </div>
        <div class="mock-setup-form">
          <label class="form-label">সাবজেক্ট</label>
          <select class="form-select" id="mockSubject">
            <option value="">বেছে নিন</option>
            ${subjects.map(s => `<option ${selectedSubject===s?'selected':''}>${s}</option>`).join('')}
          </select>

          <label class="form-label">চাপ্টার</label>
          <select class="form-select" id="mockChapter" ${!selectedSubject?'disabled':''}>
            <option value="">বেছে নিন</option>
            ${selectedSubject ? [...new Set(data.filter(d=>d.subject===selectedSubject).map(d=>d.chapter))]
                .map(c => `<option ${selectedChapter===c?'selected':''}>${c}</option>`).join('') : ''}
          </select>

          <label class="form-label">স্ট্যান্ডার্ড</label>
          <div class="standard-pills">
            ${['Medical Standard','Varsity Standard','Onushiloni Exam'].map(s=>`
              <button class="pill-btn ${selectedStandard===s?'active':''}" data-std="${s}">${s}</button>
            `).join('')}
          </div>

          <label class="form-label">প্রশ্ন সংখ্যা</label>
          <div class="count-pills">
            ${[20,25,35,50].map(n=>`
              <button class="pill-btn ${selectedCount===n?'active':''}" data-count="${n}">${n}</button>
            `).join('')}
          </div>

          <button class="btn-start-mock" id="btnStartMock" ${!selectedSubject||!selectedChapter||!selectedStandard?'disabled':''}>
            Mock Test শুরু করুন ⚡
          </button>
        </div>
      </div>
    `;

    document.getElementById('mockBack').addEventListener('click', renderCategoryMenu);

    document.getElementById('mockSubject').addEventListener('change', e => {
      selectedSubject = e.target.value || null;
      selectedChapter = null;
      render();
    });

    document.getElementById('mockChapter').addEventListener('change', e => {
      selectedChapter = e.target.value || null;
      render();
    });

    document.querySelectorAll('.pill-btn[data-std]').forEach(btn => {
      btn.addEventListener('click', () => { selectedStandard = btn.dataset.std; render(); });
    });

    document.querySelectorAll('.pill-btn[data-count]').forEach(btn => {
      btn.addEventListener('click', () => { selectedCount = parseInt(btn.dataset.count); render(); });
    });

    const startBtn = document.getElementById('btnStartMock');
    if (startBtn && !startBtn.disabled) {
      startBtn.addEventListener('click', () => startMockTest(selectedSubject, selectedChapter, selectedStandard, selectedCount));
    }
  }

  render();
}

async function startMockTest(subject, chapter, standard, count) {
  const container = document.getElementById('app');
  container.innerHTML = loadingHTML('প্রশ্ন তৈরি হচ্ছে...');

  const { data, error } = await supabase
    .from('mock_questions')
    .select('*')
    .eq('subject', subject)
    .eq('chapter', chapter)
    .eq('standard', standard);

  if (error || !data.length) {
    container.innerHTML = `<p class="error-msg">পর্যাপ্ত প্রশ্ন নেই।</p>`;
    return;
  }

  // Random shuffle + pick count
  const shuffled = data.sort(() => Math.random() - 0.5).slice(0, Math.min(count, data.length));

  // Build a fake exam object
  const mockExam = {
    id: 'mock-' + Date.now(),
    title: `Mock Test — ${chapter}`,
    subject, chapter,
    duration_minutes: Math.ceil(count * 1.2),
    total_marks: count,
    marks_per_question: 1,
    negative_marks: 0.25,
    questions: shuffled.map((q, i) => ({ ...q, order_index: i })),
    is_mock: true
  };

  // Import exam dynamically to avoid circular dep
  const { initExam } = await import('./exam.js');
  // Override: pass mock exam data directly
  window.__mockExam = mockExam;
  initExam(null, mockExam);
}

// ─── Helpers ──────────────────────────────────────────────────
function loadingHTML(msg) {
  return `<div class="loader-wrap"><div class="loader"></div><p>${msg}</p></div>`;
}
function errorHTML() {
  return `<p class="error-msg">ডেটা লোড করতে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।</p>`;
}
function categoryTitle(cat) {
  const t = { board:'বোর্ড প্রস্তুতি', medical:'মেডিকেল প্রস্তুতি', varsity:'ভার্সিটি প্রস্তুতি', practice:'অনুশীলনী এক্সাম', mock:'Mock Test' };
  return t[cat] || cat;
}
