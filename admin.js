// ============================================================
// admin.js — ATLAS EXAM APP
// Handles: Add Exam, Bulk CSV, Add Class, Add CQ, Grant Sub-Admin, Countdown Update
// ============================================================

import { supabase } from './supabase.js';

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
                reject("CSV ফাইলটি সঠিক ফরম্যাটে নেই!");
            }
        };
        reader.onerror = () => reject("ফাইল পড়তে সমস্যা হয়েছে!");
        reader.readAsText(file);
    });
}

// ─── 1. ADD NEW EXAM (With Bulk CSV) ────────────────────────
window.handleAddExam = async function() {
    const user = checkAdminAccess();
    if (!user) return;

    const subject = document.getElementById('exam-subject').value.trim();
    const chapter = document.getElementById('exam-chapter').value.trim();
    const type = document.getElementById('exam-type').value;
    const csvFile = document.getElementById('exam-csv').files[0];
    const examBtn = document.getElementById('add-exam-btn');

    if (!subject || !chapter || !csvFile) {
        return showToast("সবগুলো তথ্য এবং CSV ফাইল দিতে হবে!", "error");
    }

    examBtn.innerText = "Processing...";
    examBtn.disabled = true;

    try {
        const questions = await processCSV(csvFile);
        const title = `${subject} - ${chapter} Exam`;
        
        // Supabase Insert
        const { data, error } = await supabase.from('exams').insert([{
            title: title,
            subject: subject,
            chapter: chapter,
            type: type,
            total_questions: questions.length,
            questions_data: questions, // JSONB হিসেবে সেভ হবে
            created_by: user.phone
        }]).select();

        if (error) throw error;
        
        showToast("✅ এক্সাম সফলভাবে তৈরি হয়েছে!", "success");
        
        // জেনারেট হওয়া এক্সাম লিংক কপি করার অপশন
        const examLink = `${window.location.origin}/#exam/${data[0].id}`;
        setTimeout(() => {
            prompt("এক্সাম লিংকটি কপি করে স্টুডেন্টদের দিন:", examLink);
        }, 500);

        // ফর্ম ক্লিয়ার করা
        document.getElementById('exam-subject').value = '';
        document.getElementById('exam-chapter').value = '';
        document.getElementById('exam-csv').value = '';

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
    const user = checkAdminAccess();
    if (!user) return;

    const subject = document.getElementById('class-subject').value.trim();
    const chapter = document.getElementById('class-chapter').value.trim();
    const title = document.getElementById('class-title').value.trim();
    const ytLink = document.getElementById('class-link').value.trim();
    const classBtn = document.getElementById('add-class-btn');

    if (!subject || !chapter || !title || !ytLink) {
        return showToast("সব তথ্য দিন!", "error");
    }

    classBtn.innerText = "Saving...";
    classBtn.disabled = true;

    const { error } = await supabase.from('classes').insert([{
        subject: subject,
        chapter: chapter,
        title: title,
        video_url: ytLink,
        added_by: user.phone
    }]);

    if (error) {
        showToast("ক্লাস সেভ করা যায়নি", "error");
    } else {
        showToast("✅ ক্লাস সফলভাবে যুক্ত হয়েছে!", "success");
        document.getElementById('class-title').value = '';
        document.getElementById('class-link').value = '';
    }
    
    classBtn.innerText = "Add Video Class";
    classBtn.disabled = false;
};

// ─── 3. ADD CQ (Creative Questions) ──────────────────────────
window.handleAddCQ = async function() {
    const user = checkAdminAccess();
    if (!user) return;

    const subject = document.getElementById('cq-subject').value.trim();
    const chapter = document.getElementById('cq-chapter').value.trim();
    const link = document.getElementById('cq-link').value.trim();
    const cqBtn = document.getElementById('add-cq-btn');

    if (!subject || !chapter || !link) {
        return showToast("সব তথ্য দিন!", "error");
    }

    cqBtn.innerText = "Saving...";
    cqBtn.disabled = true;

    const { error } = await supabase.from('cq_bank').insert([{
        subject: subject,
        chapter: chapter,
        pdf_link: link,
        added_by: user.phone
    }]);

    if (error) showToast("CQ সেভ করা যায়নি", "error");
    else {
        showToast("✅ CQ সফলভাবে যুক্ত হয়েছে!", "success");
        document.getElementById('cq-link').value = '';
    }

    cqBtn.innerText = "Add CQ / PDF Link";
    cqBtn.disabled = false;
};

// ─── 4. GRANT SUB-ADMIN (Super Admin Only) ──────────────────
window.grantSubAdmin = async function() {
    const user = checkAdminAccess();
    if (user.role !== 'admin') return; // শুধুমাত্র মেইন অ্যাডমিন পারবে

    const phone = document.getElementById('sub-admin-phone').value.trim();
    if (phone.length !== 11) return showToast("১১ ডিজিটের সঠিক নম্বর দিন", "error");

    // আগে চেক করবে ইউজার আছে কি না
    const { data: existUser, error: findErr } = await supabase.from('users').select('name').eq('phone', phone).maybeSingle();
    
    if (!existUser) {
        return showToast("এই নম্বরে কোনো স্টুডেন্ট নেই!", "error");
    }

    // সাব-অ্যাডমিন রোল আপডেট
    const { error: updateErr } = await supabase
        .from('users')
        .update({ role: 'sub-admin' })
        .eq('phone', phone);

    if (updateErr) {
        showToast("সাব-অ্যাডমিন বানানো যায়নি", "error");
    } else {
        showToast(`✅ ${existUser.name} কে সাব-অ্যাডমিন অ্যাক্সেস দেওয়া হয়েছে!`, "success");
        document.getElementById('sub-admin-phone').value = '';
    }
};

// ─── 5. UPDATE COUNTDOWN TIMER ───────────────────────────────
window.handleUpdateCountdown = async function() {
    const user = checkAdminAccess();
    if (!user) return;

    const mainTopic = document.getElementById('cd-set-main').value.trim();
    const subTopic = document.getElementById('cd-set-sub').value.trim();
    const targetDate = document.getElementById('cd-set-date').value; // HTML datetime-local input

    if (!mainTopic || !targetDate) {
        return showToast("Main Topic এবং Date সিলেক্ট করুন!", "error");
    }

    // ডাটাবেজে সেভ করা (Countdown নামের একটি সিঙ্গেল row টেবিলে)
    const { error } = await supabase.from('settings').update({
        countdown_topic: mainTopic,
        countdown_sub: subTopic,
        countdown_date: targetDate
    }).eq('id', 1); // Assuming row id 1 for settings

    if (error) showToast("কাউন্টডাউন আপডেট হয়নি", "error");
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
        const { error } = await supabase.from(tableName).delete().eq('id', id);
        if (error) showToast("ডিলিট করা যায়নি", "error");
        else {
            showToast("✅ সফলভাবে ডিলিট হয়েছে", "success");
            // Optional: Refresh list function here
        }
    }
};

// ─── RENDER FORMS ON PAGE LOAD ──────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // Add Exam Form
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
    }

    // Add Class Form
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

    // Add CQ Form
    const cqFormBox = document.getElementById('admin-cq-form');
    if(cqFormBox) {
        cqFormBox.innerHTML = `
            <div class="form-group"><label>Subject</label><input type="text" id="cq-subject" class="form-input"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Chapter / Type</label><input type="text" id="cq-chapter" class="form-input" placeholder="e.g. ক ভান্ডার"></div><div class="spacer-sm"></div>
            <div class="form-group"><label>Drive/PDF Link</label><input type="url" id="cq-link" class="form-input" placeholder="Google Drive Link"></div><div class="spacer-md"></div>
            <button class="btn-primary" id="add-cq-btn" onclick="handleAddCQ()">Add CQ / PDF Link</button>
        `;
    }
});
