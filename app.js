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
        if (pageId === 'page-profile') typeof loadProfileData === 'function' && loadProfileData(); 
        if (pageId === 'page-admin') typeof loadAdminPanel === 'function' && loadAdminPanel(); 
        if (pageId === 'page-mistakes') typeof loadMistakes === 'function' && loadMistakes(); 
        if (pageId === 'page-exam-mock') typeof loadMockSubjects === 'function' && loadMockSubjects(); 
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
        const user = window.AtlasAuth?.currentUser; 
        if (!user) { 
            navigateTo('page-login'); 
            return; 
        } 
    } 
    pageHistory = []; 
    navigateTo(map[tab]); 
} 

// ── Nav Auth Button ── 
function handleNavAuth() { 
    const user = window.AtlasAuth?.currentUser; 
    if (user) navigateTo('page-profile'); 
    else navigateTo('page-login'); 
} 

// ── Theme Toggle ── 
const themeToggle = document.getElementById('themeToggle'); 
themeToggle.addEventListener('click', () => { 
    const html = document.documentElement; 
    const newTheme = html.dataset.theme === 'dark' ? 'light' : 'dark'; 
    html.dataset.theme = newTheme; 
    localStorage.setItem('atlas-theme', newTheme); 
}); 

(function applyStoredTheme() { 
    const t = localStorage.getItem('atlas-theme'); 
    if (t) document.documentElement.dataset.theme = t; 
})(); 

// ── Toast Notifications ── 
function showToast(msg, type = 'success') { 
    const container = document.getElementById('toast-container'); 
    const toast = document.createElement('div'); 
    toast.className = `toast ${type}`; 
    toast.textContent = msg; 
    container.appendChild(toast); 
    setTimeout(() => toast.remove(), 3200); 
} 
window.showToast = showToast; 

// ── Countdown Timer ── 
let countdownTarget = null; 
function initCountdown() { 
    // Default target: can be overridden by admin via Supabase 
    countdownTarget = new Date('2025-04-01T09:00:00'); 
    tickCountdown(); 
    setInterval(tickCountdown, 1000); 
} 

function tickCountdown() { 
    if (!countdownTarget) return; 
    const now = new Date(); 
    const diff = countdownTarget - now; 
    
    if (diff <= 0) { 
        document.getElementById('cd-days').textContent = '00'; 
        document.getElementById('cd-hours').textContent = '00'; 
        document.getElementById('cd-mins').textContent = '00'; 
        document.getElementById('cd-secs').textContent = '00'; 
        return; 
    } 
    
    const days = Math.floor(diff / 86400000); 
    const hours = Math.floor((diff % 86400000) / 3600000); 
    const mins = Math.floor((diff % 3600000) / 60000); 
    const secs = Math.floor((diff % 60000) / 1000); 
    
    document.getElementById('cd-days').textContent = String(days).padStart(2,'0'); 
    document.getElementById('cd-hours').textContent = String(hours).padStart(2,'0'); 
    document.getElementById('cd-mins').textContent = String(mins).padStart(2,'0'); 
    document.getElementById('cd-secs').textContent = String(secs).padStart(2,'0'); 
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
    el.closest('.radio-group').querySelectorAll('.radio-opt').forEach(e => e.classList.remove('selected')); 
    el.classList.add('selected'); 
    mockCount = val; 
} 

function startMockTest() { 
    if (!mockStandard || !mockCount) { 
        showToast('Standard ও প্রশ্নসংখ্যা বেছে নিন', 'error'); 
        return; 
    } 
    window.ExamModule?.startMock && window.ExamModule.startMock(mockStandard, mockCount); 
} 

// ── Profile Tabs ── 
function switchProfileTab(btn, tabId) { 
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active')); 
    btn.classList.add('active'); 
    ['tab-performance','tab-exam-history','tab-class-history','tab-bookmarks'].forEach(id => { 
        document.getElementById(id).style.display = id === tabId ? 'block' : 'none'; 
    }); 
} 

// ── Timer Selection (Register) ── 
let selectedTimer = null; 
function selectTimer(val) { 
    selectedTimer = val; 
    document.getElementById('timer-first').classList.toggle('selected', val === 'first'); 
    document.getElementById('timer-second').classList.toggle('selected', val === 'second'); 
} 

// ── Avatar Upload ── 
function triggerAvatarUpload() { 
    document.getElementById('avatar-file-input').click(); 
} 

function handleAvatarUpload(e) { 
    const file = e.target.files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = ev => { 
        const img = document.getElementById('profile-avatar-img'); 
        img.src = ev.target.result; 
        img.style.display = 'block'; 
        document.getElementById('profile-avatar-placeholder').style.display = 'none'; 
    }; 
    reader.readAsDataURL(file); 
} 

// ── Exam category router ── 
function loadExamList(category, subtype) { 
    window.ExamModule?.loadCategory && window.ExamModule.loadCategory(category, subtype); 
} 
function loadMockSubjects() { 
    window.ExamModule?.loadMockSubjects && window.ExamModule.loadMockSubjects(); 
} 

// ── AI send (fallback if ai.js not ready) ── 
function sendAIMessage() { 
    if (window.AtlasAI?.send) { 
        window.AtlasAI.send(); 
        return; 
    } 
    const input = document.getElementById('ai-input'); 
    const msg = input.value.trim(); 
    if (!msg) return; 
    
    const box = document.getElementById('ai-chat-box'); 
    const userDiv = document.createElement('div'); 
    userDiv.style.cssText = 'align-self:flex-end;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-sm);padding:10px 14px;font-size:0.88rem;max-width:85%;'; 
    userDiv.textContent = msg; 
    box.appendChild(userDiv); 
    
    input.value = ''; 
    box.scrollTop = box.scrollHeight; 
} 

// ── Bootstrap ── 
window.addEventListener('load', () => { 
    // Hide loading screen after 1.8s 
    setTimeout(() => { 
        document.getElementById('loading-screen').classList.add('hidden'); 
    }, 1900); 
    
    initCountdown(); 
    
    // Auth will update nav button text 
    window.AtlasAuth?.init && window.AtlasAuth.init(); 
});
