// ============================================================
// admin-global.js — ATLAS EXAM APP (Non-module version)
// ============================================================

// Supabase client
const SUPABASE_URL = 'https://btezborkuiqfogykrjrn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZXpib3JrdWlxZm9neWtyanJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTIyNzUsImV4cCI6MjA5NDIyODI3NX0.G4C7YTmk-AEvhWXnx-phMjTh9pxbdhCiapYVDpSVsEw';

let _supabase = null;

// Initialize Supabase
function initSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window._supabase = _supabase;
        console.log('Supabase initialized in admin-global');
    }
}

// Check admin access
function checkAdminAccess() {
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    if (!user || (user.role !== 'admin' && user.role !== 'sub-admin')) {
        alert('আপনার এই পেজে প্রবেশাধিকার নেই!');
        window.location.hash = '#page-home';
        return null;
    }
    return user;
}

// Load Admin Panel Forms
function loadAdminForms() {
    console.log('Loading admin forms...');
    
    // Load Exam Form
    const examFormBox = document.getElementById('admin-exam-form');
    if(examFormBox) {
        examFormBox.innerHTML = `
            <h3 style="margin-bottom: 15px;">📝 Add New Exam</h3>
            <div class="form-group"><label>Subject *</label><input type="text" id="exam-subject" class="form-input" placeholder="e.g. Biology"></div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter *</label><input type="text" id="exam-chapter" class="form-input" placeholder="e.g. Chapter 1"></div>
            <div class="spacer-sm"></div>
            <div class="form-group">
                <label>Exam Category *</label>
                <select id="exam-type" class="form-input">
                    <option value="board">বোর্ড প্রস্তুতি</option>
                    <option value="medical">মেডিকেল প্রস্তুতি</option>
                    <option value="varsity">ভার্সিটি প্রস্তুতি</option>
                    <option value="practice">অনুশীলনী</option>
                </select>
            </div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>CSV File *</label><input type="file" id="exam-csv" accept=".csv" class="form-input"></div>
            <div class="spacer-md"></div>
            <button class="btn-primary" onclick="window.handleAddExam()">Create Exam & Upload</button>
        `;
    }
    
    // Load Class Form
    const classFormBox = document.getElementById('admin-class-form');
    if(classFormBox) {
        classFormBox.innerHTML = `
            <h3 style="margin-bottom: 15px;">🎥 Add New Class</h3>
            <div class="form-group"><label>Subject *</label><input type="text" id="class-subject" class="form-input" placeholder="e.g. Physics"></div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter *</label><input type="text" id="class-chapter" class="form-input" placeholder="e.g. Chapter 2"></div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>Class Title *</label><input type="text" id="class-title" class="form-input" placeholder="e.g. Part 1: Vectors"></div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>YouTube Link *</label><input type="url" id="class-link" class="form-input" placeholder="https://youtube.com/..."></div>
            <div class="spacer-md"></div>
            <button class="btn-primary" onclick="window.handleAddClass()">Add Video Class</button>
        `;
    }
    
    // Load CQ Form
    const cqFormBox = document.getElementById('admin-cq-form');
    if(cqFormBox) {
        cqFormBox.innerHTML = `
            <h3 style="margin-bottom: 15px;">📄 Add CQ (ক, খ, CQ)</h3>
            <div class="form-group"><label>Subject *</label><input type="text" id="cq-subject" class="form-input"></div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter / Type *</label><input type="text" id="cq-chapter" class="form-input" placeholder="e.g. ক ভান্ডার"></div>
            <div class="spacer-sm"></div>
            <div class="form-group"><label>PDF/Drive Link *</label><input type="url" id="cq-link" class="form-input" placeholder="Google Drive Link"></div>
            <div class="spacer-md"></div>
            <button class="btn-primary" onclick="window.handleAddCQ()">Add CQ / PDF Link</button>
        `;
    }
}

// Add Exam Handler
window.handleAddExam = async function() {
    const user = checkAdminAccess();
    if (!user) return;
    
    if (!_supabase) initSupabase();
    
    const subject = document.getElementById('exam-subject')?.value.trim();
    const chapter = document.getElementById('exam-chapter')?.value.trim();
    const type = document.getElementById('exam-type')?.value;
    const csvFile = document.getElementById('exam-csv')?.files[0];
    
    if (!subject || !chapter || !csvFile) {
        alert('সবগুলো তথ্য এবং CSV ফাইল দিতে হবে!');
        return;
    }
    
    alert(`✅ Exam "${subject} - ${chapter}" added successfully! (Demo mode)`);
    console.log('Exam data:', {subject, chapter, type});
};

// Add Class Handler
window.handleAddClass = async function() {
    const user = checkAdminAccess();
    if (!user) return;
    
    const subject = document.getElementById('class-subject')?.value.trim();
    const chapter = document.getElementById('class-chapter')?.value.trim();
    const title = document.getElementById('class-title')?.value.trim();
    const link = document.getElementById('class-link')?.value.trim();
    
    if (!subject || !chapter || !title || !link) {
        alert('সব তথ্য দিন!');
        return;
    }
    
    alert(`✅ Class "${title}" added successfully! (Demo mode)`);
    console.log('Class data:', {subject, chapter, title, link});
};

// Add CQ Handler
window.handleAddCQ = async function() {
    const user = checkAdminAccess();
    if (!user) return;
    
    const subject = document.getElementById('cq-subject')?.value.trim();
    const chapter = document.getElementById('cq-chapter')?.value.trim();
    const link = document.getElementById('cq-link')?.value.trim();
    
    if (!subject || !chapter || !link) {
        alert('সব তথ্য দিন!');
        return;
    }
    
    alert(`✅ CQ for "${subject} - ${chapter}" added successfully! (Demo mode)`);
    console.log('CQ data:', {subject, chapter, link});
};

// Update Countdown Handler
window.handleUpdateCountdown = async function() {
    const user = checkAdminAccess();
    if (!user) return;
    
    const mainTopic = document.getElementById('cd-set-main')?.value.trim();
    const subTopic = document.getElementById('cd-set-sub')?.value.trim();
    const targetDate = document.getElementById('cd-set-date')?.value;
    
    if (!mainTopic || !targetDate) {
        alert('Main Topic এবং Date সিলেক্ট করুন!');
        return;
    }
    
    alert(`✅ Countdown Updated!\n\nTopic: ${mainTopic}\nSub: ${subTopic}\nDate: ${targetDate}`);
    console.log('Countdown data:', {mainTopic, subTopic, targetDate});
};

// Initialize
initSupabase();
loadAdminForms();
