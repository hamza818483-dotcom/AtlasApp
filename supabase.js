// ============================================================
// supabase.js — ATLAS EXAM APP
// Supabase Client — Fixed Connectivity
// ============================================================

const SUPABASE_URL = 'https://btezborkuiqfogykrjrn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZXpib3JrdWlxZm9neWtyanJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTIyNzUsImV4cCI6MjA5NDIyODI3NX0.G4C7YTmk-AEvhWXnx-phMjTh9pxbdhCiapYVDpSVsEw';

// CDN থেকে আসা গ্লোবাল supabase অবজেক্ট চেক করা
if (typeof supabase === 'undefined') {
    console.error("Supabase CDN লোড হয়নি! index.html চেক করুন।");
}

// Client তৈরি করা
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 🟢 গ্লোবাল উইন্ডোতে সেট করা (সব ফাইলের জন্য)
// ============================================================
window.supabase = supabaseClient;
window._supabase = supabaseClient;  // ← auth.js, admin.js, home.js এর জন্য

// ============================================================
// 🟢 ES Module হিসেবে এক্সপোর্ট করা
// ============================================================
export const supabase = supabaseClient;
export default supabaseClient;