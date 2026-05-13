// ============================================================
// auth.js — ATLAS EXAM APP
// Handles: Login, Signup, Forget Password, Session Management
// ============================================================

import { supabase } from './supabase.js';

// ─── DOM REFERENCES ──────────────────────────────────────────
const authModal       = document.getElementById('auth-modal');
const loginSection    = document.getElementById('login-section');
const signupSection   = document.getElementById('signup-section');
const forgotSection   = document.getElementById('forgot-section');
const showSignupBtn   = document.getElementById('show-signup');
const showLoginBtn    = document.getElementById('show-login');
const showForgotBtn   = document.getElementById('show-forgot');
const backToLoginBtn  = document.getElementById('back-to-login');
const openAuthBtn     = document.getElementById('open-auth-btn');
const closeAuthBtn    = document.getElementById('close-auth-btn');

// ─── SESSION CHANNEL (Single-session enforcement) ────────────
let sessionChannel = null;

// ─── OPEN / CLOSE MODAL ──────────────────────────────────────
export function openAuthModal(tab = 'login') {
  if (!authModal) return;
  authModal.classList.add('active');
  showTab(tab);
}

export function closeAuthModal() {
  if (!authModal) return;
  authModal.classList.remove('active');
}

function showTab(tab) {
  [loginSection, signupSection, forgotSection].forEach(s => s?.classList.remove('active'));
  if (tab === 'login')  loginSection?.classList.add('active');
  if (tab === 'signup') signupSection?.classList.add('active');
  if (tab === 'forgot') forgotSection?.classList.add('active');
}

if (openAuthBtn)   openAuthBtn.addEventListener('click', () => openAuthModal('login'));
if (closeAuthBtn)  closeAuthBtn.addEventListener('click', closeAuthModal);
if (showSignupBtn) showSignupBtn.addEventListener('click', () => showTab('signup'));
if (showLoginBtn)  showLoginBtn.addEventListener('click', () => showTab('login'));
if (showForgotBtn) showForgotBtn.addEventListener('click', () => showTab('forgot'));
if (backToLoginBtn)backToLoginBtn.addEventListener('click', () => showTab('login'));

// ─── SIGN UP ─────────────────────────────────────────────────
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('signup-msg');

    const name        = val('signup-name');
    const phone       = val('signup-phone');
    const password    = val('signup-password');
    const hscBatch    = val('signup-hsc-batch');
    const college     = val('signup-college');
    const fatherName  = val('signup-father');
    const motherName  = val('signup-mother');
    const sscGpa      = val('signup-ssc-gpa');
    const hscGpa      = val('signup-hsc-gpa');
    const timerType   = val('signup-timer-type'); // 'first' or 'second'

    // Validations
    if (!name || !phone || !password || !hscBatch || !college || !sscGpa || !hscGpa || !timerType) {
      return showMsg('signup-msg', 'সব mandatory field পূরণ করুন।', 'error');
    }
    if (!/^\d{11}$/.test(phone)) {
      return showMsg('signup-msg', 'Phone number অবশ্যই ১১ সংখ্যার হতে হবে।', 'error');
    }
    if (!/^\d+\.\d{2}$/.test(sscGpa) || parseFloat(sscGpa) > 5.00) {
      return showMsg('signup-msg', 'SSC GPA decimal format-এ দিন (যেমন 5.00)', 'error');
    }
    if (!/^\d+\.\d{2}$/.test(hscGpa) || parseFloat(hscGpa) > 5.00) {
      return showMsg('signup-msg', 'HSC GPA decimal format-এ দিন (যেমন 5.00)', 'error');
    }

    // Check phone not already registered
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return showMsg('signup-msg', 'এই phone number দিয়ে আগেই account আছে।', 'error');
    }

    // Insert user
    const { error } = await supabase.from('users').insert([{
      name,
      phone,
      password, // NOTE: In production use hashed passwords
      hsc_batch: hscBatch,
      college,
      father_name: fatherName,
      mother_name: motherName,
      ssc_gpa: parseFloat(sscGpa),
      hsc_gpa: parseFloat(hscGpa),
      timer_type: timerType,
      role: 'student',
      created_at: new Date().toISOString()
    }]);

    if (error) {
      return showMsg('signup-msg', 'Registration failed: ' + error.message, 'error');
    }

    showMsg('signup-msg', '✅ Registration সফল হয়েছে! এখন Login করুন।', 'success');
    setTimeout(() => showTab('login'), 1500);
  });
}

// ─── LOGIN ───────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('login-msg');

    const phone    = val('login-phone');
    const password = val('login-password');

    if (!phone || !password) {
      return showMsg('login-msg', 'Phone ও Password দিন।', 'error');
    }

    // Admin check
    if (phone === '01754365403' && password === 'AtlasApp2026') {
      const adminUser = {
        id: 'admin',
        name: 'Admin',
        phone: '01754365403',
        role: 'admin'
      };
      await setSession(adminUser);
      closeAuthModal();
      onLoginSuccess(adminUser);
      return;
    }

    // Regular user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .eq('password', password)
      .maybeSingle();

    if (error || !user) {
      return showMsg('login-msg', 'Phone বা Password ভুল।', 'error');
    }

    await setSession(user);
    closeAuthModal();
    onLoginSuccess(user);
  });
}

// ─── FORGET PASSWORD ─────────────────────────────────────────
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg('forgot-msg');

    const phone       = val('forgot-phone');
    const newPassword = val('forgot-new-password');

    if (!phone || !newPassword) {
      return showMsg('forgot-msg', 'Phone ও নতুন Password দিন।', 'error');
    }
    if (!/^\d{11}$/.test(phone)) {
      return showMsg('forgot-msg', 'Phone number ১১ সংখ্যার হতে হবে।', 'error');
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (!user) {
      return showMsg('forgot-msg', 'এই phone দিয়ে কোনো account নেই।', 'error');
    }

    const { error } = await supabase
      .from('users')
      .update({ password: newPassword })
      .eq('phone', phone);

    if (error) {
      return showMsg('forgot-msg', 'Password update failed।', 'error');
    }

    showMsg('forgot-msg', '✅ Password পরিবর্তন হয়েছে। Login করুন।', 'success');
    setTimeout(() => showTab('login'), 1500);
  });
}

// ─── SESSION MANAGEMENT ──────────────────────────────────────
async function setSession(user) {
  const sessionId = crypto.randomUUID();
  localStorage.setItem('atlas_user', JSON.stringify(user));
  localStorage.setItem('atlas_session_id', sessionId);

  // Update session_id in DB (for single-session enforcement)
  if (user.id !== 'admin') {
    await supabase
      .from('users')
      .update({ session_id: sessionId })
      .eq('id', user.id);

    // Subscribe to session invalidation
    subscribeToSession(user.id, sessionId);
  }
}

function subscribeToSession(userId, sessionId) {
  if (sessionChannel) supabase.removeChannel(sessionChannel);

  sessionChannel = supabase
    .channel(`session-${userId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'users',
      filter: `id=eq.${userId}`
    }, (payload) => {
      const newSessionId = payload.new.session_id;
      if (newSessionId !== sessionId) {
        // Another device logged in — force logout here
        logout(true);
      }
    })
    .subscribe();
}

export function logout(forced = false) {
  if (sessionChannel) supabase.removeChannel(sessionChannel);
  localStorage.removeItem('atlas_user');
  localStorage.removeItem('atlas_session_id');
  if (forced) {
    alert('অন্য ডিভাইসে Login করা হয়েছে। আপনি Logout হয়ে গেছেন।');
  }
  window.location.reload();
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('atlas_user'));
  } catch {
    return null;
  }
}

export function isAdmin() {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isSubAdmin() {
  const user = getCurrentUser();
  return user?.role === 'sub_admin';
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

// ─── ON LOGIN SUCCESS (update UI) ────────────────────────────
function onLoginSuccess(user) {
  if (typeof window.onAtlasLogin === 'function') {
    window.onAtlasLogin(user);
  }
}

// ─── RE-SUBSCRIBE ON PAGE LOAD ───────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  const sessionId = localStorage.getItem('atlas_session_id');
  if (user && user.id !== 'admin' && sessionId) {
    subscribeToSession(user.id, sessionId);
  }
});

// ─── HELPERS ─────────────────────────────────────────────────
function val(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function showMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-msg ${type}`;
}

function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.className = 'auth-msg'; }
}
