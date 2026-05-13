// ============================================================
// profile.js — ATLAS EXAM APP
// Handles: Profile page display, tab switching, exam/class history
// Uses: window._supabase (set by supabase.js)
// ============================================================

// ── Tab Switching ─────────────────────────────────────────────
window.switchProfileTab = function (btn, tabId) {
  document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const tabs = ['tab-performance', 'tab-exam-history', 'tab-class-history', 'tab-bookmarks'];
  tabs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === tabId) ? 'block' : 'none';
  });

  // Load data for the tab
  if (tabId === 'tab-exam-history') loadExamHistory();
  if (tabId === 'tab-class-history') loadClassHistory();
  if (tabId === 'tab-bookmarks') loadBookmarks();
  if (tabId === 'tab-performance') loadPerformance();
};

// ── Load Profile Data (called when profile page opens) ────────
window.loadProfilePage = function () {
  const user = window.AtlasAuth?.getCurrentUser?.() ||
    (() => { try { return JSON.parse(localStorage.getItem('atlas_user')); } catch { return null; } })();

  if (!user) return;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };

  set('p-display-name', user.name);
  set('p-phone',        user.phone);
  // Show password in profile (as per spec)
  set('p-pass',         user.password || '(সংরক্ষিত)');
  set('p-batch',        user.hsc_batch);
  set('p-college',      user.college);
  set('p-ssc',          user.ssc_gpa != null ? user.ssc_gpa.toFixed(2) : '—');
  set('p-hsc',          user.hsc_gpa != null ? user.hsc_gpa.toFixed(2) : '—');
  set('p-timer',        user.timer_status);

  // Avatar
  const img = document.getElementById('profile-avatar-img');
  const ph  = document.getElementById('profile-avatar-placeholder');
  if (user.avatar_url && img && ph) {
    img.src           = user.avatar_url;
    img.style.display = 'block';
    ph.style.display  = 'none';
  } else if (img && ph) {
    img.style.display = 'none';
    ph.style.display  = 'block';
  }

  // Load default tab
  loadPerformance();
};

// ── Performance Report ────────────────────────────────────────
async function loadPerformance() {
  const container = document.getElementById('tab-performance');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) {
    container.innerHTML = '<p class="text-muted text-center" style="padding:30px 0;">Login করুন।</p>';
    return;
  }

  container.innerHTML = '<p class="text-muted text-center" style="padding:20px">লোড হচ্ছে...</p>';

  const { data: history } = await window._supabase
    .from('exam_results')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!history || history.length === 0) {
    container.innerHTML = '<p class="text-muted text-center" style="padding:30px 0;">এখনো কোনো এক্সাম দেওয়া হয়নি।</p>';
    return;
  }

  const totalExams   = history.length;
  const avgScore     = (history.reduce((s, r) => s + (r.final_score || 0), 0) / totalExams).toFixed(1);
  const totalCorrect = history.reduce((s, r) => s + (r.correct || 0), 0);
  const totalWrong   = history.reduce((s, r) => s + (r.wrong || 0), 0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div class="stat-card" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:700;color:var(--accent);">${totalExams}</div>
        <div style="font-size:0.8rem;color:var(--muted);">মোট এক্সাম</div>
      </div>
      <div class="stat-card" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:700;color:#22C55E;">${avgScore}</div>
        <div style="font-size:0.8rem;color:var(--muted);">গড় স্কোর</div>
      </div>
      <div class="stat-card" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:700;color:#22C55E;">${totalCorrect}</div>
        <div style="font-size:0.8rem;color:var(--muted);">মোট সঠিক</div>
      </div>
      <div class="stat-card" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:700;color:#EF4444;">${totalWrong}</div>
        <div style="font-size:0.8rem;color:var(--muted);">মোট ভুল</div>
      </div>
    </div>
    <p style="font-size:0.82rem;color:var(--muted);text-align:center;">সর্বশেষ ${totalExams}টি এক্সামের পারফরম্যান্স</p>
  `;
}

// ── Exam History ──────────────────────────────────────────────
async function loadExamHistory() {
  const container = document.getElementById('exam-history-list');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) { container.innerHTML = '<p class="text-muted text-center">Login করুন।</p>'; return; }

  container.innerHTML = '<p class="text-muted text-center">লোড হচ্ছে...</p>';

  const { data: results } = await window._supabase
    .from('exam_results')
    .select('*, exams(title, subject, chapter)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (!results || results.length === 0) {
    container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">এখনো কোনো এক্সাম দেওয়া হয়নি।</p>';
    return;
  }

  container.innerHTML = results.map(r => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
      <div style="font-weight:600;font-size:0.92rem;">${r.exams?.title || 'Exam'}</div>
      <div style="font-size:0.78rem;color:var(--muted);margin:4px 0;">${r.exams?.subject || ''} • ${r.exams?.chapter || ''}</div>
      <div style="display:flex;gap:12px;font-size:0.82rem;margin-top:6px;">
        <span style="color:#22C55E;">✓ ${r.correct || 0} সঠিক</span>
        <span style="color:#EF4444;">✗ ${r.wrong || 0} ভুল</span>
        <span style="color:var(--muted);">— ${r.skipped || 0} Skip</span>
        <span style="font-weight:700;margin-left:auto;">স্কোর: ${r.final_score || 0}</span>
      </div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${new Date(r.created_at).toLocaleDateString('bn-BD')}</div>
    </div>
  `).join('');
}

// ── Class History ─────────────────────────────────────────────
async function loadClassHistory() {
  const container = document.getElementById('class-history-list');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) { container.innerHTML = '<p class="text-muted text-center">Login করুন।</p>'; return; }

  container.innerHTML = '<p class="text-muted text-center">লোড হচ্ছে...</p>';

  const { data: history } = await window._supabase
    .from('class_history')
    .select('*, classes(title, subject, chapter, part)')
    .eq('user_id', user.id)
    .order('watched_at', { ascending: false });

  if (!history || history.length === 0) {
    container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">এখনো কোনো ক্লাস দেখা হয়নি।</p>';
    return;
  }

  container.innerHTML = history.map(h => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
      <div style="font-weight:600;font-size:0.92rem;">${h.classes?.title || h.classes?.part || 'Class'}</div>
      <div style="font-size:0.78rem;color:var(--muted);">${h.classes?.subject || ''} • ${h.classes?.chapter || ''}</div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${new Date(h.watched_at).toLocaleDateString('bn-BD')}</div>
    </div>
  `).join('');
}

// ── Bookmarks ─────────────────────────────────────────────────
async function loadBookmarks() {
  const container = document.getElementById('bookmark-list');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) { container.innerHTML = '<p class="text-muted text-center">Login করুন।</p>'; return; }

  container.innerHTML = '<p class="text-muted text-center">লোড হচ্ছে...</p>';

  const { data: bookmarks } = await window._supabase
    .from('bookmarks')
    .select('*, questions(question_text, subject, chapter)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (!bookmarks || bookmarks.length === 0) {
    container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">কোনো বুকমার্ক নেই।</p>';
    return;
  }

  container.innerHTML = bookmarks.map(b => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
      <div style="font-size:0.88rem;">${b.questions?.question_text || 'প্রশ্ন'}</div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">
        ${b.questions?.subject || ''} • ${b.questions?.chapter || ''}
      </div>
    </div>
  `).join('');
}

// ── Auto-load profile when page becomes visible ───────────────
// This hooks into the navigateTo function from app.js
const _origNavigateTo = window.navigateTo;
window.navigateTo = function (pageId) {
  if (typeof _origNavigateTo === 'function') _origNavigateTo(pageId);
  if (pageId === 'page-profile') {
    setTimeout(window.loadProfilePage, 100);
  }
};

// Also load on bottom nav profile click
const _origBottomNav = window.bottomNav;
window.bottomNav = function (section) {
  if (typeof _origBottomNav === 'function') _origBottomNav(section);
  if (section === 'profile') {
    setTimeout(window.loadProfilePage, 100);
  }
};
