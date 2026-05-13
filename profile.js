// ============================================================
// profile.js — ATLAS EXAM APP
// Handles: Profile page display, tab switching, exam/class history
// Uses: window._supabase (set by supabase.js)
// ============================================================

// 🟢 FIX: Ensure _supabase is available
const _supabase = window._supabase || window.supabase;

// 🟢 FIX: Export functions to window for global access
window.loadExamHistory = loadExamHistory;
window.loadClassHistory = loadClassHistory;
window.loadBookmarks = loadBookmarks;
window.loadPerformance = loadPerformance;

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
  set('p-pass',         user.password || '(সংরক্ষিত)');
  set('p-batch',        user.hsc_batch);
  set('p-college',      user.college);
  set('p-ssc',          user.ssc_gpa != null ? parseFloat(user.ssc_gpa).toFixed(2) : '—');
  set('p-hsc',          user.hsc_gpa != null ? parseFloat(user.hsc_gpa).toFixed(2) : '—');
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

  // Load default tab - make sure tab-performance is visible
  const perfTab = document.getElementById('tab-performance');
  const examTab = document.getElementById('tab-exam-history');
  const classTab = document.getElementById('tab-class-history');
  const bookTab = document.getElementById('tab-bookmarks');
  
  if (perfTab) perfTab.style.display = 'block';
  if (examTab) examTab.style.display = 'none';
  if (classTab) classTab.style.display = 'none';
  if (bookTab) bookTab.style.display = 'none';
  
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

  try {
    const { data: history } = await _supabase
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
  } catch (err) {
    console.error('Error loading performance:', err);
    container.innerHTML = '<p class="text-muted text-center" style="padding:30px 0;">পারফরম্যান্স ডাটা লোড করতে সমস্যা হয়েছে।</p>';
  }
}

// ── Exam History ──────────────────────────────────────────────
async function loadExamHistory() {
  const container = document.getElementById('exam-history-list');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) { 
    container.innerHTML = '<p class="text-muted text-center">Login করুন।</p>'; 
    return; 
  }

  container.innerHTML = '<p class="text-muted text-center">লোড হচ্ছে...</p>';

  try {
    // 🟢 FIX: exam_results table doesn't have direct relation to exams
    // First get exam_results, then fetch exam details separately
    const { data: results, error } = await _supabase
      .from('exam_results')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!results || results.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">এখনো কোনো এক্সাম দেওয়া হয়নি।</p>';
      return;
    }

    // Fetch exam details for each result
    const examIds = [...new Set(results.map(r => r.exam_id).filter(Boolean))];
    let examsMap = {};
    
    if (examIds.length > 0) {
      const { data: exams } = await _supabase
        .from('exams')
        .select('id, title, subject, chapter')
        .in('id', examIds);
      
      if (exams) {
        examsMap = exams.reduce((map, exam) => {
          map[exam.id] = exam;
          return map;
        }, {});
      }
    }

    container.innerHTML = results.map(r => {
      const exam = examsMap[r.exam_id] || {};
      return `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
          <div style="font-weight:600;font-size:0.92rem;">${exam.title || 'Exam'}</div>
          <div style="font-size:0.78rem;color:var(--muted);margin:4px 0;">${exam.subject || ''} ${exam.chapter ? '• ' + exam.chapter : ''}</div>
          <div style="display:flex;gap:12px;font-size:0.82rem;margin-top:6px;">
            <span style="color:#22C55E;">✓ ${r.correct || 0} সঠিক</span>
            <span style="color:#EF4444;">✗ ${r.wrong || 0} ভুল</span>
            <span style="color:var(--muted);">— ${r.skipped || 0} Skip</span>
            <span style="font-weight:700;margin-left:auto;">স্কোর: ${r.final_score || 0}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${new Date(r.created_at).toLocaleDateString('bn-BD')}</div>
          <div style="display:flex;gap:10px;margin-top:10px;">
            <button class="btn-sm" onclick="alert('Retake exam feature coming soon')">🔄 পুনরায় দিন</button>
            <button class="btn-sm" onclick="alert('Details view coming soon')">📖 বিস্তারিত দেখো</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading exam history:', err);
    container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">এক্সাম ইতিহাস লোড করতে সমস্যা হয়েছে।</p>';
  }
}

// ── Class History ─────────────────────────────────────────────
async function loadClassHistory() {
  const container = document.getElementById('class-history-list');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) { 
    container.innerHTML = '<p class="text-muted text-center">Login করুন।</p>'; 
    return; 
  }

  container.innerHTML = '<p class="text-muted text-center">লোড হচ্ছে...</p>';

  try {
    const { data: history, error } = await _supabase
      .from('class_history')
      .select('*, classes(title, subject, chapter, part)')
      .eq('user_id', user.id)
      .order('watched_at', { ascending: false });

    if (error) throw error;

    if (!history || history.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">এখনো কোনো ক্লাস দেখা হয়নি।</p>';
      return;
    }

    container.innerHTML = history.map(h => `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
        <div style="font-weight:600;font-size:0.92rem;">${h.classes?.title || h.classes?.part || 'Class'}</div>
        <div style="font-size:0.78rem;color:var(--muted);">${h.classes?.subject || ''} • ${h.classes?.chapter || ''}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${new Date(h.watched_at).toLocaleDateString('bn-BD')}</div>
        <button class="btn-sm" style="margin-top:8px;" onclick="alert('Rewatch feature coming soon')">🎥 পুনরায় দেখুন</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading class history:', err);
    container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">ক্লাস ইতিহাস লোড করতে সমস্যা হয়েছে।</p>';
  }
}

// ── Bookmarks ─────────────────────────────────────────────────
async function loadBookmarks() {
  const container = document.getElementById('bookmark-list');
  if (!container) return;

  const user = window.AtlasAuth?.getCurrentUser?.();
  if (!user) { 
    container.innerHTML = '<p class="text-muted text-center">Login করুন।</p>'; 
    return; 
  }

  container.innerHTML = '<p class="text-muted text-center">লোড হচ্ছে...</p>';

  try {
    // 🟢 FIX: bookmarks table may not have direct relation to questions
    const { data: bookmarks, error } = await _supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookmarks || bookmarks.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">কোনো বুকমার্ক নেই।</p>';
      return;
    }

    container.innerHTML = bookmarks.map(b => `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
        <div style="font-size:0.88rem;">প্রশ্ন ID: ${b.question_id}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">
          বুকমার্ক করা হয়েছে: ${new Date(b.created_at).toLocaleDateString('bn-BD')}
        </div>
        <button class="btn-sm" style="margin-top:8px;" onclick="alert('View question feature coming soon')">🔍 প্রশ্ন দেখুন</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading bookmarks:', err);
    container.innerHTML = '<p class="text-muted text-center" style="padding:20px 0;">বুকমার্ক লোড করতে সমস্যা হয়েছে।</p>';
  }
}

// ── Auto-load profile when page becomes visible ───────────────
const _origNavigateTo = window.navigateTo;
window.navigateTo = function (pageId) {
  if (typeof _origNavigateTo === 'function') _origNavigateTo(pageId);
  if (pageId === 'page-profile') {
    setTimeout(window.loadProfilePage, 100);
  }
};

const _origBottomNav = window.bottomNav;
window.bottomNav = function (section) {
  if (typeof _origBottomNav === 'function') _origBottomNav(section);
  if (section === 'profile') {
    setTimeout(window.loadProfilePage, 100);
  }
};

// 🟢 ADDED: Initial load if profile page is active on page load
if (document.getElementById('page-profile')?.classList.contains('active')) {
  setTimeout(window.loadProfilePage, 200);
}