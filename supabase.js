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
const _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ১. গ্লোবাল উইন্ডোতে সেট করা (যাতে admin.js এবং app.js সরাসরি পায়)
// আমরা 'supabase' নামেই সেভ করছি যাতে সব ফাইল একই নামে কল করতে পারে
window.supabase = _supabaseClient;

// ২. ES Module হিসেবে এক্সপোর্ট করা (auth.js এর জন্য)
export { _supabaseClient as supabase };
