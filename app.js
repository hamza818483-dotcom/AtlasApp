/* ══════════════════════════════════════════════ 
   CORE APP — Navigation, Theme, Countdown, Toast 
══════════════════════════════════════════════ */ 

// ── Page History Stack ── 
let pageHistory = []; 
let currentPage = 'page-home'; 

function navigateTo(pageId) { 
    if (pageId === currentPage) return; 
    pageHistory.push(currentPage); 
    showPage(pageId); 
} 

function goBack() { 
    if (pageHistory.length > 0) { 
        showPage(pageHistory.pop()); 
    } else { 
        showPage('page-home'); 
    } 
} 

function showPage(pageId) { 
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); 
    const el = document.getElementById(pageId); 
    if (el) { 
        el.classList.add('active'); 
        currentPage = pageId; 
        window.scrollTo(0, 0); 
        updateBottomNav(pageId); 
        
        // Trigger page-specific loads 
        if (pageId === 'page-class') typeof loadClassSubjects === 'function' && loadClassSubjects(); 
        if (pageId === 'page-profile') {
            // 🟢 FIX: Try both loadProfileData and AtlasAuth.loadProfileData
            if (typeof loadProfileData === 'function') {
                loadProfileData(); 
            } else if (window.AtlasAuth && typeof window.AtlasAuth.loadProfileData === 'function') {
                window.AtlasAuth.loadProfileData();
            } else if (typeof window.loadProfileData === 'function') {
                window.loadProfileData();
            }
        }
        if (pageId === 'page-admin') {
            if (typeof loadAdminPanel === 'function') { 
                loadAdminPanel(); 
            }
            if (typeof window.initAdminPanel === 'function') { 
                window.initAdminPanel(); 
            }
        }
        if (pageId === 'page-mistakes') {
            if (typeof loadMistakes === 'function') { 
                loadMistakes(); 
            } else if (typeof window.loadMistakes === 'function') {
                window.loadMistakes();
            }
        }
        if (pageId === 'page-exam-mock') {
            if (typeof loadMockSubjects === 'function') { 
                loadMockSubjects(); 
            } else if (window.ExamModule && typeof window.ExamModule.loadMockSubjects === 'function') {
                window.ExamModule.loadMockSubjects();
            }
        }
    } 
} 

function updateBottomNav(pageId) { 
    document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active')); 
    if (['page-home','page-class'].includes(pageId)) document.getElementById('bnav-home')?.classList.add('active'); 
    else if (pageId.startsWith('page-exam')) document.getElementById('bnav-exam')?.classList.add('active'); 
    else if (pageId === 'page-ai') document.getElementById('bnav-ai')?.classList.add('active'); 
    else if (pageId === 'page-profile') document.getElementById('bnav-profile')?.classList.add('active'); 
} 

function bottomNav(tab) { 
    const map = { 
        home: 'page-home', 
        exam: 'page-exam', 
        ai: 'page-ai', 
        profile: 'page-profile' 
    }; 
    if (tab === 'profile') { 
        // 🟢 FIX: Use getCurrentUser instead of currentUser property
        const user = window.AtlasAuth?.getCurrentUser ? window.AtlasAuth.getCurrentUser() : null;
        if (!user) { 
            navigateTo('page-login'); 
            return; 
        } 
    } 
    pageHistory = []; 
    navigateTo(map[tab]); 
} 

// ── Nav Auth Button ── 
// 🟢 FIX: Use getCurrentUser instead of currentUser property
function handleNavAuth() { 
    const user = window.AtlasAuth?.getCurrentUser ? window.AtlasAuth.getCurrentUser() : null;
    if (user) navigateTo('page-profile'); 
    else navigateTo('page-login'); 
} 

// ── Theme Toggle ── 
const themeToggle = document.getElementById('themeToggle'); 
if (themeToggle) {
    themeToggle.addEventListener('click', () => { 
        const html = document.documentElement; 
        const newTheme = html.dataset.theme === 'dark' ? 'light' : 'dark'; 
        html.dataset.theme = newTheme; 
        localStorage.setItem('atlas-theme', newTheme); 
    }); 
}

(function applyStoredTheme() { 
    const t = localStorage.getItem('atlas-theme'); 
    if (t) document.documentElement.dataset.theme = t; 
})(); 

// ── Toast Notifications ── 
function showToast(msg, type = 'success') { 
    const container = document.getElementById('toast-container'); 
    if (!container) {
        alert(msg);
        return;
    }
    const toast = document.createElement('div'); 
    toast.className = `toast ${type}`; 
    toast.textContent = msg; 
    container.appendChild(toast); 
    setTimeout(() => toast.remove(), 3200); 
} 
window.showToast = showToast; 

// ── Countdown Timer ── 
let countdownTarget = null; 
let countdownInterval = null;

function initCountdown() { 
    // Default target: can be overridden by admin via Supabase 
    countdownTarget = new Date('2025-12-01T09:00:00'); // 🟢 FIX: Changed to valid future date
    tickCountdown(); 
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(tickCountdown, 1000); 
} 

function tickCountdown() { 
    if (!countdownTarget) return; 
    const now = new Date(); 
    const diff = countdownTarget - now; 
    
    const daysEl = document.getElementById('cd-days');
    const hoursEl = document.getElementById('cd-hours');
    const minsEl = document.getElementById('cd-mins');
    const secsEl = document.getElementById('cd-secs');
    
    if (!daysEl) return; // Not on home page
    
    if (diff <= 0) { 
        daysEl.textContent = '00'; 
        hoursEl.textContent = '00'; 
        minsEl.textContent = '00'; 
        secsEl.textContent = '00'; 
        return; 
    } 
    
    const days = Math.floor(diff / 86400000); 
    const hours = Math.floor((diff % 86400000) / 3600000); 
    const mins = Math.floor((diff % 3600000) / 60000); 
    const secs = Math.floor((diff % 60000) / 1000); 
    
    daysEl.textContent = String(days).padStart(2,'0'); 
    hoursEl.textContent = String(hours).padStart(2,'0'); 
    minsEl.textContent = String(mins).padStart(2,'0'); 
    secsEl.textContent = String(secs).padStart(2,'0'); 
} 

// ── Mock Test Helpers ── 
let mockStandard = null; 
let mockCount = null; 

function selectMockStandard(el, val) { 
    document.querySelectorAll('#page-exam-mock .radio-opt').forEach(e => { 
        if (['medical','varsity','onushiloni'].some(s => e.getAttribute('onclick')?.includes(s))) e.classList.remove('selected'); 
    }); 
    el.classList.add('selected'); 
    mockStandard = val; 
} 

function selectMockCount(el, val) { 
    const radioGroup = el.closest('.radio-group');
    if (radioGroup) {
        radioGroup.querySelectorAll('.radio-opt').forEach(e => e.classList.remove('selected')); 
    }
    el.classList.add('selected'); 
    mockCount = val; 
} 

function startMockTest() { 
    if (!mockStandard || !mockCount) { 
        showToast('Standard ও প্রশ্নসংখ্যা বেছে নিন', 'error'); 
        return; 
    } 
    if (window.ExamModule && typeof window.ExamModule.startMock === 'function') {
        window.ExamModule.startMock(mockStandard, mockCount); 
    } else {
        showToast('Mock Test ফিচার লোড হচ্ছে...', 'info');
    }
} 

// ── Profile Tabs ── 
function switchProfileTab(btn, tabId) { 
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active')); 
    btn.classList.add('active'); 
    const tabs = ['tab-performance','tab-exam-history','tab-class-history','tab-bookmarks'];
    tabs.forEach(id => { 
        const el = document.getElementById(id);
        if (el) el.style.display = id === tabId ? 'block' : 'none'; 
    }); 
    
    // 🟢 FIX: Load tab content when switched
    if (tabId === 'tab-exam-history' && typeof loadExamHistory === 'function') {
        loadExamHistory();
    } else if (tabId === 'tab-class-history' && typeof loadClassHistory === 'function') {
        loadClassHistory();
    } else if (tabId === 'tab-bookmarks' && typeof loadBookmarks === 'function') {
        loadBookmarks();
    } else if (tabId === 'tab-performance' && typeof loadPerformance === 'function') {
        loadPerformance();
    }
} 

// ── Timer Selection (Register) ── 
let selectedTimer = null; 
function selectTimer(val) { 
    selectedTimer = val; 
    const firstEl = document.getElementById('timer-first');
    const secondEl = document.getElementById('timer-second');
    if (firstEl) firstEl.classList.toggle('selected', val === 'first'); 
    if (secondEl) secondEl.classList.toggle('selected', val === 'second'); 
} 

// ── Avatar Upload ── 
function triggerAvatarUpload() { 
    const input = document.getElementById('avatar-file-input');
    if (input) input.click(); 
} 

function handleAvatarUpload(e) { 
    const file = e.target.files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = ev => { 
        const img = document.getElementById('profile-avatar-img'); 
        const placeholder = document.getElementById('profile-avatar-placeholder');
        if (img) {
            img.src = ev.target.result; 
            img.style.display = 'block'; 
        }
        if (placeholder) placeholder.style.display = 'none'; 
    }; 
    reader.readAsDataURL(file); 
} 

// ── Exam category router ── 
function loadExamList(category, subtype) { 
    if (window.ExamModule && typeof window.ExamModule.loadCategory === 'function') {
        window.ExamModule.loadCategory(category, subtype); 
    }
} 

function loadMockSubjects() { 
    if (window.ExamModule && typeof window.ExamModule.loadMockSubjects === 'function') {
        window.ExamModule.loadMockSubjects(); 
    }
} 

// ── AI send (fallback if ai.js not ready) ── 
function sendAIMessage() { 
    if (window.AtlasAI && typeof window.AtlasAI.send === 'function') { 
        window.AtlasAI.send(); 
        return; 
    } 
    const input = document.getElementById('ai-input'); 
    const msg = input?.value?.trim(); 
    if (!msg) return; 
    
    const box = document.getElementById('ai-chat-box'); 
    if (!box) return;
    
    const userDiv = document.createElement('div'); 
    userDiv.style.cssText = 'align-self:flex-end;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-sm);padding:10px 14px;font-size:0.88rem;max-width:85%;'; 
    userDiv.textContent = msg; 
    box.appendChild(userDiv); 
    
    if (input) input.value = ''; 
    box.scrollTop = box.scrollHeight; 
    
    // 🟢 ADDED: Simple echo response (will be replaced by Gemini later)
    setTimeout(() => {
        const aiDiv = document.createElement('div'); 
        aiDiv.style.cssText = 'align-self:flex-start;background:var(--card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;font-size:0.88rem;max-width:85%;'; 
        aiDiv.textContent = `আপনার প্রশ্ন: "${msg}" - ATLAS AI শীঘ্রই আসছে!`; 
        box.appendChild(aiDiv); 
        box.scrollTop = box.scrollHeight; 
    }, 500);
} 

// ── Bootstrap ── 
window.addEventListener('load', () => { 
    // Hide loading screen after 1.8s 
    setTimeout(() => { 
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.classList.add('hidden'); 
    }, 1900); 
    
    initCountdown(); 
    
    // Auth will update nav button text 
    if (window.AtlasAuth && typeof window.AtlasAuth.init === 'function') { 
        window.AtlasAuth.init(); 
    }
    
    // 🟢 ADDED: Update UI after auth loads
    setTimeout(() => {
        if (window.AtlasAuth && typeof window.AtlasAuth.updateUI === 'function') {
            window.AtlasAuth.updateUI();
        }
    }, 100);
});

// 🟢 ADDED: Export functions to window for global access
window.navigateTo = navigateTo;
window.goBack = goBack;
window.bottomNav = bottomNav;
window.handleNavAuth = handleNavAuth;
window.showToast = showToast;
window.selectMockStandard = selectMockStandard;
window.selectMockCount = selectMockCount;
window.startMockTest = startMockTest;
window.switchProfileTab = switchProfileTab;
window.selectTimer = selectTimer;
window.triggerAvatarUpload = triggerAvatarUpload;
window.handleAvatarUpload = handleAvatarUpload;
window.loadExamList = loadExamList;
window.loadMockSubjects = loadMockSubjects;
window.sendAIMessage = sendAIMessage;