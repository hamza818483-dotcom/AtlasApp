// ============================================================
// admin.js — ATLAS EXAM APP
// Handles: Add Exam, Bulk CSV, Add Class, Add CQ, Grant Sub-Admin, Countdown Update
// ============================================================

import { supabase } from './supabase.js';

// ============================================================
// 🟢 FIX: _supabase alias for compatibility (ADDED)
// ============================================================
const _supabase = supabase;

// ============================================================
// 🟢 FIX: showToast fallback (ADDED)
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

// ─── ADMIN SECURITY CHECK ────────────────────────────────────
function checkAdminAccess() {
    const user = JSON.parse(localStorage.getItem('atlas_user'));
    
    // যদি ইউজার না থাকে বা অ্যাডমিন/সাব-অ্যাডমিন না হয়, তবে বের করে দেবে
    if (!user || (user.role !== 'admin' && user.role !== 'sub-admin')) {
        if(typeof showToast === 'function') showToast("আপনার এই পেজে প্রবেশাধিকার নেই!", "error");
        if(typeof navigateTo === 'function') navigateTo('page-home');
        return null;
    }
    
    // শুধুমাত্র মেইন অ্যাডমিন "Grant Sub-Admin" সেকশন দেখতে পাবে
    const superSection = document.getElementById('super-admin-section');
    if (superSection) {
        superSection.style.display = (user.role === 'admin') ? 'block' : 'none';
    }
    return user;
}

// ─── CSV PROCESSING ENGINE ──────────────────────────────────
async function processCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').filter(line => line.trim() !== '');
                
                // প্রথম লাইন (হেডার) বাদ দিয়ে বাকিগুলো প্রসেস করা
                const data = lines.slice(1).map((line, index) => {
                    const values = line.split(',').map(v => v.trim());
                    return {
                        id: `q_${index + 1}`,
                        question: values[0] || 'Unknown Question',
                        options: [
                            values[1] || '',
                            values[2] || '',
                            values[3] || '',
                            values[4] || '',
                            values[5] || null // 5th option if exists
                        ].filter(Boolean), // ফাঁকা অপশন বাদ দেবে
                        correctAnswerIndex: parseInt(values[6]) - 1, // Array 0-index তাই 1 বিয়োগ
                        explanation: values[7] || 'কোনো ব্যাখ্যা নেই',
                        type: values[8] || '1',
                        section: values[9] || '1'
                    };
                });
                resolve(data);
            } catch (err) {
                console.error("CSV Processing Error:", err);
                reject("CSV ফাইলটি সঠিক ফরম্যাটে নেই!");
            }
        };
        reader.onerror = () => {
            console.error("File Reader Error!");
            reject("ফাইল পড়তে সমস্যা হয়েছে!");
        }
        reader.readAsText(file);
    });
}

// ─── 1. ADD NEW EXAM (With Bulk CSV) ────────────────────────
window.handleAddExam = async function() {
    console.log("handleAddExam function triggered!");
    const user = checkAdminAccess();
    if (!user) return;

    const subject = document.getElementById('exam-subject')?.value.trim();
    const chapter = document.getElementById('exam-chapter')?.value.trim();
    const type = document.getElementById('exam-type')?.value;
    const csvFile = document.getElementById('exam-csv')?.files[0];
    const examBtn = document.getElementById('add-exam-btn');

    if (!subject || !chapter || !csvFile) {
        return showToast("সবগুলো তথ্য এবং CSV ফাইল দিতে হবে!", "error");
    }

    examBtn.innerText = "Processing...";
    examBtn.disabled = true;

    try {
        console.log("Processing CSV...");
        const questions = await processCSV(csvFile);
        console.log("CSV Processed Successfully. Total Questions:", questions.length);
        
        const title = `${subject} - ${chapter} Exam`;
        
        // 🟢 FIX: Get user ID from localStorage (was using user.phone but column expects UUID)
        const currentUser = JSON.parse(localStorage.getItem('atlas_user'));
        const userId = currentUser?.id || null;
        
        console.log("Sending data to Supabase...");
        // 🟢 FIX: Changed 'type' to 'exam_type' to match database column
        const { data, error } = await _supabase.from('exams').insert([{
            title: title,
            subject: subject,
            chapter: chapter,
            exam_type: type,  // ← FIXED: was 'type'
            total_questions: questions.length,
            questions_data: questions,
            created_by: userId,  // ← FIXED: was user.phone (string), now UUID
            created_at: new Date().toISOString()
        }]).select();

        if (error) {
            console.error("Supabase Database Error:", error);
            throw error;
        }
        
        console.log("Data saved successfully to Supabase:", data);
        showToast("✅ এক্সাম সফলভাবে তৈরি হয়েছে!", "success");
        
        // জেনারেট হওয়া এক্সাম লিংক কপি করার অপশন
        if (data && data[0] && data[0].id) {
            const examLink = `${window.location.origin}/?exam=${data[0].id}`;
            setTimeout(() => {
                prompt("এক্সাম লিংকটি কপি করে স্টুডেন্টদের দিন:", examLink);
            }, 500);
        }

        // ফর্ম ক্লিয়ার করা
        const examSubject = document.getElementById('exam-subject');
        const examChapter = document.getElementById('exam-chapter');
        const examCsv = document.getElementById('exam-csv');
        if (examSubject) examSubject.value = '';
        if (examChapter) examChapter.value = '';
        if (examCsv) examCsv.value = '';

    } catch (err) {
        showToast(err.message || err, "error");
        console.error("Exam Upload Error:", err);
    } finally {
        examBtn.innerText = "Create Exam & Bulk Upload";
        examBtn.disabled = false;
    }
};

// ─── 2. ADD NEW CLASS (YouTube Links) ────────────────────────
window.handleAddClass = async function() {
    console.log("handleAddClass function triggered!");
    const user = checkAdminAccess();
    if (!user) return;

    const subject = document.getElementById('class-subject')?.value.trim();
    const chapter = document.getElementById('class-chapter')?.value.trim();
    const title = document.getElementById('class-title')?.value.trim();
    const ytLink = document.getElementById('class-link')?.value.trim();
    const classBtn = document.getElementById('add-class-btn');

    if (!subject || !chapter || !title || !ytLink) {
        return showToast("সব তথ্য দিন!", "error");
    }

    classBtn.innerText = "Saving...";
    classBtn.disabled = true;

    // 🟢 FIX: Get user ID from localStorage
    const currentUser = JSON.parse(localStorage.getItem('atlas_user'));
    const userId = currentUser?.id || null;

    console.log("Sending class data to Supabase...");
    const { data, error } = await _supabase.from('classes').insert([{
        subject: subject,
        chapter: chapter,
        title: title,
        video_url: ytLink,
        added_by: userId,  // ← FIXED: was user.phone
        created_at: new Date().toISOString()
    }]);

    if (error) {
        console.error("Supabase Class Add Error:", error);
        showToast("ক্লাস সেভ করা যায়নি", "error");
    } else {
        console.log("Class saved successfully:", data);
        showToast("✅ ক্লাস সফলভাবে যুক্ত হয়েছে!", "success");
        const classTitle = document.getElementById('class-title');
        const classLink = document.getElementById('class-link');
        if (classTitle) classTitle.value = '';
        if (classLink) classLink.value = '';
    }
    
    classBtn.innerText = "Add Video Class";
    classBtn.disabled = false;
};

// ─── 3. ADD CQ (Creative Questions) ──────────────────────────
window.handleAddCQ = async function() {
    const user = checkAdminAccess();
    if (!user) return;

    const subject = document.getElementById('cq-subject')?.value.trim();
    const chapter = document.getElementById('cq-chapter')?.value.trim();
    const link = document.getElementById('cq-link')?.value.trim();
    const cqBtn = document.getElementById('add-cq-btn');

    if (!subject || !chapter || !link) {
        return showToast("সব তথ্য দিন!", "error");
    }

    cqBtn.innerText = "Saving...";
    cqBtn.disabled = true;

    // 🟢 FIX: Get user ID from localStorage
    const currentUser = JSON.parse(localStorage.getItem('atlas_user'));
    const userId = currentUser?.id || null;

    const { error } = await _supabase.from('cq_bank').insert([{
        subject: subject,
        chapter: chapter,
        pdf_link: link,
        added_by: userId,  // ← FIXED: was user.phone
        created_at: new Date().toISOString()
    }]);

    if (error) {
        console.error("Supabase CQ Add Error:", error);
        showToast("CQ সেভ করা যায়নি", "error");
    }
    else {
        showToast("✅ CQ সফলভাবে যুক্ত হয়েছে!", "success");
        const cqLink = document.getElementById('cq-link');
        if (cqLink) cqLink.value = '';
    }

    cqBtn.innerText = "Add CQ / PDF Link";
    cqBtn.disabled = false;
};

// ─── 4. GRANT SUB-ADMIN (Super Admin Only) ──────────────────
window.grantSubAdmin = async function() {
    const user = checkAdminAccess();
    if (!user || user.role !== 'admin') return; // শুধুমাত্র মেইন অ্যাডমিন পারবে

    const phone = document.getElementById('sub-admin-phone')?.value.trim();
    if (!phone || phone.length !== 11) return showToast("১১ ডিজিটের সঠিক নম্বর দিন", "error");

    // আগে চেক করবে ইউজার আছে কি না
    const { data: existUser, error: findErr } = await _supabase
        .from('users')
        .select('id, name, role')
        .eq('phone', phone)
        .maybeSingle();
    
    if (findErr) console.error("Error finding user:", findErr);

    if (!existUser) {
        return showToast("এই নম্বরে কোনো স্টুডেন্ট নেই!", "error");
    }

    if (existUser.role === 'admin') {
        return showToast("এই ইউজার ইতিমধ্যে Admin!", "error");
    }

    // সাব-অ্যাডমিন রোল আপডেট
    const { error: updateErr } = await _supabase
        .from('users')
        .update({ role: 'sub-admin' })
        .eq('phone', phone);

    if (updateErr) {
        console.error("Supabase Update Role Error:", updateErr);
        showToast("সাব-অ্যাডমিন বানানো যায়নি", "error");
    } else {
        showToast(`✅ ${existUser.name || phone} কে সাব-অ্যাডমিন অ্যাক্সেস দেওয়া হয়েছে!`, "success");
        const subAdminPhone = document.getElementById('sub-admin-phone');
        if (subAdminPhone) subAdminPhone.value = '';
    }
};

// ─── 5. UPDATE COUNTDOWN TIMER ───────────────────────────────
window.handleUpdateCountdown = async function() {
    const user = checkAdminAccess();
    if (!user) return;

    const mainTopic = document.getElementById('cd-set-main')?.value.trim();
    const subTopic = document.getElementById('cd-set-sub')?.value.trim();
    const targetDate = document.getElementById('cd-set-date')?.value;

    if (!mainTopic || !targetDate) {
        return showToast("Main Topic এবং Date সিলেক্ট করুন!", "error");
    }

    // 🟢 FIX: Using 'countdowns' table instead of 'settings'
    const { error } = await _supabase.from('countdowns').insert([{
        main_topic: mainTopic,
        sub_topic: subTopic || '',
        end_time: targetDate,
        created_at: new Date().toISOString()
    }]);

    if (error) {
        console.error("Supabase Countdown Update Error:", error);
        showToast("কাউন্টডাউন আপডেট হয়নি", "error");
    }
    else showToast("✅ কাউন্টডাউন সফলভাবে সেট করা হয়েছে!", "success");
};

// ─── 6. GLOBAL DELETE SECURITY ───────────────────────────────
window.safeDelete = async function(tableName, id) {
    const user = checkAdminAccess();
    if (!user) return;

    // RULE: সাব-অ্যাডমিন ডিলিট করতে পারবে না
    if (user.role === 'sub-admin') {
        return showToast("সাব-অ্যাডমিনদের ডিলিট করার অনুমতি নেই!", "error");
    }

    if (confirm("আপনি কি নিশ্চিতভাবে এটি ডিলিট করতে চান? (এটি আর রিকভার করা যাবে না)")) {
        const { error } = await _supabase.from(tableName).delete().eq('id', id);
        if (error) {
            console.error(`Supabase Delete Error on ${tableName}:`, error);
            showToast("ডিলিট করা যায়নি", "error");
        }
        else {
            showToast("✅ সফলভাবে ডিলিট হয়েছে", "success");
        }
    }
};

// ─── RENDER FORMS ON PAGE LOAD (ADJUSTED) ──────────────────
window.loadAdminPanel = function() {
    console.log("Admin Panel Loading...");

    // Add Exam Form Render
    const examFormBox = document.getElementById('admin-exam-form');
    if(examFormBox) {
        examFormBox.innerHTML = `
            <div class="form-group"><label>Subject</label><input type="text" id="exam-subject" class="form-input" placeholder="e.g. Biology"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter / Topic</label><input type="text" id="exam-chapter" class="form-input" placeholder="e.g. Chapter 1"></div><div class="spacer-sm"></div>
            <div class="form-group">
                <label>Exam Category</label>
                <select id="exam-type" class="form-input">
                    <option value="board">বোর্ড প্রস্তুতি (Board)</option>
                    <option value="medical">মেডিকেল প্রস্তুতি (Medical)</option>
                    <option value="varsity">ভার্সিটি প্রস্তুতি (Varsity)</option>
                    <option value="practice">অনুশীলনী (Practice)</option>
                </select>
            </div><div class="spacer-sm"></div>
            <div class="form-group"><label>Upload Questions (CSV Format)</label><input type="file" id="exam-csv" accept=".csv" class="form-input"></div><div class="spacer-md"></div>
            <button class="btn-primary" id="add-exam-btn" onclick="handleAddExam()">Create Exam & Bulk Upload</button>
        `;
    } else {
        console.error("Error: 'admin-exam-form' ID টি index.html এ পাওয়া যায়নি!");
    }

    // Add Class Form Render
    const classFormBox = document.getElementById('admin-class-form');
    if(classFormBox) {
        classFormBox.innerHTML = `
            <div class="form-group"><label>Subject</label><input type="text" id="class-subject" class="form-input" placeholder="e.g. Physics"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter</label><input type="text" id="class-chapter" class="form-input" placeholder="e.g. Chapter 2"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Class Title (Part/Topic)</label><input type="text" id="class-title" class="form-input" placeholder="e.g. Part 1: Vectors"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>YouTube Link</label><input type="url" id="class-link" class="form-input" placeholder="https://youtube.com/..."></div><div class="spacer-md"></div>
            <button class="btn-primary" id="add-class-btn" onclick="handleAddClass()">Add Video Class</button>
        `;
    }

    // Add CQ Form Render
    const cqFormBox = document.getElementById('admin-cq-form');
    if(cqFormBox) {
        cqFormBox.innerHTML = `
            <div class="form-group"><label>Subject</label><input type="text" id="cq-subject" class="form-input"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter / Type</label><input type="text" id="cq-chapter" class="form-input" placeholder="e.g. ক ভান্ডার"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Drive/PDF Link</label><input type="url" id="cq-link" class="form-input" placeholder="Google Drive Link"></div><div class="spacer-md"></div>
            <button class="btn-primary" id="add-cq-btn" onclick="handleAddCQ()">Add CQ / PDF Link</button>
        `;
    }
};

// 🟢 FIX: Add initAdminPanel function (ADDED)
window.initAdminPanel = function() {
    console.log("initAdminPanel called");
    if (window.loadAdminPanel) {
        window.loadAdminPanel();
    }
};

// পেজ ডিরেক্ট রিফ্রেশ দিলেও যেন কাজ করে
window.addEventListener('DOMContentLoaded', () => {
    const adminPage = document.getElementById('page-admin');
    if (adminPage && adminPage.classList.contains('active')) {
        window.loadAdminPanel();
    }
});

// এই কোডটুকু নিশ্চিত করবে যে পেজ লোড হওয়া মাত্রই অ্যাডমিন ফর্মগুলো রেন্ডার হবে
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if(window.loadAdminPanel) window.loadAdminPanel();
    });
} else {
    if(window.loadAdminPanel) window.loadAdminPanel();
}

// ম্যানুয়ালি পেজ সুইচ করার সময়ও যাতে কাজ করে
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.id === 'page-admin' && mutation.target.classList.contains('active')) {
            if(window.loadAdminPanel) window.loadAdminPanel();
        }
    });
});

const adminPageEl = document.getElementById('page-admin');
if(adminPageEl) {
    observer.observe(adminPageEl, { attributes: true, attributeFilter: ['class'] });
}