// ============================================================
// auth.js — ATLAS EXAM APP
// Handles: Login, Signup, Forget Password, Session Management
// Admin Access Control
// ============================================================
// NOTE: This file uses type="module" in index.html
// supabase.js must be loaded as a module too (see index.html fix)
// ============================================================

import { supabase } from './supabase.js';

// ============================================================
// 🟢 FIX: _supabase alias for compatibility (ADDED)
// ============================================================
const _supabase = supabase;

// ─── ADMIN CREDENTIALS (hardcoded, never stored in DB) ───────
const ADMIN_PHONE    = '01754365403';
const ADMIN_PASSWORD = 'AtlasApp2026';

// ─── SESSION CHANNEL (Single-session enforcement) ────────────
let sessionChannel = null;

// ============================================================
// SESSION HELPERS
// ============================================================

async function setSession(user) {
  const sessionId = crypto.randomUUID();
  localStorage.setItem('atlas_user', JSON.stringify(user));
  localStorage.setItem('atlas_session_id', sessionId);

  // Update active_session_id in DB for real users (not admin)
  if (user.role !== 'admin') {
    const { error } = await _supabase
      .from('users')
      .update({ active_session_id: sessionId })
      .eq('id', user.id);

    if (!error) subscribeToSession(user.id, sessionId);
  }
}

function subscribeToSession(userId, sessionId) {
  if (sessionChannel) _supabase.removeChannel(sessionChannel);
  sessionChannel = _supabase
    .channel(`session-${userId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'users',
      filter: `id=eq.${userId}`
    }, (payload) => {
      const newId = payload.new.active_session_id;
      if (newId && newId !== sessionId) {
        forceLogout();
      }
    })
    .subscribe();
}

function forceLogout() {
  if (sessionChannel) _supabase.removeChannel(sessionChannel);
  localStorage.removeItem('atlas_user');
  localStorage.removeItem('atlas_session_id');
  alert('⚠️ অন্য ডিভাইসে Login করা হয়েছে। আপনি Logout হয়ে গেছেন।');
  window.location.reload();
}

// ─── Re-subscribe on page load ────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  const sessionId = localStorage.getItem('atlas_session_id');
  if (user && user.role !== 'admin' && sessionId) {
    subscribeToSession(user.id, sessionId);
  }
  // Always refresh UI on load
  updateAuthUI();
});

// ============================================================
// PUBLIC SESSION API (used by other files via window)
// ============================================================

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('atlas_user'));
  } catch {
    return null;
  }
}

export function isAdmin() {
  return getCurrentUser()?.role === 'admin';
}

export function isSubAdmin() {
  const role = getCurrentUser()?.role;
  return role === 'sub-admin' || role === 'sub_admin';
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function canManageContent() {
  // Admin OR sub-admin can add/edit content
  return isAdmin() || isSubAdmin();
}

// ============================================================
// UI UPDATE (Admin button, nav button, profile data)
// ============================================================

function updateAuthUI() {
  const user = getCurrentUser();
  const navAuthBtn      = document.getElementById('navAuthBtn');
  const adminControlBtn = document.getElementById('admin-control-btn');

  if (user) {
    if (navAuthBtn) navAuthBtn.innerText = user.name || 'প্রোফাইল';
    // Show Admin Control ONLY for admin or sub-admin
    if (adminControlBtn) {
      adminControlBtn.style.display =
        (user.role === 'admin' || user.role === 'sub-admin') ? 'block' : 'none';
    }
  } else {
    if (navAuthBtn) navAuthBtn.innerText = 'লগইন';
    if (adminControlBtn) adminControlBtn.style.display = 'none';
  }

  // Also populate profile page if open
  populateProfilePage(user);
}

function populateProfilePage(user) {
  if (!user) return;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };

  set('p-display-name', user.name);
  set('p-phone',  user.phone);
  set('p-pass',   user.password || '(লুকানো)');
  set('p-batch',  user.hsc_batch);
  set('p-college',user.college);
  set('p-ssc',    user.ssc_gpa);
  set('p-hsc',    user.hsc_gpa);
  set('p-timer',  user.timer_status);

  // Avatar
  const img   = document.getElementById('profile-avatar-img');
  const ph    = document.getElementById('profile-avatar-placeholder');
  if (user.avatar_url && img && ph) {
    img.src          = user.avatar_url;
    img.style.display = 'block';
    ph.style.display  = 'none';
  }
}

// ============================================================
// REGISTRATION
// ============================================================

window.selectTimer = function (val) {
  window._selectedTimer = (val === 'first') ? 'First Timer' : 'Second Timer';
  document.getElementById('timer-first')?.classList.toggle('selected',  val === 'first');
  document.getElementById('timer-second')?.classList.toggle('selected', val === 'second');
};

window.handleRegistration = async function () {
  const get = id => document.getElementById(id)?.value?.trim() || '';

  const name       = get('reg-name');
  const phone      = get('reg-phone');
  const password   = get('reg-pass');
  const hscBatch   = get('reg-batch');
  const college    = get('reg-college');
  const fatherName = get('reg-father');
  const motherName = get('reg-mother');
  const sscGpa     = get('reg-ssc');
  const hscGpa     = get('reg-hsc');
  const timerType  = window._selectedTimer;

  // ── Validation ──
  const toast = window.showToast || ((m, t) => alert(m));

  if (!name || !phone || !password || !hscBatch || !college || !sscGpa || !hscGpa) {
    return toast('সব mandatory (*) field পূরণ করুন।', 'error');
  }
  if (!timerType) {
    return toast('ফার্স্ট টাইমার / সেকেন্ড টাইমার সিলেক্ট করুন।', 'error');
  }
  if (!/^\d{11}$/.test(phone)) {
    return toast('Phone number অবশ্যই ১১ সংখ্যার হতে হবে।', 'error');
  }

  const sscVal = parseFloat(sscGpa);
  const hscVal = parseFloat(hscGpa);

  if (isNaN(sscVal) || !/^\d+\.\d{2}$/.test(sscGpa) || sscVal > 5.00 || sscVal < 0) {
    return toast('SSC GPA সঠিকভাবে দিন (যেমন: 5.00)', 'error');
  }
  if (isNaN(hscVal) || !/^\d+\.\d{2}$/.test(hscGpa) || hscVal > 5.00 || hscVal < 0) {
    return toast('HSC GPA সঠিকভাবে দিন (যেমন: 5.00)', 'error');
  }

  // ── Duplicate phone check ──
  const { data: existing } = await _supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return toast('এই Phone Number দিয়ে আগেই Account আছে।', 'error');
  }

  // ── Insert into Supabase ──
  const { data, error } = await _supabase.from('users').insert([{
    name,
    phone,
    password,          // Plain text (no email auth needed per spec)
    hsc_batch:   hscBatch,
    college,
    father_name: fatherName,
    mother_name: motherName,
    ssc_gpa:     sscVal,
    hsc_gpa:     hscVal,
    timer_status: timerType,
    role:        'user',
    created_at:  new Date().toISOString()
  }]).select().single();

  if (error) {
    console.error('Registration error:', error);
    return toast('Registration failed: ' + error.message, 'error');
  }

  toast('✅ Registration সফল হয়েছে! এখন Login করুন।', 'success');
  window._selectedTimer = null;
  document.getElementById('timer-first')?.classList.remove('selected');
  document.getElementById('timer-second')?.classList.remove('selected');

  setTimeout(() => {
    if (typeof navigateTo === 'function') navigateTo('page-login');
  }, 1500);
};

// ============================================================
// LOGIN
// ============================================================

window.handleLogin = async function () {
  const phone = document.getElementById('login-phone')?.value?.trim() || '';
  const password = document.getElementById('login-pass')?.value?.trim() || '';

  if (!phone || !password) {
    alert('Phone ও Password দিন।');
    return;
  }

  // ── Admin hardcoded check ──
  if (phone === '01754365403' && password === 'AtlasApp2026') {
    alert('Step 1: Admin detected');  // 🔴 ADD THIS
    
    const adminUser = {
      id: 'admin',
      name: 'Admin',
      phone: '01754365403',
      role: 'admin'
    };
    localStorage.setItem('atlas_user', JSON.stringify(adminUser));
    
    alert('Step 2: Saved to localStorage');  // 🔴 ADD THIS
    
    const adminBtn = document.getElementById('admin-control-btn');
    alert('Step 3: Button element = ' + (adminBtn ? 'Found' : 'Not Found'));  // 🔴 ADD THIS
    
    if (adminBtn) {
      adminBtn.style.display = 'block';
      alert('Step 4: Button style set to block');  // 🔴 ADD THIS
    }
    
    alert('✅ Admin Login Complete!');  // 🔴 ADD THIS
    
    document.getElementById('login-phone').value = '';
    document.getElementById('login-pass').value = '';
    
    if (typeof bottomNav === 'function') {
      bottomNav('home');
    } else if (typeof navigateTo === 'function') {
      navigateTo('page-home');
    } else {
      window.location.href = '#page-home';
    }
    return;
  }

  alert('ভুল ফোন নম্বর বা পাসওয়ার্ড!\n\nAdmin login: 01754365403 / AtlasApp2026');
};

// ============================================================
// FORGOT PASSWORD
// ============================================================

window.handleForgotPassword = async function () {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const phone       = get('forgot-phone');
  const newPassword = get('forgot-new-pass');
  const toast       = window.showToast || ((m, t) => alert(m));

  if (!phone || !newPassword) {
    return toast('Phone ও নতুন Password দিন।', 'error');
  }
  if (!/^\d{11}$/.test(phone)) {
    return toast('Phone number ১১ সংখ্যার হতে হবে।', 'error');
  }

  const { data: user } = await _supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (!user) {
    return toast('এই phone দিয়ে কোনো account নেই।', 'error');
  }

  const { error } = await _supabase
    .from('users')
    .update({ password: newPassword })
    .eq('phone', phone);

  if (error) {
    return toast('Password update failed।', 'error');
  }

  toast('✅ Password পরিবর্তন হয়েছে। Login করুন।', 'success');
  document.getElementById('forgot-phone').value    = '';
  document.getElementById('forgot-new-pass').value = '';

  setTimeout(() => {
    if (typeof navigateTo === 'function') navigateTo('page-login');
  }, 1500);
};

// ============================================================
// LOGOUT
// ============================================================

window.handleLogout = function () {
  if (sessionChannel) _supabase.removeChannel(sessionChannel);
  localStorage.removeItem('atlas_user');
  localStorage.removeItem('atlas_session_id');
  updateAuthUI();
  if (typeof showToast === 'function') showToast('Logout সফল।', 'success');
  setTimeout(() => {
    if (typeof bottomNav === 'function') bottomNav('home');
  }, 600);
};

// ============================================================
// NAV AUTH BUTTON (Top right — লগইন / প্রোফাইল toggle)
// ============================================================

window.handleNavAuth = function () {
  if (isLoggedIn()) {
    if (typeof bottomNav === 'function') bottomNav('profile');
  } else {
    if (typeof navigateTo === 'function') navigateTo('page-login');
  }
};

// ============================================================
// GRANT SUB-ADMIN (Admin panel use)
// ============================================================

window.grantSubAdmin = async function () {
  const toast = window.showToast || ((m, t) => alert(m));

  if (!isAdmin()) {
    return toast('এই কাজ শুধু Admin করতে পারবে।', 'error');
  }

  const phone = document.getElementById('sub-admin-phone')?.value?.trim();
  if (!phone || !/^\d{11}$/.test(phone)) {
    return toast('সঠিক ১১ সংখ্যার Phone Number দিন।', 'error');
  }

  const { data: user } = await _supabase
    .from('users')
    .select('id, name, role')
    .eq('phone', phone)
    .maybeSingle();

  if (!user) {
    return toast('এই phone দিয়ে কোনো Student নেই।', 'error');
  }

  if (user.role === 'admin') {
    return toast('এই user ইতিমধ্যে Admin।', 'error');
  }

  const { error } = await _supabase
    .from('users')
    .update({ role: 'sub-admin' })
    .eq('phone', phone);

  if (error) {
    return toast('Access দিতে ব্যর্থ: ' + error.message, 'error');
  }

  toast(`✅ ${user.name || phone} কে Sub-Admin Access দেওয়া হয়েছে।`, 'success');
  document.getElementById('sub-admin-phone').value = '';
};

// ============================================================
// AVATAR UPLOAD (Profile page)
// ============================================================

window.triggerAvatarUpload = function () {
  document.getElementById('avatar-file-input')?.click();
};

window.handleAvatarUpload = async function (event) {
  const toast = window.showToast || ((m, t) => alert(m));
  const file  = event.target.files[0];
  if (!file) return;

  const user = getCurrentUser();
  if (!user) return toast('Login করুন।', 'error');

  const ext      = file.name.split('.').pop();
  const filePath = `avatars/${user.id}.${ext}`;

  const { error: upErr } = await _supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (upErr) return toast('Photo upload failed: ' + upErr.message, 'error');

  const { data } = _supabase.storage.from('avatars').getPublicUrl(filePath);
  const avatarUrl = data.publicUrl;

  await _supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', user.id);

  // Update localStorage
  const updated = { ...user, avatar_url: avatarUrl };
  localStorage.setItem('atlas_user', JSON.stringify(updated));

  // Update UI
  const img = document.getElementById('profile-avatar-img');
  const ph  = document.getElementById('profile-avatar-placeholder');
  if (img && ph) {
    img.src = avatarUrl;
    img.style.display = 'block';
    ph.style.display  = 'none';
  }

  toast('✅ Photo আপডেট হয়েছে।', 'success');
};

// ============================================================
// 🟢 FIX: Add loadProfileData to window (ADDED)
// ============================================================
window.loadProfileData = function() {
  const user = getCurrentUser();
  if (!user) return;
  
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };

  set('p-display-name', user.name);
  set('p-phone', user.phone);
  set('p-pass', user.password || '********');
  set('p-batch', user.hsc_batch);
  set('p-college', user.college);
  set('p-ssc', user.ssc_gpa);
  set('p-hsc', user.hsc_gpa);
  set('p-timer', user.timer_status);

  const img = document.getElementById('profile-avatar-img');
  const ph = document.getElementById('profile-avatar-placeholder');
  if (user.avatar_url && img && ph) {
    img.src = user.avatar_url;
    img.style.display = 'block';
    ph.style.display = 'none';
  }
};

// ============================================================
// 🟢 FIX: Add showToast as fallback (ADDED)
// ============================================================
if (typeof window.showToast !== 'function') {
  window.showToast = function(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) {
      alert(msg);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type || 'success'}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  };
}

// ============================================================
// EXPOSE to other scripts via window (non-module compat)
// ============================================================

window.AtlasAuth = {
  getCurrentUser,
  isAdmin,
  isSubAdmin,
  isLoggedIn,
  canManageContent,
  updateUI: updateAuthUI
};
// ============================================================
// 🟢 FORCE SHOW ADMIN BUTTON (DEBUG)
// ============================================================
setTimeout(function() {
    const user = getCurrentUser();
    console.log('Force check - User:', user);
    
    if (user && user.phone === '01754365403') {
        const adminBtn = document.getElementById('admin-control-btn');
        if (adminBtn) {
            adminBtn.style.display = 'block';
            console.log('✅ Admin button force shown!');
        } else {
            console.log('❌ Admin button element not found!');
        }
    }
}, 1000);