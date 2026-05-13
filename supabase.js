// ============================================================
// supabase.js — ATLAS EXAM APP
// Supabase Client — Module Export (ES Module compatible)
// ============================================================

const SUPABASE_URL = 'https://btezborkuiqfogykrjrn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZXpib3JrdWlxZm9neWtyanJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTIyNzUsImV4cCI6MjA5NDIyODI3NX0.G4C7YTmk-AEvhWXnx-phMjTh9pxbdhCiapYVDpSVsEw';

// ── Global supabase client (window.supabase) for non-module scripts ──
const { createClient } = supabase; // from CDN script tag
const _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Make available globally for non-module scripts (app.js, admin.js, profile.js)
window._supabase = _supabaseClient;

// Also export as ES module for auth.js (type="module")
export { _supabaseClient as supabase };