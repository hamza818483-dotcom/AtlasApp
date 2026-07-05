/*
 * mulboi-mcq-admin.js
 * মূলবই (Main Book) PDF ও MCQ ব্যবস্থাপনা — AtlasPro থেকে অভিযোজিত, Supabase REST API ব্যবহার করে।
 * সব ফাংশন ও ভ্যারিয়েবল 'mb' prefix দিয়ে শুরু — admin.html এর অন্য কোডের সাথে কোনো conflict নেই।
 */

(function () {
'use strict';

// All AI calls (CSV-free MCQ generation, etc.) go through this single proxy
// worker — no provider API key ever lives in this file or admin.html.
const AI_PROXY_URL = 'https://atlas-ai-proxy.hamza818483.workers.dev/';

/* ════════════════════════════════════════════════════
   1. HELPERS
   ════════════════════════════════════════════════════ */

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fmtDate(s) {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return s; }
}

function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function mbToast(msg, type, dur) {
    const t = document.getElementById('toast');
    if (!t) return;
    const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--accent)' };
    t.textContent = msg;
    t.style.borderColor = colors[type] || colors.info;
    t.classList.add('show');
    clearTimeout(t._mbTimer);
    t._mbTimer = setTimeout(() => t.classList.remove('show'), dur || 3000);
}

/* ════════════════════════════════════════════════════
   2. SUPABASE REST API HELPER
   ════════════════════════════════════════════════════ */

async function mbApi(path, opts) {
    opts = opts || {};
    const url = window.SUPABASE_URL + '/rest/v1' + path;
    const headers = Object.assign({
        'apikey': window.SUPABASE_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }, opts.headers || {});
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    return res;
}

/* ════════════════════════════════════════════════════
   3. STATE
   ════════════════════════════════════════════════════ */

let mbSubjectId   = null;
let mbChapterId   = null;
let mbPdfId       = null;
let mbPdfFile     = null;
let mbPdfDoc      = null;
let mbPdfUrl       = null;  // current PDF's public URL, used to send the full PDF to Gemini for reliable MCQ generation
let mbCurrentPage = 1;
let mbAllPageData = [];
let mbAllPageDataAllTypes = []; // admin + user-generated সব types একসাথে — count summary এর জন্য
let mbEditingId   = null;
let mbAnswerKey   = null;
let mbTypeKey     = 'standard';
let mbAiTypeKey   = 'standard';

/* ════════════════════════════════════════════════════
   PERMANENT INTERNAL AI RULES — admin prompt-এর বাইরেও সবসময় প্রযোজ্য।
   এগুলো কখনো admin-এর কাস্টম prompt দিয়ে override হবে না; প্রতিটা
   MCQ-generation কলে শেষে append হয় যাতে AI অবশ্যই মেনে চলে।
   ════════════════════════════════════════════════════ */
const MB_PERMANENT_RULES = (
    `\n\nবাধ্যতামূলক নিয়ম (এগুলো সবসময় মেনে চলতে হবে, কোনো ব্যতিক্রম নয়):\n` +
    `১. গাণিতিক বা রাসায়নিক রাশি/সূত্র লেখার সময় সঠিকভাবে সাব-স্ক্রিপ্ট ও সুপার-স্ক্রিপ্ট ব্যবহার করো — ` +
    `যেমন x² (x^2 না), H₂O (H2O না), CO₂, x₁+x₂, a^n, এই ধরনের ইউনিকোড সাব/সুপারস্ক্রিপ্ট ক্যারেক্টার ব্যবহার করবে, ` +
    `সাধারণ সংখ্যা/অক্ষর দিয়ে লিখবে না।\n` +
    `২. প্রশ্ন বা ব্যাখ্যায় কখনো সোর্স-রেফারেন্স করে কথা বলবে না — অর্থাৎ "উল্লেখিত চিত্রে", "বক্সে", "ছকে", ` +
    `"উদ্দীপকে", "সারণিতে", "টপিকে", "পৃষ্ঠা নং এ দেখা যাচ্ছে", "বলা আছে", "উল্লেখ করা আছে", "লক্ষ করা যায়", ` +
    `"বর্ণনা আছে" — এই ধরনের কোনো বাক্যাংশ ব্যবহার করবে না। প্রশ্ন ও ব্যাখ্যা সবসময় স্বয়ংসম্পূর্ণ ও সরাসরি বিষয়বস্তু ` +
    `নিয়ে লিখতে হবে, কোনো উৎস/অবস্থান নির্দেশ করা যাবে না।\n` +
    `৩. ঠিক যত সংখ্যক প্রশ্ন চাওয়া হয়েছে, তার চেয়ে কম বা বেশি দেওয়া যাবে না — সংখ্যাটি অবশ্যই হুবহু মানতে হবে।`
);

// exp_box: এই MCQ যে টপিক/উদ্দীপক অংশ থেকে বানানো হয়েছে, সেই অংশের bounding box —
// উপরে ও নিচে কয়েক লাইন বেশি নিয়ে (buffer) — পুরো পেইজের সাপেক্ষে % (0-100) এককে।
// ক্লায়েন্ট সাইডে এই coords দিয়ে page canvas থেকে crop করে explanation image বানানো হয়।
const MB_EXP_BOX_RULE = (
    `\\n\\n৪. প্রতিটি প্রশ্নের জন্য \"exp_box\" নামে একটি object দিতে হবে যা নির্দেশ করে পেইজের ঠিক কোন অংশ (paragraph/topic) ` +
    `থেকে এই প্রশ্নটি বানানো হয়েছে। এটা আংশিক/partial crop হবে না — যে টপিক/উদ্দীপক/paragraph থেকে প্রশ্ন এসেছে তার ` +
    `শুরু থেকে শেষ পর্যন্ত সম্পূর্ণ অংশ (heading/title সহ যদি থাকে) কভার করতে হবে, যাতে একজন শিক্ষার্থী এই ছবি দেখে ` +
    `পুরো টপিকটাই পড়ে ফেলতে পারে — শুধু প্রশ্ন সম্পর্কিত এক-দুই লাইন না। উপরে টপিকের শুরু ও নিচে টপিকের শেষ পর্যন্ত পুরোটা ধরবে, ` +
    `সাথে আরও ১-২ লাইন সেফটি বাফার। এই object-এ চারটি key থাকবে: x, y, w, h — সবগুলো পুরো পেইজের width/height এর ` +
    `শতকরা হিসেবে (0 থেকে 100 এর মধ্যে সংখ্যা, % চিহ্ন ছাড়া)। x,y মানে বাম-উপরের কোণা, w,h মানে width ও height। ` +
    `একই টপিক/উদ্দীপক থেকে একাধিক প্রশ্ন বানানো হলে, সবগুলোর exp_box একই (পুরো টপিক কভার করা) হবে — এটাই সঠিক, আলাদা করার দরকার নেই।`
);

let mbCsvData     = [];
let mbAiData      = [];

/* ════════════════════════════════════════════════════
   14c. SPECIAL MODE — শুধু existing MCQ এক্সট্র্যাক্ট, নতুন কিছু বানায় না।
   Standard/TrueFalse/Hard এর MB_PERMANENT_RULES এখানে প্রযোজ্য না (কারণ ওটা
   নির্দিষ্ট count বাধ্যতামূলক করে) — এর বদলে আলাদা extraction-only rule সেট।
   ════════════════════════════════════════════════════ */
function mbSpecialExtractPrompt() {
    const jsonFormat = `[{"question":"...","option_k":"...","option_kh":"...","option_g":"...","option_gh":"...","correct":"k","explanation":"...","exp_box":{"x":0,"y":0,"w":0,"h":0},"type":"special"}]`;
    return (
        `তুমি একজন নিখুঁত ডেটা-এক্সট্র্যাকশন এক্সপার্ট। তোমার কাজ শুধুমাত্র এই পেইজে ইতিমধ্যে ছাপা/লেখা MCQ প্রশ্নগুলো ` +
        `হুবহু এক্সট্র্যাক্ট করা — নতুন কোনো MCQ কখনোই বানাবে না।\n\n` +
        `কঠোর নিয়ম:\n` +
        `১. পেইজে যতগুলো MCQ (প্রশ্ন + অপশন) ইতিমধ্যে ছাপা আছে, ঠিক ততগুলোই ফেরত দিবে — এক্সট্রা যোগ করবে না, বাদও দিবে না।\n` +
        `২. পেইজে যদি একটাও MCQ না থাকে, একটা খালি JSON array [] রিটার্ন করবে — কোনো MCQ বানিয়ে দিবে না।\n` +
        `৩. প্রশ্নের টেক্সট ও অপশনগুলো পেইজে যেভাবে লেখা ঠিক সেভাবেই (ভাষা অপরিবর্তিত রেখে) নিবে, নিজের মতো ঘুরিয়ে লিখবে না।\n` +
        `৪. সঠিক উত্তর যদি পেইজে চিহ্নিত/উল্লেখ করা থাকে সেটাই "correct" এ বসাবে (k/kh/g/gh)। উল্লেখ না থাকলে বিষয়বস্তু বিশ্লেষণ করে সঠিক উত্তর নির্ধারণ করবে।\n` +
        `৫. ব্যাখ্যা (explanation) নির্ধারণের নিয়ম — এই ক্রম অনুসারে:\n` +
        `   ক) MCQ-র ঠিক নিচে যদি ব্যাখ্যা লেখা থাকে, সেটাই হুবহু ১০০% কপি করবে (পরিবর্তন করবে না)।\n` +
        `   খ) সরাসরি ব্যাখ্যা না থাকলেও পেইজে MCQ-সম্পর্কিত তথ্য থাকলে সেই তথ্য থেকে ব্যাখ্যা তৈরি করবে।\n` +
        `   গ) পেইজে একেবারেই কোনো তথ্য না থাকলে, তুমি নিজে সবচেয়ে প্রাসঙ্গিক ও সঠিক ব্যাখ্যা লিখবে — কেন সঠিক অপশনটি সঠিক এবং বাকি অপশনগুলো কেন ভুল, তা সংক্ষেপে বলবে।\n` +
        `৬. গাণিতিক/রাসায়নিক রাশি লেখার সময় সঠিক সাব/সুপারস্ক্রিপ্ট ইউনিকোড ব্যবহার করবে (x², H₂O ইত্যাদি), সাধারণ সংখ্যা দিয়ে লিখবে না।\n` +
        `৭. প্রশ্ন বা ব্যাখ্যায় কখনো "উল্লেখিত চিত্রে", "বক্সে", "উদ্দীপকে", "পৃষ্ঠায়" জাতীয় সোর্স-রেফারেন্স বাক্য ব্যবহার করবে না — স্বয়ংসম্পূর্ণ রাখবে।\n` +
        `৮. এটাই সবচেয়ে গুরুত্বপূর্ণ নিয়ম: তুমি একজন এক্সট্র্যাক্টর, জেনারেটর নও — কোনো অবস্থাতেই নিজের থেকে নতুন প্রশ্ন কল্পনা করে বানাবে না।\n` +
        `৯. প্রতিটি প্রশ্নের জন্য "exp_box" object দিবে — যে টপিক/উদ্দীপক/paragraph থেকে প্রশ্নটি নেওয়া হয়েছে তার শুরু থেকে শেষ পর্যন্ত সম্পূর্ণ অংশের bounding box (partial না, পুরো টপিক), সাথে ১-২ লাইন সেফটি বাফার, পুরো পেইজের সাপেক্ষে শতকরা (0-100) হিসেবে {x,y,w,h}।\n\n` +
        `শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দিবে, অন্য কোনো লেখা/markdown/backtick ছাড়া:\n${jsonFormat}`
    );
}

// একটা প্রশ্নের option_k/kh/g/gh shuffle করে, correct key ঠিক রেখে আপডেট করে
function mbShuffleSpecialOptions(m) {
    const keys = ['k', 'kh', 'g', 'gh'];
    const opts = keys.map(k => ({ v: m['option_' + k] || '', key: k }));
    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const newCorrect = opts.find(o => o.key === m.correct);
    const remapped = { ...m };
    keys.forEach((k, i) => { remapped['option_' + k] = opts[i].v; });
    remapped.correct = keys[opts.findIndex(o => o.key === m.correct)];
    return remapped;
}

// একটা পেইজ থেকে শুধু existing MCQ এক্সট্র্যাক্ট করে — retry + reliability check সহ।
// রেজাল্ট খালি [] হলে অর্থ পেইজে সত্যিই কোনো MCQ নেই (silently skip, error না)।
async function mbSpecialExtractPage(pageNum) {
    const jsonFormat = `[{"question":"...","option_k":"...","option_kh":"...","option_g":"...","option_gh":"...","correct":"k","explanation":"...","exp_box":{"x":0,"y":0,"w":0,"h":0},"type":"special"}]`;
    const basePrompt = mbSpecialExtractPrompt();
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            let rawJson;
            let geminiAlreadyTried = false; // এই page-এ Gemini PDF-native ইতিমধ্যে চেষ্টা হয়েছে কি না —
                                              // fallback chain-এ আবার Gemini কল করে quota নষ্ট না করার জন্য
            if (mbPdfUrl) {
                try {
                    const pdfPrompt = `এই PDF-এর পেইজ ${pageNum} দেখো এবং নিচের নির্দেশ অনুসরণ করো:\n${basePrompt}`;
                    const res = await fetch(AI_PROXY_URL.replace(/\/$/, '') + '/mcq-from-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pdf_url: mbPdfUrl, prompt: pdfPrompt })
                    });
                    geminiAlreadyTried = true; // এই কল Gemini-ই ব্যবহার করে (PDF-native একমাত্র Gemini করতে পারে)
                    const data = await res.json().catch(() => null);
                    if (res.ok && data?.success && data.answer) rawJson = data.answer;
                } catch (_) {}
            }
            if (!rawJson) {
                const page = await mbPdfDoc.getPage(pageNum);
                const textCont = await page.getTextContent();
                const pageText = textCont.items.map(i => i.str).join(' ').trim();
                if (pageText && pageText.length >= 30) {
                    rawJson = await mbCallAiApi(`নিচের টেক্সট থেকে ${basePrompt}\n\nটেক্সট:\n${pageText.slice(0, 8000)}`, null, null, geminiAlreadyTried);
                } else {
                    const vp = page.getViewport({ scale: 1.5 });
                    const tmp = document.createElement('canvas');
                    tmp.width = vp.width; tmp.height = vp.height;
                    await page.render({ canvasContext: tmp.getContext('2d'), viewport: vp }).promise;
                    const imageData = { base64: tmp.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
                    rawJson = await mbCallAiApi('', imageData, `তুমি একজন নিখুঁত ডেটা-এক্সট্র্যাকশন এক্সপার্ট। ${basePrompt}`, geminiAlreadyTried);
                }
            }
            const parsed = mbParseAiJson(rawJson);
            if (parsed && parsed.length) return parsed; // পাওয়া গেছে — নিশ্চিত
            if (parsed && parsed.length === 0 && attempt === 1) continue; // প্রথমবার খালি এলে একবার রি-চেক
            return []; // দ্বিতীয়বারও খালি → পেইজে সত্যিই কোনো MCQ নেই
        } catch (_) {
            if (attempt === MAX_ATTEMPTS) return [];
        }
    }
    return [];
}

/* ════════════════════════════════════════════════════
   4. SUBJECT / CHAPTER CASCADE
   ════════════════════════════════════════════════════ */

async function mbLoadSubjects() {
    const sel = document.getElementById('mbSelSubject');
    if (!sel) return;
    try {
        const res = await mbApi('/book_subjects?select=id,name,icon&order=sort_order.asc,created_at.asc&limit=200');
        if (!res.ok) throw new Error();
        const rows = await res.json();
        const curVal = sel.value;
        sel.innerHTML = '<option value="">-- বিষয় বেছে নিন --</option>';
        (rows || []).forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = (s.icon || '') + ' ' + s.name;
            sel.appendChild(o);
        });
        if (curVal) sel.value = curVal;
    } catch {
        mbToast('বিষয় লোড ব্যর্থ', 'error');
    }
}

async function mbOnSubjectChange() {
    mbSubjectId = document.getElementById('mbSelSubject').value || null;
    mbChapterId = null;
    const chSel = document.getElementById('mbSelChapter');
    chSel.innerHTML = '<option value="">-- অধ্যায় বেছে নিন --</option>';
    chSel.disabled = true;
    mbHideUploadAndList();
    mbUpdateContext();
    if (!mbSubjectId) return;
    try {
        const res = await mbApi('/book_chapters?subject_id=eq.' + mbSubjectId + '&order=sort_order.asc,created_at.asc&limit=200');
        if (!res.ok) throw new Error();
        const rows = await res.json();
        (rows || []).forEach(ch => {
            const o = document.createElement('option');
            o.value = ch.id;
            o.textContent = ch.name;
            chSel.appendChild(o);
        });
        chSel.disabled = false;
    } catch {
        mbToast('অধ্যায় লোড ব্যর্থ', 'error');
    }
}

async function mbOnChapterChange() {
    mbChapterId = document.getElementById('mbSelChapter').value || null;
    mbUpdateContext();
    if (!mbChapterId) { mbHideUploadAndList(); return; }
    mbShowUploadAndList();
    mbLoadChapterPdfs();
}

function mbHideUploadAndList() {
    const u = document.getElementById('mbUploadSection');
    const l = document.getElementById('mbPdfListSection');
    if (u) u.style.display = 'none';
    if (l) l.style.display = 'none';
}

function mbShowUploadAndList() {
    const u = document.getElementById('mbUploadSection');
    const l = document.getElementById('mbPdfListSection');
    if (u) u.style.display = 'block';
    if (l) l.style.display = 'block';
}

function mbUpdateContext() {
    const ctx = document.getElementById('mbSelectedContext');
    if (!ctx) return;
    const subName = mbGetSubjectName();
    const chName  = mbGetChapterName();
    if (subName && chName) {
        ctx.innerHTML = '📚 ' + esc(subName) + ' &gt; 📖 ' + esc(chName);
        ctx.style.display = 'block';
    } else {
        ctx.style.display = 'none';
    }
}

function mbGetSubjectName() {
    const sel = document.getElementById('mbSelSubject');
    if (!sel || sel.selectedIndex <= 0) return '';
    return sel.options[sel.selectedIndex].textContent.trim();
}

function mbGetChapterName() {
    const sel = document.getElementById('mbSelChapter');
    if (!sel || sel.selectedIndex <= 0) return '';
    return sel.options[sel.selectedIndex].textContent.trim();
}

function mbToggleNewSubject() {
    const box = document.getElementById('mbNewSubjectBox');
    if (!box) return;
    box.classList.toggle('show');
    if (box.classList.contains('show')) {
        const inp = document.getElementById('mbNewSubjectName');
        if (inp) inp.focus();
    } else {
        document.getElementById('mbNewSubjectName').value = '';
    }
}

async function mbCreateSubject() {
    const name = document.getElementById('mbNewSubjectName').value.trim();
    const icon = '📚'; // icon picker বাদ দেওয়া হয়েছে — fixed default ব্যবহার হবে
    if (!name) { mbToast('বিষয়ের নাম লিখুন', 'error'); return; }
    try {
        const res = await mbApi('/book_subjects', {
            method: 'POST',
            body: JSON.stringify({ name, icon, description: '', sort_order: 0 })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'ব্যর্থ');
        }
        const data = await res.json();
        mbToast('✓ বিষয় যোগ হয়েছে', 'success');
        mbToggleNewSubject();
        await mbLoadSubjects();
        const newId = Array.isArray(data) ? data[0]?.id : data?.id;
        if (newId) {
            document.getElementById('mbSelSubject').value = newId;
            await mbOnSubjectChange();
        }
    } catch (e) {
        mbToast('সমস্যা: ' + e.message, 'error');
    }
}

function mbToggleNewChapter() {
    const box = document.getElementById('mbNewChapterBox');
    if (!box) return;
    box.classList.toggle('show');
    if (box.classList.contains('show')) {
        const inp = document.getElementById('mbNewChapterName');
        if (inp) inp.focus();
    } else {
        document.getElementById('mbNewChapterName').value = '';
    }
}

async function mbCreateChapter() {
    if (!mbSubjectId) { mbToast('আগে বিষয় নির্বাচন করুন', 'error'); return; }
    const name = document.getElementById('mbNewChapterName').value.trim();
    if (!name) { mbToast('অধ্যায়ের নাম লিখুন', 'error'); return; }
    try {
        const res = await mbApi('/book_chapters', {
            method: 'POST',
            body: JSON.stringify({ subject_id: parseInt(mbSubjectId), name, sort_order: 0 })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'ব্যর্থ');
        }
        const data = await res.json();
        mbToast('✓ অধ্যায় যোগ হয়েছে', 'success');
        mbToggleNewChapter();
        const savedSubId = mbSubjectId;
        const newId = Array.isArray(data) ? data[0]?.id : data?.id;
        // Reload chapters dropdown
        const chRes = await mbApi('/book_chapters?subject_id=eq.' + savedSubId + '&order=sort_order.asc,created_at.asc&limit=200');
        const chRows = await chRes.json();
        const chSel = document.getElementById('mbSelChapter');
        chSel.innerHTML = '<option value="">-- অধ্যায় বেছে নিন --</option>';
        (chRows || []).forEach(ch => {
            const o = document.createElement('option');
            o.value = ch.id; o.textContent = ch.name;
            chSel.appendChild(o);
        });
        chSel.disabled = false;
        if (newId) {
            chSel.value = newId;
            mbChapterId = String(newId);
            await mbOnChapterChange();
        }
    } catch (e) {
        mbToast('ত্রুটি: ' + e.message, 'error');
    }
}

/* ════════════════════════════════════════════════════
   5. PDF UPLOAD
   ════════════════════════════════════════════════════ */

function mbDzOver(e) {
    e.preventDefault();
    document.getElementById('mbDropZone').classList.add('dragover');
}
function mbDzLeave() {
    document.getElementById('mbDropZone').classList.remove('dragover');
}
function mbDzDrop(e) {
    e.preventDefault();
    document.getElementById('mbDropZone').classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') mbSetFile(f);
    else mbToast('শুধু PDF ফাইল গ্রহণযোগ্য', 'error');
}
function mbOnFileSelect(e) {
    if (e.target.files[0]) mbSetFile(e.target.files[0]);
}
function mbSetFile(f) {
    mbPdfFile = f;
    const fc = document.getElementById('mbFileChosen');
    if (fc) { fc.textContent = '✓ ' + f.name; fc.style.display = 'block'; }
    const titleEl = document.getElementById('mbPdfTitle');
    if (titleEl && !titleEl.value) titleEl.value = f.name.replace(/\.pdf$/i, '');
}

async function mbUploadPdf() {
    if (!mbChapterId) { mbToast('অধ্যায় নির্বাচন করুন', 'error'); return; }
    if (!mbPdfFile)   { mbToast('PDF ফাইল নির্বাচন করুন', 'error'); return; }
    const title = (document.getElementById('mbPdfTitle').value || '').trim();
    if (!title)       { mbToast('শিরোনাম লিখুন', 'error'); return; }

    const btn = document.getElementById('mbUploadBtn');
    const pw  = document.getElementById('mbProgressWrap');
    const pf  = document.getElementById('mbProgressFill');
    const pl  = document.getElementById('mbProgressLabel');
    const us  = document.getElementById('mbUploadSuccess');

    btn.disabled = true;
    btn.textContent = 'আপলোড হচ্ছে...';
    if (pw) pw.style.display = 'block';
    if (pf) pf.style.width = '0%';
    if (us) us.style.display = 'none';

    try {
        // Upload PDF file to Supabase Storage
        if (pl) pl.textContent = 'PDF আপলোড হচ্ছে...';
        const fileName = Date.now() + '_' + mbPdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', window.SUPABASE_URL + '/storage/v1/object/pdfs/' + fileName);
            xhr.setRequestHeader('apikey', window.SUPABASE_KEY);
            xhr.setRequestHeader('Authorization', 'Bearer ' + window.SUPABASE_KEY);
            xhr.setRequestHeader('x-upsert', 'true');
            xhr.upload.onprogress = ev => {
                if (ev.lengthComputable && pf) {
                    const pct = Math.round(ev.loaded / ev.total * 90);
                    pf.style.width = pct + '%';
                    if (pl) pl.textContent = 'আপলোড হচ্ছে... ' + pct + '%';
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else {
                    try { reject(new Error(JSON.parse(xhr.responseText).error || 'আপলোড ব্যর্থ')); }
                    catch { reject(new Error('আপলোড ব্যর্থ (' + xhr.status + ')')); }
                }
            };
            xhr.onerror = () => reject(new Error('নেটওয়ার্ক ত্রুটি'));
            xhr.send(mbPdfFile);
        });

        const fileUrl = window.SUPABASE_URL + '/storage/v1/object/public/pdfs/' + fileName;

        // Create PDF record in database
        if (pl) pl.textContent = 'রেকর্ড সংরক্ষণ করছে...';
        if (pf) pf.style.width = '95%';

        const dbRes = await mbApi('/book_pdfs', {
            method: 'POST',
            body: JSON.stringify({
                chapter_id: parseInt(mbChapterId),
                title,
                file_url:   fileUrl,
                page_count: 0,
                is_premium: false,
                sort_order: 0
            })
        });
        if (!dbRes.ok) {
            const err = await dbRes.json();
            throw new Error(err.message || 'DB রেকর্ড তৈরি ব্যর্থ');
        }

        if (pf) pf.style.width = '100%';
        if (us) us.style.display = 'block';
        mbToast('✓ PDF আপলোড সম্পন্ন — OCR শুরু হচ্ছে...', 'success');

        // Get new PDF id for OCR
        const newPdfData = await dbRes.json();
        const newPdfId = Array.isArray(newPdfData) ? newPdfData[0]?.id : newPdfData?.id;

        mbPdfFile = null;
        const fc = document.getElementById('mbFileChosen');
        if (fc) fc.style.display = 'none';
        document.getElementById('mbPdfTitle').value = '';
        document.getElementById('mbPdfFileInput').value = '';
        setTimeout(() => { if (us) us.style.display = 'none'; }, 3000);

        mbLoadChapterPdfs();
        mbLoadAllPdfs();

    } catch (e) {
        mbToast('আপলোড ব্যর্থ: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'আপলোড করো';
        setTimeout(() => { if (pw) pw.style.display = 'none'; }, 2000);
    }
}

/* ════════════════════════════════════════════════════
   6. PDF LISTS
   ════════════════════════════════════════════════════ */

async function mbLoadChapterPdfs() {
    if (!mbChapterId) return;
    const listEl = document.getElementById('mbPdfList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="skeleton skel-row"></div><div class="skeleton skel-sm"></div>';
    try {
        const res = await mbApi('/book_pdfs?chapter_id=eq.' + mbChapterId + '&order=sort_order.asc,created_at.desc&limit=100');
        if (!res.ok) throw new Error();
        const pdfs = await res.json();
        mbRenderChapterPdfs(pdfs || []);
    } catch {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">লোড ব্যর্থ</div><button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="mbLoadChapterPdfs()">পুনরায় চেষ্টা</button></div>';
    }
}

function mbRenderChapterPdfs(pdfs) {
    const listEl = document.getElementById('mbPdfList');
    if (!listEl) return;
    if (!pdfs.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">কোনো PDF নেই</div><div class="empty-state-text">উপরে PDF আপলোড করুন</div></div>';
        return;
    }
    listEl.innerHTML = pdfs.map(p => `
        <div class="pdf-card" id="mbpdf-${p.id}">
            <div class="pdf-card-top">
                <div class="pdf-card-icon">📕</div>
                <div class="pdf-card-info">
                    <div class="pdf-card-title">${esc(p.title)}</div>
                    <div class="pdf-card-meta">${p.file_size ? fmtSize(p.file_size) + ' · ' : ''}${p.page_count ? p.page_count + ' পৃষ্ঠা · ' : ''}${fmtDate(p.created_at)}</div>
                </div>
                <div class="pdf-card-actions">
                    <button class="act-btn act-edit" title="MCQ সম্পাদনা" onclick="mbOpenMcqPanel(${p.id}, '${esc(p.title)}', '${esc(p.file_url)}')">📝</button>
                    <button class="act-btn act-delete" title="মুছুন" onclick="mbDeletePdf(${p.id}, '${esc(p.title)}')">🗑️</button>
                </div>
            </div>
        </div>`).join('');
}

async function mbLoadAllPdfs() {
    const listEl = document.getElementById('mbAllPdfsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="skeleton skel-row"></div><div class="skeleton skel-sm"></div>';
    let pdfs = [];
    try {
        const res = await mbApi('/book_pdfs?select=*,book_chapters(name,book_subjects(name,icon))&order=created_at.desc&limit=100');
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error('mbLoadAllPdfs: /book_pdfs failed', res.status, errText);
            throw new Error('status ' + res.status);
        }
        pdfs = await res.json();
    } catch (e) {
        console.error('mbLoadAllPdfs failed:', e);
        listEl.innerHTML = '<div class="empty-state">লোড ব্যর্থ</div>';
        return;
    }
    try {
        mbRenderAllPdfs(pdfs || []);
    } catch (e) {
        console.error('mbRenderAllPdfs failed:', e);
        listEl.innerHTML = '<div class="empty-state">লোড ব্যর্থ</div>';
    }
}

function mbRenderAllPdfs(pdfs) {
    const listEl = document.getElementById('mbAllPdfsList');
    if (!listEl) return;
    if (!pdfs.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-title">কোনো PDF নেই</div></div>';
        return;
    }
    listEl.innerHTML = pdfs.map(p => {
        try {
            const ch  = p.book_chapters || {};
            const sub = ch.book_subjects || {};
            const ctx = (sub.name && ch.name)
                ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${esc(sub.icon||'')} ${esc(sub.name)} &gt; ${esc(ch.name)}</div>`
                : '';
            return `
            <div class="pdf-card">
                <div class="pdf-card-top">
                    <div class="pdf-card-icon">📕</div>
                    <div class="pdf-card-info">
                        <div class="pdf-card-title">${esc(p.title)}</div>
                        <div class="pdf-card-meta">${p.file_size ? fmtSize(p.file_size) + ' · ' : ''}${p.page_count ? p.page_count + ' পৃষ্ঠা · ' : ''}${fmtDate(p.created_at)}</div>
                        ${ctx}
                    </div>
                    <div class="pdf-card-actions">
                        <button class="act-btn act-toggle" title="${p.is_premium ? 'Free করো' : 'Premium করো'}" onclick="mbTogglePremium(${p.id}, ${!p.is_premium})">${p.is_premium ? '⭐' : '🔓'}</button>
                        <button class="act-btn act-edit" title="MCQ সম্পাদনা" onclick="mbOpenMcqPanel(${p.id}, '${esc(p.title)}', '${esc(p.file_url)}')">📝</button>
                        <button class="act-btn act-delete" title="মুছুন" onclick="mbDeletePdf(${p.id}, '${esc(p.title)}')">🗑️</button>
                    </div>
                </div>
            </div>`;
        } catch (e) {
            console.error('PDF card render failed for id', p && p.id, e);
            return '';
        }
    }).join('');
}

async function mbTogglePremium(pdfId, newState) {
    try {
        await mbApi('/book_pdfs?id=eq.' + pdfId, {
            method: 'PATCH',
            body: JSON.stringify({ is_premium: newState })
        });
        mbToast(newState ? '⭐ Premium করা হয়েছে' : '🔓 Free করা হয়েছে', 'success');
        mbLoadAllPdfs();
    } catch {
        mbToast('আপডেট ব্যর্থ', 'error');
    }
}

async function mbDeletePdf(id, title) {
    if (!confirm('"' + title + '" মুছে ফেলবেন? এই PDF এর সব MCQ ও ডেটা মুছে যাবে।')) return;
    try {
        await mbApi('/book_pdfs?id=eq.' + id, { method: 'DELETE' });
        mbToast('✓ PDF মুছে গেছে', 'success');
        mbLoadChapterPdfs();
        mbLoadAllPdfs();
    } catch {
        mbToast('মুছতে ব্যর্থ', 'error');
    }
}

/* ════════════════════════════════════════════════════
   7. MCQ PANEL — OPEN / CLOSE
   ════════════════════════════════════════════════════ */

function mbOpenMcqPanel(pdfId, pdfTitle, pdfUrl) {
    mbPdfId       = pdfId;
    mbCurrentPage = 1;
    mbPdfDoc      = null;
    mbAllPageData = [];
    mbEditingId   = null;
    mbAnswerKey   = null;
    mbTypeKey     = 'standard';
    mbAiData      = [];
    mbCsvData     = [];

    const titleEl = document.getElementById('mbMcqPanelTitle');
    if (titleEl) titleEl.textContent = pdfTitle + ' — MCQ সম্পাদনা';

    const ctxEl = document.getElementById('mbMcqPanelContext');
    const subName = mbGetSubjectName();
    const chName  = mbGetChapterName();
    if (ctxEl) {
        if (subName && chName) {
            ctxEl.innerHTML = '📕 ' + esc(pdfTitle) + ' &nbsp;|&nbsp; 📚 ' + esc(subName) + ' › 📖 ' + esc(chName);
            ctxEl.style.display = 'block';
        } else {
            ctxEl.style.display = 'none';
        }
    }

    const pi = document.getElementById('mbPageInput');
    if (pi) pi.value = 1;

    mbResetMcqForm();
    mbSwitchTab('manual');

    const panel = document.getElementById('mbMcqPanel');
    if (panel) {
        panel.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    const ml = document.getElementById('mbMcqList');
    if (ml) ml.innerHTML = '';

    const ps = document.getElementById('mbPageSummary');
    if (ps) ps.innerHTML = '';

    mbUpdatePageCount();

    // Refresh দিলেও একই PDF/page-এ ফিরে আসার জন্য সংরক্ষণ করা হচ্ছে —
    // একই PDF আগে থেকেই খোলা থাকলে তার page number বজায় রাখা হয় (overwrite করা হয় না)
    try {
        const prevSt = JSON.parse(localStorage.getItem('atlasMbOpenPanel') || 'null');
        const keepPage = (prevSt && prevSt.pdfId === pdfId && prevSt.page) ? prevSt.page : 1;
        localStorage.setItem('atlasMbOpenPanel', JSON.stringify({ pdfId, pdfTitle, pdfUrl, page: keepPage }));
    } catch (_) {}

    mbLoadAllPageMcqs().then(() => {
        // mbPdfDoc তখনো load না-ও হয়ে থাকতে পারে (mbLoadPdfPreview আলাদা async call,
        // নিচে শুরু হয়) — তাই এখানে render করলে numPages=0/stale অবস্থায় pill count
        // ভুল (কম) দেখাতে পারে। PDF doc load হয়ে গেলে mbLoadPdfPreview নিজেই আবার
        // mbRenderPageSummary() call করবে সঠিক numPages সহ।
        if (mbPdfDoc) mbRenderPageSummary();
        mbRenderPageMcqList();
        mbUpdatePageCount();
    });

    if (pdfUrl) mbLoadPdfPreview(pdfUrl);
}

function mbCloseMcqPanel() {
    const panel = document.getElementById('mbMcqPanel');
    if (panel) panel.classList.remove('open');
    document.body.style.overflow = '';
    mbPdfId = null;
    mbPdfDoc = null;
    mbAllPageData = [];
    try { localStorage.removeItem('atlasMbOpenPanel'); } catch (_) {}
    const canvas = document.getElementById('mbPreviewCanvas');
    if (canvas) {
        try {
            const ctx2d = canvas.getContext('2d');
            ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        } catch {}
        canvas.width = 0;
        canvas.height = 0;
    }
    const ps = document.getElementById('mbPageSummary');
    if (ps) ps.innerHTML = '';
}

/* ════════════════════════════════════════════════════
   8. PDF.JS PAGE PREVIEW
   ════════════════════════════════════════════════════ */

async function mbLoadPdfPreview(url) {
    mbPdfUrl = url;
    const loadingEl = document.getElementById('mbPreviewLoading');
    if (loadingEl) loadingEl.classList.add('show');
    try {
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        // cMapUrl/cMapPacked যোগ করা হয়েছে — আগে এটা ছিল না বলে বাংলা/জটিল ফন্টের পেইজে
        // pdf.js glyph তথ্য খুঁজতে গিয়ে ধীরগতিতে fallback করত, যেটাই "১০ সেকেন্ড পর আসে"
        // সমস্যার একটা বড় কারণ ছিল। study.html (user side)-এ আগে থেকেই এই কনফিগ আছে।
        mbPdfDoc = await pdfjsLib.getDocument({
            url,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
        }).promise;
        const pi = document.getElementById('mbPageInput');
        if (pi) pi.max = mbPdfDoc.numPages;
        // mbPdfDoc.numPages এখন জানা গেছে — তাই page pills সাথে সাথেই দেখানো যাবে।
        // আগে শুধু page switch করলে mbRenderPageSummary() পুনরায় কল হতো বলে pills
        // প্রথমবারে আসতো না (numPages তখনো অজানা থাকায় খালি render হতো)।
        mbRenderPageSummary();
        await mbRenderPdfPage(mbCurrentPage);
    } catch (e) {
        if (loadingEl) loadingEl.classList.remove('show');
        console.warn('PDF preview failed:', e);
    }
}

async function mbRenderPdfPage(pageNum) {
    if (!mbPdfDoc) return;
    if (pageNum < 1 || pageNum > mbPdfDoc.numPages) return;
    mbCurrentPage = pageNum;

    const pi = document.getElementById('mbPageInput');
    if (pi) pi.value = pageNum;

    const loadingEl = document.getElementById('mbPreviewLoading');
    if (loadingEl) loadingEl.classList.add('show');

    try {
        const page    = await mbPdfDoc.getPage(pageNum);
        const canvas  = document.getElementById('mbPreviewCanvas');
        if (!canvas) return;
        const vp      = page.getViewport({ scale: 1.5 });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch (e) {
        console.warn('Page render failed:', e);
    } finally {
        if (loadingEl) loadingEl.classList.remove('show');
    }
}

function mbPageStep(delta) {
    const cur = parseInt((document.getElementById('mbPageInput') || {}).value) || mbCurrentPage;
    const next = Math.max(1, cur + delta);
    if (mbPdfDoc && next > mbPdfDoc.numPages) return;
    mbCurrentPage = next;
    const pi = document.getElementById('mbPageInput');
    if (pi) pi.value = next;
    mbResetMcqForm();
    mbRenderPdfPage(next);
    mbRenderPageMcqList();
    mbUpdatePageCount();
    mbRenderPageSummary();
}

function mbOnPageChange() {
    const pi = document.getElementById('mbPageInput');
    if (!pi) return;
    let n = parseInt(pi.value) || 1;
    if (n < 1) n = 1;
    if (mbPdfDoc && n > mbPdfDoc.numPages) n = mbPdfDoc.numPages;
    pi.value = n;
    mbCurrentPage = n;
    mbResetMcqForm();
    mbRenderPdfPage(n);
    mbRenderPageMcqList();
    mbUpdatePageCount();
    mbRenderPageSummary();
}

/* ════════════════════════════════════════════════════
   9. PAGE SUMMARY PILLS
   ════════════════════════════════════════════════════ */

function mbRenderPageSummary() {
    const wrap = document.getElementById('mbPageSummary');
    if (!wrap) return;

    // Build page→count map from ALL MCQ rows (admin + user-generated standard/true_false/hard)
    const pageCounts = {};
    const pageTypeCounts = {}; // {pageNum: {admin:3, standard:5, true_false:2, hard:1}}
    mbAllPageDataAllTypes.forEach(row => {
        try {
            const qs = JSON.parse(row.questions_json || '[]');
            pageCounts[row.page_number] = (pageCounts[row.page_number] || 0) + qs.length;
            if (!pageTypeCounts[row.page_number]) pageTypeCounts[row.page_number] = {};
            pageTypeCounts[row.page_number][row.mcq_type] = qs.length;
        } catch {}
    });
    window._mbPageTypeCounts = pageTypeCounts; // অন্য জায়গা থেকে access করার জন্য

    // Total pages = max of (pages with MCQs, currentPage, numPages from PDF.js) capped at 50
    const maxFromMcqs = Object.keys(pageCounts).length ? Math.max(...Object.keys(pageCounts).map(Number)) : 0;
    const numPdfPages = mbPdfDoc ? mbPdfDoc.numPages : 0;
    // bug fix: আগে totalPages কে হার্ডকোড 50 তে cap করা ছিল, ফলে ৫০+ পেইজের PDF (যেমন ৬৭ পেইজ)
    // এ শেষের পেইজগুলোর pill কখনোই দেখাতো না। এখন pure PDF page count ব্যবহার হচ্ছে, কোনো cap নেই।
    const totalPages = Math.max(maxFromMcqs, mbCurrentPage, numPdfPages, 1);

    if (totalPages <= 1 && !Object.keys(pageCounts).length) { wrap.innerHTML = ''; return; }

    const typeLabel = { admin:'Manual', standard:'Standard', true_false:'সত্য/মিথ্যা', hard:'Hard' };
    // বর্তমানে চলমান bulk job থাকলে কোন পেইজে এখন কাজ চলছে সেটা জেনে নাও — pill rebuild হলেও highlight টিকে থাকার জন্য
    let bulkActivePage = null;
    try {
        const bj = JSON.parse(localStorage.getItem(MB_BULK_KEY) || 'null');
        if (bj && !bj.done && !bj.stopped && bj.pdfId === mbPdfId) bulkActivePage = bj.currentPage;
    } catch (_) {}

    let html = '';
    for (let p = 1; p <= totalPages; p++) {
        const cnt      = pageCounts[p] || 0;
        const isActive = p === mbCurrentPage;
        const isBulkWorking = p === bulkActivePage;
        const hasMcqs  = cnt > 0;
        const tc = pageTypeCounts[p] || {};
        const breakdown = Object.keys(tc).map(t => `${typeLabel[t]||t}: ${tc[t]}`).join(', ') || 'কোনো MCQ নেই';
        html += `<button onclick="mbGoToPagePill(${p})" id="mbPill-${p}" title="${breakdown}" class="${isBulkWorking ? 'mb-pill-active-bulk' : ''}" style="
            padding:3px 9px;border-radius:20px;
            border:1.5px solid ${isActive ? 'var(--accent)' : hasMcqs ? 'rgba(108,99,255,0.35)' : 'var(--border)'};
            background:${isActive ? 'var(--accent)' : hasMcqs ? 'rgba(108,99,255,0.08)' : 'var(--card)'};
            color:${isActive ? '#fff' : hasMcqs ? '#9C8BFF' : 'var(--text3)'};
            font-size:11px;font-weight:700;cursor:pointer;
            display:inline-flex;align-items:center;gap:3px;transition:all 0.2s;font-family:inherit">
            P${p}<span style="background:rgba(255,255,255,0.22);border-radius:8px;padding:0 4px;font-size:9px">${cnt}</span>
        </button>`;
    }
    wrap.innerHTML = html;
}

function mbHighlightActivePill() {
    document.querySelectorAll('[id^="mbPill-"]').forEach(btn => {
        const p = parseInt(btn.id.replace('mbPill-', ''));
        const isActive = p === mbCurrentPage;
        btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        btn.style.background  = isActive ? 'var(--accent)' : 'var(--card)';
        btn.style.color       = isActive ? '#fff' : 'var(--text2)';
    });
}

function mbGoToPagePill(p) {
    mbCurrentPage = p;
    try {
        const st = JSON.parse(localStorage.getItem('atlasMbOpenPanel') || 'null');
        if (st) { st.page = p; localStorage.setItem('atlasMbOpenPanel', JSON.stringify(st)); }
    } catch (_) {}
    const pi = document.getElementById('mbPageInput');
    if (pi) pi.value = p;
    mbResetMcqForm();
    mbRenderPdfPage(p);
    mbRenderPageMcqList();
    mbUpdatePageCount();
    mbRenderPageSummary();
}

/* ════════════════════════════════════════════════════
   10. MCQ DATA LAYER  (book_page_mcqs, mcq_type='admin')
   ════════════════════════════════════════════════════ */

async function mbLoadAllPageMcqs() {
    if (!mbPdfId) return;
    mbResumeBulkJob();
    try {
        // admin manually-added MCQ — editing/preview এর জন্য আলাদা রাখা হয়
        const res = await mbApi(
            '/book_page_mcqs?pdf_id=eq.' + mbPdfId +
            '&mcq_type=eq.admin&select=id,page_number,questions_json&limit=500'
        );
        if (!res.ok) throw new Error();
        mbAllPageData = await res.json() || [];
    } catch {
        mbAllPageData = [];
    }

    // সব ধরনের MCQ (admin + user-generated standard/true_false/hard) — count summary এর জন্য
    try {
        const res2 = await mbApi(
            '/book_page_mcqs?pdf_id=eq.' + mbPdfId +
            '&select=id,page_number,mcq_type,questions_json&limit=500'
        );
        if (!res2.ok) throw new Error();
        mbAllPageDataAllTypes = await res2.json() || [];
    } catch {
        mbAllPageDataAllTypes = [];
    }
}

function mbGetPageMcqs(pageNum) {
    const row = mbAllPageData.find(r => r.page_number === pageNum);
    if (!row) return [];
    try { return JSON.parse(row.questions_json || '[]'); } catch { return []; }
}

// mcqId দিয়ে সেই MCQ কোন mcq_type row-এ আছে সেটা খুঁজে বের করে (admin/standard/true_false/hard) —
// user-generated MCQ edit করার সময় সঠিক row-এ save করার জন্য দরকার, নাহলে সবসময় 'admin'-এ
// লেখার চেষ্টা হয় আর duplicate-key constraint এ আটকে যায়।
function mbFindMcqSourceType(pageNum, mcqId) {
    const rows = mbAllPageDataAllTypes.filter(r => r.page_number === pageNum);
    for (const r of rows) {
        try {
            const qs = JSON.parse(r.questions_json || '[]');
            if (qs.some(q => String(q.id) === String(mcqId))) return r.mcq_type;
        } catch (_) {}
    }
    return 'admin'; // fallback — না পেলে admin ধরে নাও
}

// একটা নির্দিষ্ট mcq_type row-এর raw MCQ array (normalize না করা, আসল shape যেমন আছে) ফেরত দেয়
function mbGetPageMcqsByType(pageNum, mcqType) {
    const row = mbAllPageDataAllTypes.find(r => r.page_number === pageNum && r.mcq_type === mcqType);
    if (!row) return [];
    try { return JSON.parse(row.questions_json || '[]'); } catch { return []; }
}

async function mbUpsertPageMcqs(pageNum, mcqs, mcqType) {
    mcqType = mcqType || 'admin';
    const body = {
        pdf_id:         parseInt(mbPdfId),
        page_number:    pageNum,
        mcq_type:       mcqType,
        questions_json: JSON.stringify(mcqs)
    };
    const res = await mbApi('/book_page_mcqs', {
        method:  'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body:    JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'সংরক্ষণ ব্যর্থ');
    }
    const data = await res.json();
    const newRow = Array.isArray(data) ? data[0] : data;
    if (mcqType === 'admin') {
        const idx = mbAllPageData.findIndex(r => r.page_number === pageNum);
        if (idx >= 0) mbAllPageData[idx] = newRow;
        else mbAllPageData.push(newRow);
    }
    // mbAllPageDataAllTypes (সব ধরনের row একসাথে রাখে, All ট্যাব + count-এর জন্য) — সেখানেও sync রাখা দরকার
    const idxAll = mbAllPageDataAllTypes.findIndex(r => r.page_number === pageNum && r.mcq_type === mcqType);
    if (idxAll >= 0) mbAllPageDataAllTypes[idxAll] = newRow;
    else mbAllPageDataAllTypes.push(newRow);
}

function mbUpdatePageCount() {
    const adminMcqs = mbGetPageMcqs(mbCurrentPage);
    let totalCount = adminMcqs.length;
    const userRows = mbAllPageDataAllTypes.filter(r => r.page_number === mbCurrentPage && r.mcq_type !== 'admin');
    userRows.forEach(r => {
        try { totalCount += JSON.parse(r.questions_json || '[]').length; } catch (_) {}
    });
    const pc = document.getElementById('mbPageCount');
    if (pc) pc.textContent = totalCount + ' টি MCQ';
}

/* ════════════════════════════════════════════════════
   11. TAB SWITCHING
   ════════════════════════════════════════════════════ */

function mbSwitchTab(name) {
    const tabs = { manual: 'Manual', csv: 'Csv', ai: 'Ai', all: 'All' };
    Object.keys(tabs).forEach(t => {
        const btn = document.getElementById('mbTabBtn' + tabs[t]);
        const pan = document.getElementById('mbTab'    + tabs[t]);
        if (btn) btn.classList.toggle('active', t === name);
        if (pan) pan.classList.toggle('active', t === name);
    });
    if (name === 'all') mbRenderPageMcqList();
    if (name === 'csv') mbLoadCsvArchive();
}

/* ════════════════════════════════════════════════════
   12. MANUAL MCQ FORM
   ════════════════════════════════════════════════════ */

function mbResetMcqForm() {
    const form = document.getElementById('mbMcqForm');
    if (form) form.reset();
    if (document.getElementById('mbMcqEditId')) document.getElementById('mbMcqEditId').value = '';
    mbAnswerKey = null;
    mbTypeKey   = 'standard';

    ['K','Kh','G','Gh'].forEach(k => {
        const b = document.getElementById('mbBadge' + k);
        if (b) b.classList.remove('correct-sel');
        const a = document.getElementById('mbAns' + k);
        if (a) a.classList.remove('selected');
    });

    ['Standard','TrueFalse','Hard'].forEach(t => {
        const el = document.getElementById('mbType' + t);
        if (el) el.classList.toggle('selected', t === 'Standard');
    });

    const mcqType = document.getElementById('mbMcqType');
    if (mcqType) mcqType.value = 'standard';

    const cancelBtn = document.getElementById('mbMcqCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const saveBtn = document.getElementById('mbMcqSaveBtn');
    if (saveBtn) saveBtn.textContent = '✓ প্রশ্ন সংরক্ষণ';
    const title = document.getElementById('mbManualFormTitle');
    if (title) title.textContent = '➕ নতুন প্রশ্ন যোগ';
    mbEditingId = null;
}

function mbSelectAnswer(key) {
    mbAnswerKey = key;
    const keyMap = { k: 'K', kh: 'Kh', g: 'G', gh: 'Gh' };
    Object.keys(keyMap).forEach(k => {
        const b = document.getElementById('mbBadge' + keyMap[k]);
        if (b) b.classList.toggle('correct-sel', k === key);
        const a = document.getElementById('mbAns' + keyMap[k]);
        if (a) a.classList.toggle('selected', k === key);
    });
    const mc = document.getElementById('mbMcqCorrect');
    if (mc) mc.value = key;
}

function mbSelectType(type) {
    mbTypeKey = type;
    const typeMap = { standard: 'Standard', true_false: 'TrueFalse', hard: 'Hard' };
    Object.keys(typeMap).forEach(t => {
        const el = document.getElementById('mbType' + typeMap[t]);
        if (el) el.classList.toggle('selected', t === type);
    });
    const mt = document.getElementById('mbMcqType');
    if (mt) mt.value = type;
}

async function mbSelectAiType(type) {
    mbAiTypeKey = type;
    const typeMap = { standard: 'Standard', true_false: 'TrueFalse', hard: 'Hard', special: 'Special' };
    const typeLabelBn = { standard: 'Standard', true_false: 'True-False', hard: 'Hard', special: 'Special' };
    Object.keys(typeMap).forEach(t => {
        const el = document.getElementById('mbAiType' + typeMap[t]);
        if (el) el.classList.toggle('selected', t === type);
    });
    const at = document.getElementById('mbAiType');
    if (at) at.value = type;

    const isSpecial = type === 'special';
    const countInput   = document.getElementById('mbAiCount');
    const countLabel   = document.getElementById('mbAiCountLabel');
    const promptGroup  = document.getElementById('mbAiPrompt')?.closest('.form-group');
    const specialInfo  = document.getElementById('mbSpecialInfo');
    const genBtn       = document.getElementById('mbAiGenBtn');
    if (countInput) countInput.style.display = isSpecial ? 'none' : '';
    if (countLabel) countLabel.textContent = isSpecial ? 'পেইজ স্কোপ নির্বাচন করো' : 'প্রশ্ন সংখ্যা (প্রতি পেইজে)';
    if (promptGroup) promptGroup.style.display = isSpecial ? 'none' : '';
    if (specialInfo) specialInfo.style.display = isSpecial ? 'block' : 'none';
    if (genBtn && mbGenMode === 'single') genBtn.textContent = isSpecial ? '⚡ এই পেইজের existing MCQ এক্সট্র্যাক্ট করো' : '🤖 এই পেইজ থেকে MCQ তৈরি করো';

    const labelEl = document.getElementById('mbAiPromptLabel');
    if (labelEl) labelEl.textContent = `কাস্টম প্রম্পট (ঐচ্ছিক) — ${typeLabelBn[type]||type} টাইপের জন্য সংরক্ষিত হবে`;
    const savedTag = document.getElementById('mbPromptSavedTag');
    if (savedTag) savedTag.style.display = 'none';
    // Load saved prompt for this type
    const promptEl = document.getElementById('mbAiPrompt');
    if (promptEl && !isSpecial) {
        const saved = mbGetSavedPrompt(type);
        promptEl.value = saved || '';
    }
}

async function mbSavePromptOnly() {
    const promptEl = document.getElementById('mbAiPrompt');
    const text = (promptEl?.value || '').trim();
    await mbSavePromptForType(mbAiTypeKey, text);
    const savedTag = document.getElementById('mbPromptSavedTag');
    if (savedTag) {
        savedTag.style.display = 'inline';
        clearTimeout(window._mbPromptTagTimer);
        window._mbPromptTagTimer = setTimeout(() => { savedTag.style.display = 'none'; }, 2500);
    }
    mbToast('✓ প্রম্পট সংরক্ষণ করা হয়েছে', 'success');
}

async function mbSaveMcq(e) {
    e.preventDefault();
    if (!mbAnswerKey) { mbToast('সঠিক উত্তর নির্বাচন করুন', 'error'); return; }

    const question = document.getElementById('mbMcqQuestion').value.trim();
    const optK     = document.getElementById('mbOptK').value.trim();
    const optKh    = document.getElementById('mbOptKh').value.trim();
    const optG     = document.getElementById('mbOptG').value.trim();
    const optGh    = document.getElementById('mbOptGh').value.trim();
    const expl     = document.getElementById('mbMcqExplanation').value.trim();

    if (!question || !optK || !optKh || !optG || !optGh) {
        mbToast('প্রশ্ন ও সব বিকল্প পূরণ করুন', 'error');
        return;
    }

    const btn = document.getElementById('mbMcqSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...'; }

    try {
        const currentMcqs = mbGetPageMcqs(mbCurrentPage);
        const mcqObj = {
            id:          mbEditingId || uid(),
            question,
            option_k:    optK,
            option_kh:   optKh,
            option_g:    optG,
            option_gh:   optGh,
            correct:     mbAnswerKey,
            type:        mbTypeKey,
            explanation: expl
        };

        if (mbEditingId) {
            const idx = currentMcqs.findIndex(m => m.id === mbEditingId);
            if (idx >= 0) currentMcqs[idx] = mcqObj;
            else currentMcqs.push(mcqObj);
        } else {
            currentMcqs.push(mcqObj);
        }

        await mbUpsertPageMcqs(mbCurrentPage, currentMcqs);
        mbToast(mbEditingId ? '✓ প্রশ্ন আপডেট হয়েছে' : '✓ প্রশ্ন যোগ হয়েছে', 'success');
        mbResetMcqForm();
        mbRenderPageMcqList();
        mbUpdatePageCount();
        mbRenderPageSummary();
    } catch (ex) {
        mbToast('সংরক্ষণ ব্যর্থ: ' + ex.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = mbEditingId ? '✓ আপডেট করো' : '✓ প্রশ্ন সংরক্ষণ'; }
    }
}

let mbInlineEditId = null; // যে MCQ এখন inline edit mode-এ আছে

function mbEditMcq(mcqId) {
    // আগে এটা Manual ট্যাবে জাম্প করত — এখন MCQ যেখানে আছে (All ট্যাবের কার্ডেই) সেখানে inline edit form খোলে।
    mbInlineEditId = mcqId;
    mbRenderPageMcqList();
}

function mbCancelInlineEdit() {
    mbInlineEditId = null;
    mbRenderPageMcqList();
}

async function mbSaveInlineEdit(mcqId) {
    const get = id => (document.getElementById(id) || {}).value || '';
    const correctBtn = document.querySelector(`#mbInlineForm-${mcqId} .mb-inline-ans.active`);
    const keys = ['k', 'kh', 'g', 'gh'];
    const correctKey = correctBtn ? correctBtn.dataset.key : 'k';
    const updatedAdminShape = {
        id: mcqId,
        question:    get('mbInlineQ-' + mcqId),
        option_k:    get('mbInlineOptK-' + mcqId),
        option_kh:   get('mbInlineOptKh-' + mcqId),
        option_g:    get('mbInlineOptG-' + mcqId),
        option_gh:   get('mbInlineOptGh-' + mcqId),
        correct:     correctKey,
        explanation: get('mbInlineExp-' + mcqId),
        type:        get('mbInlineType-' + mcqId) || 'standard',
    };
    try {
        // এই mcqId কোন mcq_type row-এ আছে খুঁজে বের করো (admin, নাকি user-generated
        // standard/true_false/hard) — সঠিক row-এ save না করলে duplicate-key error হয়
        const sourceType = mbFindMcqSourceType(mbCurrentPage, mcqId);
        const rawMcqs = mbGetPageMcqsByType(mbCurrentPage, sourceType);

        const updatedRaw = rawMcqs.map(m => {
            if (String(m.id) !== String(mcqId)) return m;
            if (m.options && Array.isArray(m.options)) {
                // user-generated shape — options[]+answer_index বজায় রেখে আপডেট করো
                return {
                    ...m,
                    question: updatedAdminShape.question,
                    options: keys.map(k => updatedAdminShape['option_' + k]),
                    answer_index: keys.indexOf(correctKey),
                    explanation: updatedAdminShape.explanation,
                };
            }
            // admin shape — যেমন ছিল সেভাবেই
            return { ...m, ...updatedAdminShape };
        });

        await mbUpsertPageMcqs(mbCurrentPage, updatedRaw, sourceType);
        mbInlineEditId = null;
        mbToast('✓ প্রশ্ন আপডেট হয়েছে', 'success');
        mbRenderPageMcqList();
        mbUpdatePageCount();
        mbRenderPageSummary();
    } catch (ex) {
        mbToast('আপডেট ব্যর্থ: ' + ex.message, 'error');
    }
}

function mbInlineSelectAnswer(mcqId, key) {
    document.querySelectorAll(`#mbInlineForm-${mcqId} .mb-inline-ans`).forEach(b => {
        b.classList.toggle('active', b.dataset.key === key);
    });
}

function mbCancelMcqEdit() {
    mbResetMcqForm();
}

async function mbDeleteMcq(mcqId) {
    if (!confirm('এই প্রশ্নটি মুছে ফেলবেন?')) return;
    try {
        const sourceType = mbFindMcqSourceType(mbCurrentPage, mcqId);
        const rawMcqs = mbGetPageMcqsByType(mbCurrentPage, sourceType).filter(m => String(m.id) !== String(mcqId));
        await mbUpsertPageMcqs(mbCurrentPage, rawMcqs, sourceType);
        mbToast('✓ প্রশ্ন মুছে গেছে', 'success');
        mbRenderPageMcqList();
        mbUpdatePageCount();
        mbRenderPageSummary();
    } catch (ex) {
        mbToast('মুছতে ব্যর্থ: ' + ex.message, 'error');
    }
}

// admin-added (option_k/kh/g/gh shape) ও user-generated (options[] + answer_index shape) —
// দুটো ভিন্ন data shape-কে একটা common shape-এ normalize করে, যাতে একসাথে render করা যায়।
function mbNormalizeMcqShape(m) {
    if (m.options && Array.isArray(m.options)) {
        // user-side shape → admin shape এ convert
        const keys = ['k','kh','g','gh'];
        const out = { id: m.id, question: m.question, explanation: m.explanation, type: m.type };
        keys.forEach((k, i) => { out['option_'+k] = m.options[i] || ''; });
        out.correct = keys[m.answer_index] || 'k';
        return out;
    }
    return m; // ইতিমধ্যে admin shape এ আছে
}

function mbRenderPageMcqList() {
    const listEl = document.getElementById('mbMcqList');
    if (!listEl) return;

    // admin-added MCQ (edit/delete করা যায়) + এই পেইজের user-generated MCQ (read-only, সব ধরন একসাথে)
    const adminMcqs = mbGetPageMcqs(mbCurrentPage).map(m => ({ ...mbNormalizeMcqShape(m), _source: 'admin' }));
    const userRows = mbAllPageDataAllTypes.filter(r => r.page_number === mbCurrentPage && r.mcq_type !== 'admin');
    let userMcqs = [];
    userRows.forEach(r => {
        try {
            const qs = JSON.parse(r.questions_json || '[]');
            qs.forEach(q => userMcqs.push({ ...mbNormalizeMcqShape({ ...q, type: r.mcq_type }), _source: 'user', id: q.id || (r.id + '_' + userMcqs.length) }));
        } catch (_) {}
    });

    const mcqs = [...adminMcqs, ...userMcqs];

    if (!mcqs.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">এই পেইজে কোনো MCQ নেই। উপরে যোগ করুন।</div>';
        return;
    }

    const labelMap = { k: 'ক', kh: 'খ', g: 'গ', gh: 'ঘ' };
    const typeLabel = { standard: 'Standard', true_false: 'True-False', hard: 'Hard' };

    listEl.innerHTML = mcqs.map((m, idx) => {
        if (m.id === mbInlineEditId) {
            return mbBuildInlineEditForm(m, idx);
        }
        return `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
                <div style="font-size:12px;font-weight:700;line-height:1.5;flex:1">${idx + 1}. ${esc(m.question)}</div>
                <div style="display:flex;gap:6px;flex-shrink:0">
                    <button class="act-btn act-edit" onclick="mbEditMcq('${m.id}')" title="সম্পাদনা">✏️</button>
                    <button class="act-btn act-delete" onclick="mbDeleteMcq('${m.id}')" title="মুছুন">🗑️</button>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">
                ${['k','kh','g','gh'].map(k => `
                    <div style="padding:4px 8px;border-radius:4px;font-size:11px;
                        background:${m.correct===k?'rgba(16,185,129,0.1)':'var(--hover)'};
                        border:1px solid ${m.correct===k?'rgba(16,185,129,0.4)':'transparent'};
                        color:${m.correct===k?'var(--green)':'var(--text2)'}">
                        <strong>${labelMap[k]}</strong>. ${esc(m['option_'+k]||'')}${m.correct===k?' ✓':''}
                    </div>`).join('')}
            </div>
            ${m.explanation ? `<div style="font-size:10px;color:var(--text3);margin-top:4px;padding:4px 8px;background:rgba(108,99,255,0.05);border-radius:4px">💡 ${esc(m.explanation)}</div>` : ''}
            ${m.explanation_image ? `<img src="data:image/jpeg;base64,${m.explanation_image}" style="max-width:100%;border-radius:6px;margin-top:6px;border:1px solid rgba(108,99,255,0.15)" />` : ''}
            <div style="margin-top:6px;display:flex;gap:6px">
                <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(108,99,255,0.1);color:#9C8BFF;text-transform:uppercase">${typeLabel[m.type]||m.type||'standard'}</span>
                ${m._source === 'user' ? '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(16,185,129,0.1);color:var(--green)">ইউজার-জেনারেটেড</span>' : ''}
            </div>
        </div>`;
    }).join('');
}

// MCQ যেখানে দেখা যায় (All ট্যাবের কার্ড) সেখানেই inline edit form — Manual ট্যাবে জাম্প করে না।
function mbBuildInlineEditForm(m, idx) {
    const labelMap = { k: 'ক', kh: 'খ', g: 'গ', gh: 'ঘ' };
    return `
    <div id="mbInlineForm-${m.id}" style="background:var(--card);border:1.5px solid var(--accent);border-radius:var(--radius);padding:14px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px">✏️ ${idx + 1}. প্রশ্ন সম্পাদনা</div>
        <textarea class="form-input" id="mbInlineQ-${m.id}" rows="2" style="margin-bottom:8px;width:100%">${esc(m.question||'')}</textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            ${['k','kh','g','gh'].map(k => `
                <div style="display:flex;align-items:center;gap:4px">
                    <button type="button" class="mb-inline-ans ${m.correct===k?'active':''}" data-key="${k}" onclick="mbInlineSelectAnswer('${m.id}','${k}')"
                        style="width:22px;height:22px;flex-shrink:0;border-radius:50%;border:1.5px solid ${m.correct===k?'var(--green)':'var(--border)'};background:${m.correct===k?'var(--green)':'transparent'};color:${m.correct===k?'#fff':'var(--text3)'};font-size:10px;font-weight:700;cursor:pointer">${labelMap[k]}</button>
                    <input class="form-input" id="mbInlineOpt${k.charAt(0).toUpperCase()+k.slice(1)}-${m.id}" value="${esc(m['option_'+k]||'')}" style="flex:1;font-size:11px;padding:6px 8px">
                </div>`).join('')}
        </div>
        <textarea class="form-input" id="mbInlineExp-${m.id}" rows="2" placeholder="ব্যাখ্যা (ঐচ্ছিক)" style="margin-bottom:8px;width:100%">${esc(m.explanation||'')}</textarea>
        <input type="hidden" id="mbInlineType-${m.id}" value="${esc(m.type||'standard')}">
        <div style="display:flex;gap:8px">
            <button class="btn btn-outline" style="flex:1" onclick="mbCancelInlineEdit()">বাতিল</button>
            <button class="btn btn-primary" style="flex:1" onclick="mbSaveInlineEdit('${m.id}')">✓ সংরক্ষণ করো</button>
        </div>
    </div>`;
}

/* ════════════════════════════════════════════════════
   13. CSV IMPORT
   ════════════════════════════════════════════════════ */

function mbCsvDragOver(e) {
    e.preventDefault();
    const drop = document.getElementById('mbCsvFileDrop');
    if (drop) drop.style.borderColor = 'var(--accent)';
}
function mbCsvDragLeave() {
    const drop = document.getElementById('mbCsvFileDrop');
    if (drop) drop.style.borderColor = '';
}
function mbCsvDrop(e) {
    e.preventDefault();
    const drop = document.getElementById('mbCsvFileDrop');
    if (drop) drop.style.borderColor = '';
    const f = e.dataTransfer.files[0];
    if (f) mbParseCsvFile(f);
}
function mbCsvFileSelect(e) {
    if (e.target.files[0]) mbParseCsvFile(e.target.files[0]);
}

function mbParseCsvFile(file) {
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) { mbToast('CSV ফাইলে ডেটা নেই', 'error'); return; }

            const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g,''));
            const idx = h => header.indexOf(h);

            // New format: questions,option1,option2,option3,option4,option5,answer,explanation,type,section
            // Old format: question,option_k,option_kh,option_g,option_gh,correct,explanation,type
            const isNewFormat = idx('questions') >= 0 || idx('option1') >= 0 || idx('answer') >= 0;

            let qIdx, o1,o2,o3,o4,o5, ansIdx, eIdx, tIdx;

            if (isNewFormat) {
                qIdx   = idx('questions');
                o1     = idx('option1');
                o2     = idx('option2');
                o3     = idx('option3');
                o4     = idx('option4');
                o5     = idx('option5');
                ansIdx = idx('answer');   // numeric: 1-5
                eIdx   = idx('explanation');
                tIdx   = idx('type');
            } else {
                // Legacy format fallback
                qIdx   = idx('question');
                o1     = idx('option_k');
                o2     = idx('option_kh');
                o3     = idx('option_g');
                o4     = idx('option_gh');
                ansIdx = idx('correct');  // letter: k/kh/g/gh
                eIdx   = idx('explanation');
                tIdx   = idx('type');
            }

            if (qIdx < 0) {
                mbToast('CSV হেডার ভুল। questions কলাম প্রয়োজন।', 'error');
                return;
            }

            // Numeric answer → option key map
            const numToKey = {'1':'k','2':'kh','3':'g','4':'gh','5':'u'};

            mbCsvData = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = mbSplitCsv(lines[i]);
                const q = cols[qIdx] ? cols[qIdx].trim() : '';
                if (!q) continue;

                let correctKey;
                if (isNewFormat) {
                    const ansRaw = ansIdx >= 0 ? (cols[ansIdx]||'1').trim() : '1';
                    correctKey = numToKey[ansRaw] || 'k';
                } else {
                    correctKey = ansIdx >= 0 ? (cols[ansIdx]||'k').trim().toLowerCase() : 'k';
                }

                mbCsvData.push({
                    id:          uid(),
                    question:    q,
                    option_k:    o1 >= 0 ? (cols[o1]||'').trim() : '',
                    option_kh:   o2 >= 0 ? (cols[o2]||'').trim() : '',
                    option_g:    o3 >= 0 ? (cols[o3]||'').trim() : '',
                    option_gh:   o4 >= 0 ? (cols[o4]||'').trim() : '',
                    option_u:    o5 >= 0 ? (cols[o5]||'').trim() : '',
                    correct:     correctKey,
                    explanation: eIdx >= 0 ? (cols[eIdx]||'').trim() : '',
                    type:        tIdx >= 0 ? (cols[tIdx]||'standard').trim() : 'standard'
                });
            }

            const info = document.getElementById('mbCsvPreviewInfo');
            if (info) { info.textContent = mbCsvData.length + 'টি প্রশ্ন পাওয়া গেছে।'; info.style.display = 'block'; }
            const btn = document.getElementById('mbCsvImportBtn');
            if (btn) btn.style.display = mbCsvData.length ? 'block' : 'none';

            if (mbCsvData.length) mbToast(mbCsvData.length + 'টি প্রশ্ন প্রস্তুত। "আমদানি করুন" চাপুন।', 'info');
            else mbToast('কোনো বৈধ প্রশ্ন পাওয়া যায়নি', 'error');
        } catch (ex) {
            mbToast('CSV পার্স ব্যর্থ: ' + ex.message, 'error');
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function mbSplitCsv(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
        cur += c;
    }
    result.push(cur);
    return result;
}

async function mbImportCsv() {
    if (!mbCsvData.length) { mbToast('আমদানি করার ডেটা নেই', 'error'); return; }

    const btn = document.getElementById('mbCsvImportBtn');
    const pw  = document.getElementById('mbCsvProgressWrap');
    const pf  = document.getElementById('mbCsvProgressFill');
    const pl  = document.getElementById('mbCsvProgressLabel');
    const res = document.getElementById('mbCsvResult');

    if (btn) btn.style.display = 'none';
    if (pw)  pw.style.display  = 'block';

    try {
        const currentMcqs = mbGetPageMcqs(mbCurrentPage);
        const total = mbCsvData.length;

        for (let i = 0; i < total; i++) {
            currentMcqs.push(mbCsvData[i]);
            const pct = Math.round((i + 1) / total * 100);
            if (pf) pf.style.width = pct + '%';
            if (pl) pl.textContent = (i + 1) + '/' + total + ' প্রশ্ন আমদানি হচ্ছে...';
        }

        await mbUpsertPageMcqs(mbCurrentPage, currentMcqs);

        if (res) { res.textContent = '✓ ' + total + 'টি প্রশ্ন সফলভাবে আমদানি হয়েছে!'; res.style.display = 'block'; }
        mbToast('✓ ' + total + 'টি প্রশ্ন আমদানি সম্পন্ন', 'success');
        mbCsvData = [];

        mbRenderPageMcqList();
        mbUpdatePageCount();
        mbRenderPageSummary();

        setTimeout(() => {
            if (res) res.style.display = 'none';
            if (pw)  pw.style.display  = 'none';
            const info = document.getElementById('mbCsvPreviewInfo');
            if (info) { info.textContent = ''; info.style.display = 'none'; }
            const fi = document.getElementById('mbCsvFileInput');
            if (fi) fi.value = '';
        }, 3000);

    } catch (ex) {
        mbToast('আমদানি ব্যর্থ: ' + ex.message, 'error');
        if (pw)  pw.style.display  = 'none';
        if (btn) btn.style.display = 'block';
    }
}

/* ════════════════════════════════════════════════════
   14. AI GENERATE
   ════════════════════════════════════════════════════ */

/* ─── AI prompt storage — Supabase book_ai_prompts (global per-type, not per-PDF) ───
   এই prompt সব PDF/page এর জন্য একই — admin একবার সেট করলে user side সবসময় সেটাই follow করবে।
   pdf_id = 0 কে "global" placeholder হিসেবে ব্যবহার করা হচ্ছে যাতে এক জায়গাতেই সব PDF এর জন্য কাজ করে। */
let mbPromptCache = {};
async function mbLoadAllPrompts() {
    try {
        const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_ai_prompts?pdf_id=eq.0&select=mcq_type,prompt`);
        mbPromptCache = {};
        (rows||[]).forEach(r => { mbPromptCache[r.mcq_type] = r.prompt; });
    } catch(_) {}
}
function mbGetSavedPrompt(type) {
    return mbPromptCache[type] || '';
}
async function mbSavePromptForType(type, text) {
    mbPromptCache[type] = text;
    try {
        await safeFetch(`${SUPABASE_URL}/rest/v1/book_ai_prompts`, {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ pdf_id: 0, mcq_type: type, prompt: text, updated_at: new Date().toISOString() })
        });
    } catch(_) {}
}

/* ─── exp_box (% coords) থেকে page-এর নির্দিষ্ট অংশ crop করে base64 JPEG বানায় ───
   AI যে bounding box দেয় সেটা full page width/height এর % হিসেবে — এই function
   page টাকে বেশি scale (2.5x) দিয়ে fresh render করে সেখান থেকে সঠিক pixel অংশ crop করে,
   যাতে ছোট টেক্সটও পড়া যায়। box পাওয়া না গেলে বা invalid হলে null রিটার্ন করে। */
async function mbCropExplanationImage(pageNum, box) {
    if (!mbPdfDoc) return null;
    try {
        const page  = await mbPdfDoc.getPage(pageNum);
        const scale = 2.5; // ভালো readability-র জন্য বেশি রেজোলিউশনে render
        const vp    = page.getViewport({ scale });
        const full  = document.createElement('canvas');
        full.width  = vp.width;
        full.height = vp.height;
        await page.render({ canvasContext: full.getContext('2d'), viewport: vp }).promise;

        const y = box ? Number(box.y) : NaN;
        const h = box ? Number(box.h) : NaN;
        const validBox = Number.isFinite(y) && Number.isFinite(h) && h > 0;

        // x,w কখনো ব্যবহার করা হয় না — সবসময় পুরো পেইজ width (0-100%) নেওয়া হয়, নাহলে
        // ডান/বাম পাশের টেক্সট কাটা পড়ার সমস্যা হয় (AI-র width estimate ভুল হলে)।
        // শুধু y,h (vertical position) AI থেকে নেওয়া হয়, সেটাও generous padding সহ।
        const padPct = 4; // উপরে-নিচে অতিরিক্ত ৪% বাফার, টপিক কাটা পড়া এড়াতে
        let py, ph;
        if (validBox) {
            py = Math.max(0, (y - padPct) / 100 * full.height);
            ph = Math.min(full.height - py, (h + padPct * 2) / 100 * full.height);
        } else {
            // exp_box না পাওয়া গেলে fallback: পুরো পেইজটাই explanation image হিসেবে দেওয়া হয়,
            // যাতে কোনো MCQ-তেই image সম্পূর্ণ miss না হয়।
            py = 0;
            ph = full.height;
        }
        if (ph < 10) return null;

        const cropped = document.createElement('canvas');
        cropped.width  = full.width;
        cropped.height = ph;
        cropped.getContext('2d').drawImage(full, 0, py, full.width, ph, 0, 0, full.width, ph);
        return cropped.toDataURL('image/jpeg', 0.85).split(',')[1]; // শুধু base64 অংশ ফেরত
    } catch (_) {
        return null;
    }
}

/* ─── Get canvas image from current PDF page ─── */
async function mbGetPageImageBase64(pageNum) {
    if (!mbPdfDoc) return null;
    try {
        const canvas = document.getElementById('mbPreviewCanvas');
        if (canvas && canvas.width > 100 && canvas.height > 100) {
            return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
        }
        // Render fresh if canvas not ready
        const page = await mbPdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale: 1.5 });
        const tmp = document.createElement('canvas');
        tmp.width = vp.width; tmp.height = vp.height;
        await page.render({ canvasContext: tmp.getContext('2d'), viewport: vp }).promise;
        return { base64: tmp.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
    } catch { return null; }
}

// "প্রশ্ন সংখ্যা" বক্সে single number ("10") বা range ("5-10") — দুটোই সাপোর্ট করে।
// AI prompt-এ পাঠানোর জন্য একটা readable label এবং loop/validation এর জন্য min/max রিটার্ন করে।
function mbParseCountInput(raw) {
    const s = (raw || '10').trim();
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
        const min = parseInt(m[1]), max = parseInt(m[2]);
        if (min > 0 && max >= min) return { min, max, label: `${min} থেকে ${max}টি`, forApi: max };
    }
    const n = parseInt(s) || 10;
    return { min: n, max: n, label: `${n}টি`, forApi: n };
}

async function mbAiGenerate() {
    if (!mbPdfDoc) { mbToast('আগে একটি PDF খুলুন', 'error'); return; }

    const type = mbAiTypeKey;
    if (type === 'special') { await mbAiGenerateSpecial(); return; }

    const countRaw = ((document.getElementById('mbAiCount') || {}).value || '10').trim();
    const count    = mbParseCountInput(countRaw); // single number বা "5-10" রেঞ্জ উভয়ই সাপোর্ট করে
    const customP  = ((document.getElementById('mbAiPrompt') || {}).value || '').trim();

    // Save custom prompt per type
    if (customP) await mbSavePromptForType(type, customP);

    const spinner  = document.getElementById('mbAiSpinner');
    const genBtn   = document.getElementById('mbAiGenBtn');
    const resultEl = document.getElementById('mbAiResult');

    if (spinner)  spinner.style.display  = 'block';
    if (genBtn)   genBtn.style.display   = 'none';
    if (resultEl) resultEl.style.display = 'none';
    mbAiData = [];

    try {
        const typeLabel = { standard: 'সাধারণ', true_false: 'সত্য/মিথ্যা', hard: 'কঠিন' };
        const jsonFormat = `[{"question":"...","option_k":"...","option_kh":"...","option_g":"...","option_gh":"...","correct":"k","explanation":"...","exp_box":{"x":0,"y":0,"w":0,"h":0},"type":"${type}"}]`;
        const savedP = mbGetSavedPrompt(type);
        const basePrompt = (customP || savedP || (
            `${typeLabel[type]||type} ধরনের ${count.label} MCQ তৈরি করো। ` +
            `Content যে ভাষায় আছে সেই ভাষায় রাখো। ` +
            `প্রতিটিতে চারটি বিকল্প (option_k, option_kh, option_g, option_gh) এবং সঠিক উত্তর (k/kh/g/gh) থাকবে।`
        )) + MB_PERMANENT_RULES + MB_EXP_BOX_RULE;

        let rawJson;
        let geminiAlreadyTried = false; // এই page-এ Gemini PDF-native ইতিমধ্যে চেষ্টা হয়েছে কি না —
                                          // fallback chain-এ আবার Gemini কল করে quota নষ্ট না করার জন্য

        // Step 1 (preferred): send the whole PDF page directly to Gemini, which reads
        // PDFs/scanned pages natively — works for both text-based and image-based pages,
        // no client-side text-extraction needed.
        if (mbPdfUrl) {
            try {
                const pdfPrompt = `এই PDF-এর পেইজ ${mbCurrentPage} দেখো এবং নিচের নির্দেশ অনুসরণ করো:\n${basePrompt}\n\n` +
                    `শুধু JSON array রিটার্ন করো, কোনো markdown বা অতিরিক্ত text ছাড়া। Format:\n${jsonFormat}`;
                const res = await fetch(AI_PROXY_URL.replace(/\/$/, '') + '/mcq-from-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pdf_url: mbPdfUrl, prompt: pdfPrompt })
                });
                geminiAlreadyTried = true;
                const data = await res.json().catch(() => null);
                if (res.ok && data?.success && data.answer) rawJson = data.answer;
            } catch (_) { /* fall through to legacy approach below */ }
        }

        // Step 2 (fallback): old text-extraction / page-image approach, kept for
        // resilience in case the direct-PDF endpoint is unavailable.
        if (!rawJson) {
            const page     = await mbPdfDoc.getPage(mbCurrentPage);
            const textCont = await page.getTextContent();
            const pageText = textCont.items.map(i => i.str).join(' ').trim();

            if (pageText && pageText.length >= 30) {
                const prompt = `নিচের টেক্সট থেকে ${basePrompt}\n` +
                    `শুধু JSON array রিটার্ন করো, কোনো markdown বা অতিরিক্ত text ছাড়া। Format:\n${jsonFormat}\n\n` +
                    `টেক্সট:\n${pageText.slice(0, 4000)}`;
                rawJson = await mbCallAiApi(prompt, null, null, geminiAlreadyTried);
            } else {
                mbToast('ছবি-ভিত্তিক PDF — image AI ব্যবহার হচ্ছে...', 'info', 2000);
                const imageData = await mbGetPageImageBase64(mbCurrentPage);
                if (!imageData) { mbToast('পেইজের ছবি তৈরি করা যায়নি', 'error'); return; }
                const sysPrompt = `তুমি একজন অভিজ্ঞ HSC শিক্ষক। এই বইয়ের পেইজের ছবি দেখে ${basePrompt}\n` +
                    `শুধু JSON array রিটার্ন করো: ${jsonFormat}`;
                rawJson = await mbCallAiApi('', imageData, sysPrompt, geminiAlreadyTried);
            }
        }

        let parsed  = mbParseAiJson(rawJson);

        if (!parsed || !parsed.length) {
            mbToast('AI সঠিক JSON দেয়নি। পুনরায় চেষ্টা করুন।', 'error');
            return;
        }
        // Count must-follow: চাহিদার চেয়ে বেশি দিলে কেটে দাও, কম দিলে warning
        if (parsed.length > count.max) parsed = parsed.slice(0, count.max);
        if (parsed.length < count.min) console.warn(`চাহিদা ছিল ${count.label}, AI দিয়েছে ${parsed.length}টি`);

        mbAiData = parsed.map(m => ({ id: uid(), ...m, type: m.type || type }));

        // exp_box দিয়ে প্রতিটা MCQ-র জন্য topic-crop explanation image বানানো — একই box একাধিক
        // MCQ শেয়ার করতে পারে সেক্ষেত্রে dedupe করা হয়, কিন্তু exp_box missing/null থাকলে
        // প্রতিটা MCQ-র জন্য আলাদা ভাবে (id দিয়ে unique key) crop করা হয় — নাহলে সব
        // missing-exp_box MCQ একই cache key ('FULL') শেয়ার করে ভুলবশত একে অপরের
        // explanation image (এমনকি ভুল/অন্য প্রশ্নের crop) পেয়ে যেত।
        const cropCache = new Map();
        for (const m of mbAiData) {
            const key = m.exp_box ? JSON.stringify(m.exp_box) : `NOBBOX_${m.id}`;
            if (!cropCache.has(key)) cropCache.set(key, await mbCropExplanationImage(mbCurrentPage, m.exp_box));
            const img = cropCache.get(key);
            if (img) m.explanation_image = img; // exp_box না থাকলেও fallback (full page) দেওয়া হয় — কখনো miss হবে না
            delete m.exp_box; // raw box আর দরকার নেই, save হবে না
        }

        const header = document.getElementById('mbAiResultHeader');
        if (header) header.textContent = mbAiData.length + 'টি AI-প্রস্তুত প্রশ্ন (সংরক্ষণ করতে নিচের বোতাম চাপুন)';

        const previewList = document.getElementById('mbAiPreviewList');
        if (previewList) {
            const lMap = { k:'ক', kh:'খ', g:'গ', gh:'ঘ' };
            previewList.innerHTML = mbAiData.map((m, i) => `
                <div style="background:var(--card);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px">
                    <div style="font-size:12px;font-weight:600;margin-bottom:6px">${i+1}. ${esc(m.question)}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
                        ${['k','kh','g','gh'].map(k => `
                            <div style="font-size:11px;padding:3px 7px;border-radius:3px;
                                color:${m.correct===k?'var(--green)':'var(--text2)'};
                                background:${m.correct===k?'rgba(16,185,129,0.08)':'var(--hover)'}"
                            >${lMap[k]}. ${esc(m['option_'+k]||'')}${m.correct===k?' ✓':''}</div>`).join('')}
                    </div>
                    ${m.explanation_image ? `<img src="data:image/jpeg;base64,${m.explanation_image}" style="max-width:100%;border-radius:6px;margin-top:6px;border:1px solid rgba(108,99,255,0.15)" />` : ''}
                </div>`).join('');
        }
        if (resultEl) resultEl.style.display = 'block';

    } catch (ex) {
        mbToast('AI ব্যর্থ: ' + ex.message, 'error');
    } finally {
        if (spinner) spinner.style.display = 'none';
        if (genBtn)  genBtn.style.display  = 'block';
    }
}

// Special মোডে single-page: শুধু extract করে, প্রশ্ন সংখ্যা validate করে না
async function mbAiGenerateSpecial() {
    const spinner  = document.getElementById('mbAiSpinner');
    const genBtn   = document.getElementById('mbAiGenBtn');
    const resultEl = document.getElementById('mbAiResult');
    if (spinner)  spinner.style.display  = 'block';
    if (genBtn)   genBtn.style.display   = 'none';
    if (resultEl) resultEl.style.display = 'none';
    mbAiData = [];

    try {
        const parsed = await mbSpecialExtractPage(mbCurrentPage);
        if (!parsed || !parsed.length) {
            mbToast('❌ এই পেইজে কোনো existing MCQ পাওয়া যায়নি', 'error');
            return;
        }
        mbAiData = parsed.map(m => ({ id: uid(), ...mbShuffleSpecialOptions(m), type: 'special' }));

        const header = document.getElementById('mbAiResultHeader');
        if (header) header.textContent = mbAiData.length + 'টি এক্সট্র্যাক্ট করা প্রশ্ন (সংরক্ষণ করতে নিচের বোতাম চাপুন)';

        const previewList = document.getElementById('mbAiPreviewList');
        if (previewList) {
            const lMap = { k:'ক', kh:'খ', g:'গ', gh:'ঘ' };
            previewList.innerHTML = mbAiData.map((m, i) => `
                <div style="background:var(--card);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px">
                    <div style="font-size:12px;font-weight:600;margin-bottom:6px">${i+1}. ${esc(m.question)}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
                        ${['k','kh','g','gh'].map(k => `
                            <div style="font-size:11px;padding:3px 7px;border-radius:3px;
                                color:${m.correct===k?'var(--green)':'var(--text2)'};
                                background:${m.correct===k?'rgba(16,185,129,0.08)':'var(--hover)'}"
                            >${lMap[k]}. ${esc(m['option_'+k]||'')}${m.correct===k?' ✓':''}</div>`).join('')}
                    </div>
                </div>`).join('');
        }
        if (resultEl) resultEl.style.display = 'block';
    } catch (ex) {
        mbToast('এক্সট্র্যাকশন ব্যর্থ: ' + ex.message, 'error');
    } finally {
        if (spinner) spinner.style.display = 'none';
        if (genBtn)  genBtn.style.display  = 'block';
    }
}

// All AI calls now go through the centralized proxy worker — no API key lives in
// this file or any client-side code. See atlas-ai-proxy-worker.js for the actual
// provider fallback chain (Gemini → OpenRouter → Groq → Cerebras → Cloudflare AI).
async function mbCallAiApi(prompt, image, customSystemPrompt, skipGemini) {
    const res = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: prompt || '',
            image: image ? { base64: image.base64, mimeType: image.mimeType } : null,
            systemPrompt: customSystemPrompt || 'তুমি একজন অভিজ্ঞ HSC শিক্ষক যে নির্ভুল MCQ তৈরি করতে পারো।',
            skipGemini: !!skipGemini // এই page-এর জন্য Gemini আগেই একবার (PDF-native) চেষ্টা হয়ে থাকলে,
                                       // fallback chain-এ আবার Gemini-কে ডাবল-কল না করার জন্য
        })
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
        // Surface the worker's per-provider error breakdown instead of just the status code,
        // so the actual failure reason (missing secret, bad key, rate limit, etc.) is visible
        // instead of a generic "AI প্রক্সি ব্যর্থ (502)" that hides the real cause.
        const detail = data?.details?.length ? ' — ' + data.details.join(' | ') : (data?.error ? ' — ' + data.error : '');
        throw new Error('AI প্রক্সি ব্যর্থ (' + res.status + ')' + detail);
    }
    if (!data || !data.success) throw new Error(data?.error || 'AI থেকে কোনো উত্তর পাওয়া যায়নি');
    return data.answer || '';
}

function mbParseAiJson(raw) {
    if (!raw) return null;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
}

async function mbSaveAiMcqs() {
    if (!mbAiData.length) return;
    try {
        const currentMcqs = mbGetPageMcqs(mbCurrentPage);
        mbAiData.forEach(m => currentMcqs.push(m));
        await mbUpsertPageMcqs(mbCurrentPage, currentMcqs);
        // AI দিয়ে generate হওয়া এই batch-টার CSV automatically তৈরি+save হয়ে যাবে — manual download লাগবে না।
        await mbSaveMcqsAsCsv(mbAiData, mbCurrentPage, mbAiTypeKey);
        mbToast('✓ ' + mbAiData.length + 'টি AI MCQ সংরক্ষিত হয়েছে (+ CSV)', 'success');
        mbAiData = [];
        const resultEl = document.getElementById('mbAiResult');
        if (resultEl) resultEl.style.display = 'none';
        const previewList = document.getElementById('mbAiPreviewList');
        if (previewList) previewList.innerHTML = '';
        mbRenderPageMcqList();
        mbUpdatePageCount();
        mbRenderPageSummary();
    } catch (ex) {
        mbToast('সংরক্ষণ ব্যর্থ: ' + ex.message, 'error');
    }
}

/* ════════════════════════════════════════════════════
   14a-CSV. AUTO CSV ARCHIVE — AI generation থেকে স্বয়ংক্রিয়ভাবে CSV বানিয়ে
   Supabase-এ জমা রাখে। Format: questions,option1-5,answer(numeric),
   explanation,type,section — type ও section সবসময় "1" দিয়ে fill করা হয়
   (নির্দেশনা অনুযায়ী)।
   ════════════════════════════════════════════════════ */
function mbCsvEscape(v) {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

// option_k/kh/g/gh/u কী থেকে 1-5 numeric answer বের করে — CSV format-এর জন্য
const MB_KEY_TO_NUM = { k: 1, kh: 2, g: 3, gh: 4, u: 5 };

function mbBuildCsvFromMcqs(mcqs) {
    const header = 'questions,option1,option2,option3,option4,option5,answer,explanation,type,section';
    const rows = mcqs.map(m => {
        const cols = [
            m.question || '',
            m.option_k || '',
            m.option_kh || '',
            m.option_g || '',
            m.option_gh || '',
            m.option_u || '',
            MB_KEY_TO_NUM[m.correct] || 1,
            m.explanation || '',
            1, // type সবসময় 1
            1, // section সবসময় 1
        ];
        return cols.map(mbCsvEscape).join(',');
    });
    return [header, ...rows].join('\n');
}

// একটা batch MCQ generate হওয়ার পরই CSV বানিয়ে Supabase archive-এ POST করে — fire-and-forget নয়,
// await করা হয় যাতে save নিশ্চিত হওয়ার পরই success toast দেখানো হয়।
async function mbSaveMcqsAsCsv(mcqs, pageNum, type) {
    if (!mcqs || !mcqs.length || !mbPdfId) return;
    try {
        const csvContent = mbBuildCsvFromMcqs(mcqs);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `page${pageNum}_${type}_${ts}.csv`;
        await mbApi('/book_mcq_csv_archive', {
            method: 'POST',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({
                pdf_id: parseInt(mbPdfId),
                page_number: pageNum,
                file_name: fileName,
                csv_content: csvContent,
                question_count: mcqs.length,
                mcq_type: type,
            }),
        });
        mbLoadCsvArchive(); // archive list তাজা করে দাও যাতে নতুন ফাইলটা সাথে সাথে দেখা যায়
    } catch (e) {
        console.warn('CSV archive save failed:', e.message);
        // CSV save fail হলেও মূল MCQ data save হয়ে গেছে — তাই এটা silent warning, blocking error না
    }
}

// CSV archive list load + render — "All" ট্যাবের নিচে দেখা যায়
async function mbLoadCsvArchive() {
    const wrap = document.getElementById('mbCsvArchiveList');
    if (!wrap || !mbPdfId) return;
    wrap.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:10px">লোড হচ্ছে...</div>';
    try {
        const rows = await mbApi('/book_mcq_csv_archive?pdf_id=eq.' + mbPdfId + '&select=id,page_number,file_name,question_count,mcq_type,created_at&order=created_at.desc&limit=200')
            .then(r => r.ok ? r.json() : []);
        if (!rows || !rows.length) {
            wrap.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:10px">এখনো কোনো CSV তৈরি হয়নি</div>';
            return;
        }
        const typeLabel = { standard: 'Standard', true_false: 'True-False', hard: 'Hard' };
        wrap.innerHTML = rows.map(r => {
            const dt = new Date(r.created_at);
            const dateStr = dt.toLocaleDateString('bn-BD') + ' ' + dt.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 10px">
                <div style="min-width:0">
                    <div style="font-size:11.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.file_name)}</div>
                    <div style="font-size:9.5px;color:var(--text3)">পেইজ ${r.page_number ?? '—'} · ${typeLabel[r.mcq_type]||r.mcq_type||''} · ${r.question_count}টি প্রশ্ন · ${dateStr}</div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0">
                    <button class="btn btn-sm btn-outline" style="font-size:10px;padding:4px 8px" onclick="mbDownloadCsvArchive(${r.id}, '${esc(r.file_name)}')">⬇</button>
                    <button class="btn btn-sm btn-outline" style="font-size:10px;padding:4px 8px;color:#ef4444" onclick="mbDeleteCsvArchive(${r.id})">🗑</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        wrap.innerHTML = '<div style="font-size:11px;color:#ef4444;text-align:center;padding:10px">লোড ব্যর্থ</div>';
    }
}

async function mbDownloadCsvArchive(id, fileName) {
    try {
        const rows = await mbApi('/book_mcq_csv_archive?id=eq.' + id + '&select=csv_content').then(r => r.ok ? r.json() : []);
        const csvContent = rows?.[0]?.csv_content;
        if (!csvContent) { mbToast('CSV পাওয়া যায়নি', 'error'); return; }
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        mbToast('ডাউনলোড ব্যর্থ: ' + e.message, 'error');
    }
}

async function mbDeleteCsvArchive(id) {
    if (!confirm('এই CSV ফাইলটি মুছে ফেলতে চাও?')) return;
    try {
        await mbApi('/book_mcq_csv_archive?id=eq.' + id, { method: 'DELETE' });
        mbLoadCsvArchive();
    } catch (e) {
        mbToast('মুছে ফেলা ব্যর্থ: ' + e.message, 'error');
    }
}

/* ════════════════════════════════════════════════════
   14b. BULK AI GENERATE — Apply to All / Page Range
   Persistent background job: state সংরক্ষিত হয় localStorage এ,
   যাতে page refresh/navigate করলেও কাজ থেমে না যায়, বরং চালু পেইজে
   আবার দেখা গেলে progress box সেই জায়গা থেকেই চলতে থাকে।
   ════════════════════════════════════════════════════ */
const MB_BULK_KEY = 'mbBulkJob';
let mbBulkRunning = false;
let mbGenMode = 'single'; // 'single' | 'all' | 'range' — মূল Generate বাটনের আচরণ নির্ধারণ করে

// Apply-to-All / Page-Range টগল — ক্লিক করলে সেই মোড চালু হয়, আবার ক্লিক করলে single page এ ফিরে আসে
function mbSetGenMode(mode) {
    if (!mbPdfDoc) { mbToast('আগে একটি PDF খুলুন', 'error'); return; }
    mbGenMode = (mbGenMode === mode) ? 'single' : mode;

    const allBtn   = document.getElementById('mbModeAllBtn');
    const rangeBtn = document.getElementById('mbModeRangeBtn');
    const rangeBox = document.getElementById('mbRangeBox');
    const genBtn   = document.getElementById('mbAiGenBtn');

    allBtn.classList.toggle('selected', mbGenMode === 'all');
    rangeBtn.classList.toggle('selected', mbGenMode === 'range');
    rangeBox.style.display = (mbGenMode === 'range') ? 'block' : 'none';

    if (mbGenMode === 'range') {
        document.getElementById('mbBulkFrom').value = document.getElementById('mbBulkFrom').value || 1;
        document.getElementById('mbBulkTo').value = document.getElementById('mbBulkTo').value || mbPdfDoc.numPages || 1;
        mbUpdateRangeSummary();
    }

    if (mbGenMode === 'all') {
        genBtn.textContent = mbAiTypeKey === 'special'
            ? `⚡ সকল ${mbPdfDoc.numPages} পেইজের existing MCQ এক্সট্র্যাক্ট করো`
            : `🤖 সকল ${mbPdfDoc.numPages} পেইজ থেকে প্রশ্ন বানান`;
    } else if (mbGenMode === 'range') {
        mbUpdateRangeSummary(); // label টাও আপডেট করে দেয়
    } else {
        genBtn.textContent = mbAiTypeKey === 'special'
            ? '⚡ এই পেইজের existing MCQ এক্সট্র্যাক্ট করো'
            : '🤖 এই পেইজ থেকে MCQ তৈরি করো';
    }
}

// Range ইনপুট বদলালে লাইভ সামারি + Generate বাটনের লেবেল আপডেট হয়
function mbUpdateRangeSummary() {
    const totalPages = mbPdfDoc ? mbPdfDoc.numPages : 0;
    const from = Math.max(1, parseInt(document.getElementById('mbBulkFrom').value) || 1);
    const to   = Math.min(totalPages || from, parseInt(document.getElementById('mbBulkTo').value) || from);
    const summaryEl = document.getElementById('mbRangeSummary');
    const genBtn = document.getElementById('mbAiGenBtn');

    if (from > to) {
        summaryEl.textContent = '⚠️ শুরুর পেইজ শেষের চেয়ে বড় হতে পারবে না';
        summaryEl.style.color = 'var(--error,#ef4444)';
        return;
    }
    const count = to - from + 1;
    summaryEl.style.color = 'var(--text2)';
    summaryEl.textContent = `${from} থেকে ${to} পেইজ পর্যন্ত — মোট ${count}টি পেইজে প্রশ্ন তৈরি হবে (PDF-এ মোট ${totalPages} পেইজ)`;
    if (mbGenMode === 'range') {
        genBtn.textContent = mbAiTypeKey === 'special'
            ? `⚡ ${count}টি পেইজের existing MCQ এক্সট্র্যাক্ট করো`
            : `🤖 ${count}টি পেইজ থেকে প্রশ্ন বানান`;
    }
}

// মূল Generate বাটন — mbGenMode অনুযায়ী single-page বা bulk (all/range) generate চালায়
function mbGenerateClick() {
    if (mbGenMode === 'single') { mbAiGenerate(); return; }
    mbStartBulkGenerate();
}

function mbStartBulkGenerate() {
    const totalPages = mbPdfDoc.numPages || 1;
    let from = 1, to = totalPages;
    if (mbGenMode === 'range') {
        from = Math.max(1, parseInt(document.getElementById('mbBulkFrom').value) || 1);
        to   = Math.min(totalPages, parseInt(document.getElementById('mbBulkTo').value) || totalPages);
        if (from > to) { mbToast('শুরুর পেইজ শেষের চেয়ে বড় হতে পারবে না', 'error'); return; }
    }
    // প্রতি পেইজে কতগুলো প্রশ্ন — এখন মূল "প্রশ্ন সংখ্যা" বক্স থেকেই নেওয়া হয় (mbAiCount),
    // যেটা single-page generate এও একই input — ইউজার একবারই সেট করলে সব মোডে কাজ করবে।
    // Range ("5-10") বা single number ("10") উভয়ই সাপোর্টেড — mbGenerateForPage এ পাঠানো হয়।
    const countRaw = (document.getElementById('mbAiCount').value || '10').trim();
    const type  = mbAiTypeKey;

    const job = {
        pdfId: mbPdfId, from, to, countRaw, type,
        currentPage: from, done: false, stopped: false,
        startedAt: Date.now(), totalPages: (to - from + 1), completedCount: 0
    };
    localStorage.setItem(MB_BULK_KEY, JSON.stringify(job));
    mbBulkRunning = true;
    mbRunBulkJob(job);
}

function mbStopBulkGenerate() {
    mbBulkRunning = false;
    try {
        const job = JSON.parse(localStorage.getItem(MB_BULK_KEY) || 'null');
        if (job) { job.stopped = true; localStorage.setItem(MB_BULK_KEY, JSON.stringify(job)); }
    } catch (_) {}
    mbToast('⏹ Bulk generation থামানো হয়েছে', 'info');
    mbUpdateBulkUI(null);
}

function mbUpdateBulkUI(job) {
    const box = document.getElementById('mbBulkBox');
    if (!box) return;
    if (!job || job.done || job.stopped) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const pct = job.totalPages ? Math.round((job.completedCount / job.totalPages) * 100) : 0;
    document.getElementById('mbBulkLabel').textContent =
        `⚡ চলছে: পেইজ ${job.currentPage}/${job.to} (${job.completedCount}/${job.totalPages})`;
    document.getElementById('mbBulkBarFill').style.width = pct + '%';

    // ETA হিসাব — গড় সময়/পেইজ থেকে বাকি পেইজের আনুমানিক সময়
    let etaStr = '';
    if (job.completedCount > 0 && job.startedAt) {
        const elapsedSec = (Date.now() - job.startedAt) / 1000;
        const avgPerPage = elapsedSec / job.completedCount;
        const remainingPages = job.totalPages - job.completedCount;
        const etaSec = Math.round(avgPerPage * remainingPages);
        etaStr = etaSec > 60 ? ` · বাকি ~${Math.ceil(etaSec/60)} মিনিট` : etaSec > 0 ? ` · বাকি ~${etaSec}s` : '';
    }
    const totalMcq = job.totalMcqGenerated || 0;
    document.getElementById('mbBulkStatusLine').textContent =
        `${pct}% সম্পন্ন · মোট ${totalMcq}টি MCQ তৈরি হয়েছে${etaStr}`;

    // চলমান bulk job-এর বর্তমান পেইজ অনুযায়ী page-pill dynamically highlight করো
    document.querySelectorAll('[id^="mbPill-"]').forEach(el => el.classList.remove('mb-pill-active-bulk'));
    const activePill = document.getElementById('mbPill-' + job.currentPage);
    if (activePill) activePill.classList.add('mb-pill-active-bulk');
}

// মূল bulk loop — serially প্রতিটা পেইজে MCQ generate করে save করে, live progress দেখায়।
// Tab বন্ধ না করলে background এ চলতে থাকবে, refresh হলেও mbResumeBulkJob() আবার ধরে নেবে।
async function mbRunBulkJob(job) {
    mbUpdateBulkUI(job);
    for (let p = job.currentPage; p <= job.to; p++) {
        // প্রতি iteration এ localStorage থেকে stop flag চেক করো — থামানো হয়েছে কিনা
        try {
            const liveJob = JSON.parse(localStorage.getItem(MB_BULK_KEY) || 'null');
            if (!liveJob || liveJob.stopped || liveJob.pdfId !== job.pdfId) { mbBulkRunning = false; mbUpdateBulkUI(null); return; }
        } catch (_) {}
        if (!mbBulkRunning) return;

        try {
            const generatedCount = await mbGenerateForPage(p, job.countRaw, job.type);
            job.completedCount++;
            job.totalMcqGenerated = (job.totalMcqGenerated || 0) + (generatedCount || 0);
        } catch (e) {
            console.error('Bulk page ' + p + ' failed:', e.message);
            // একটা পেইজ fail করলেও চালিয়ে যাও — পুরো job থামবে না
        }
        job.currentPage = p + 1;
        localStorage.setItem(MB_BULK_KEY, JSON.stringify(job));
        mbUpdateBulkUI(job);
        // current viewed page হলে summary/list রিফ্রেশ করো
        if (p === mbCurrentPage) { mbRenderPageMcqList(); mbUpdatePageCount(); }
        await mbLoadAllPageMcqs();
        mbRenderPageSummary();
    }
    job.done = true;
    localStorage.setItem(MB_BULK_KEY, JSON.stringify(job));
    mbBulkRunning = false;
    mbUpdateBulkUI(null);
    mbToast(`✓ Bulk generation সম্পন্ন — ${job.completedCount}টি পেইজ প্রসেস হয়েছে`, 'success');
}

// একটা নির্দিষ্ট পেইজের জন্য MCQ generate + save করে — mbAiGenerate এর core logic বিচ্ছিন্ন করে আলাদা করা হয়েছে
// যাতে single-page generate ও bulk generate একই function ব্যবহার করে (কোড ডুপ্লিকেশন এড়াতে)।
async function mbGenerateForPage(pageNum, countRaw, type) {
    if (type === 'special') return await mbGenerateForPageSpecial(pageNum);

    const count = mbParseCountInput(countRaw);
    const typeLabel = { standard: 'সাধারণ', true_false: 'সত্য/মিথ্যা', hard: 'কঠিন' };
    const jsonFormat = `[{"question":"...","option_k":"...","option_kh":"...","option_g":"...","option_gh":"...","correct":"k","explanation":"...","exp_box":{"x":0,"y":0,"w":0,"h":0},"type":"${type}"}]`;
    const savedP = mbGetSavedPrompt(type);
    const basePrompt = (savedP || (
        `${typeLabel[type]||type} ধরনের ${count.label} MCQ তৈরি করো। ` +
        `Content যে ভাষায় আছে সেই ভাষায় রাখো। ` +
        `প্রতিটিতে চারটি বিকল্প (option_k, option_kh, option_g, option_gh) এবং সঠিক উত্তর (k/kh/g/gh) থাকবে।`
    )) + MB_PERMANENT_RULES + MB_EXP_BOX_RULE;

    let rawJson;
    let geminiAlreadyTried = false; // এই page-এ Gemini PDF-native ইতিমধ্যে চেষ্টা হয়েছে কি না —
                                      // fallback chain-এ আবার Gemini কল করে quota নষ্ট না করার জন্য
    if (mbPdfUrl) {
        try {
            const pdfPrompt = `এই PDF-এর পেইজ ${pageNum} দেখো এবং নিচের নির্দেশ অনুসরণ করো:\n${basePrompt}\n\n` +
                `শুধু JSON array রিটার্ন করো, কোনো markdown বা অতিরিক্ত text ছাড়া। Format:\n${jsonFormat}`;
            const res = await fetch(AI_PROXY_URL.replace(/\/$/, '') + '/mcq-from-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdf_url: mbPdfUrl, prompt: pdfPrompt })
            });
            geminiAlreadyTried = true;
            const data = await res.json().catch(() => null);
            if (res.ok && data?.success && data.answer) rawJson = data.answer;
        } catch (_) {}
    }
    if (!rawJson) {
        const page = await mbPdfDoc.getPage(pageNum);
        const textCont = await page.getTextContent();
        const pageText = textCont.items.map(i => i.str).join(' ').trim();
        if (pageText && pageText.length >= 30) {
            const prompt = `নিচের টেক্সট থেকে ${basePrompt}\n` +
                `শুধু JSON array রিটার্ন করো, কোনো markdown বা অতিরিক্ত text ছাড়া। Format:\n${jsonFormat}\n\n` +
                `টেক্সট:\n${pageText.slice(0, 4000)}`;
            rawJson = await mbCallAiApi(prompt, null, null, geminiAlreadyTried);
        } else {
            const vp = page.getViewport({ scale: 1.5 });
            const tmp = document.createElement('canvas');
            tmp.width = vp.width; tmp.height = vp.height;
            await page.render({ canvasContext: tmp.getContext('2d'), viewport: vp }).promise;
            const imageData = { base64: tmp.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
            const sysPrompt = `তুমি একজন অভিজ্ঞ HSC শিক্ষক। এই বইয়ের পেইজের ছবি দেখে ${basePrompt}\n` +
                `শুধু JSON array রিটার্ন করো: ${jsonFormat}`;
            rawJson = await mbCallAiApi('', imageData, sysPrompt, geminiAlreadyTried);
        }
    }

    let parsed = mbParseAiJson(rawJson);
    if (!parsed || !parsed.length) throw new Error('AI সঠিক JSON দেয়নি');

    // Count must-follow: AI যদি চাহিদার চেয়ে কম প্রশ্ন দেয়, এক্সট্রা দিলে সংখ্যা কেটে দেওয়া হয়,
    // কম দিলে warning log রাখা হয় (silently truncate না করে exact min মানা হয় যতটা সম্ভব)।
    if (parsed.length > count.max) parsed = parsed.slice(0, count.max);
    if (parsed.length < count.min) {
        console.warn(`Page ${pageNum}: চাহিদা ছিল ${count.label}, AI দিয়েছে ${parsed.length}টি`);
    }

    const newMcqs = parsed.map(m => ({ id: uid(), ...m, type: m.type || type }));

    // exp_box থেকে topic-crop explanation image বানানো (bulk generation-এও একই লজিক প্রয়োজন)
    // — exp_box missing হলে unique per-MCQ key ব্যবহার করা হয়, নাহলে সব missing-exp_box
    // MCQ একই cache entry শেয়ার করে ভুল/অন্য প্রশ্নের crop image পেয়ে যায়।
    const cropCache = new Map();
    for (const m of newMcqs) {
        const key = m.exp_box ? JSON.stringify(m.exp_box) : `NOBBOX_${m.id}`;
        if (!cropCache.has(key)) cropCache.set(key, await mbCropExplanationImage(pageNum, m.exp_box));
        const img = cropCache.get(key);
        if (img) m.explanation_image = img;
        delete m.exp_box;
    }

    // bug fix: এটা admin panel-এর AI generate (single/bulk উভয়), তাই mcq_type অবশ্যই 'admin' হবে —
    // আগে এখানে mcq_type:type (standard/true_false/hard) সেভ হতো, যার ফলে এই MCQ গুলো
    // ভুলভাবে "ইউজার-জেনারেটেড" হিসেবে দেখাতো এবং edit/delete করা যেতো না।
    const existingRow = mbAllPageData.find(r => r.page_number === pageNum);
    let currentMcqs = [];
    if (existingRow) { try { currentMcqs = JSON.parse(existingRow.questions_json || '[]'); } catch (_) {} }
    currentMcqs.push(...newMcqs);

    const res = await mbApi('/book_page_mcqs', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ pdf_id: parseInt(mbPdfId), page_number: pageNum, mcq_type: 'admin', questions_json: JSON.stringify(currentMcqs) })
    });
    try {
        const data = await res.json();
        const newRow = Array.isArray(data) ? data[0] : data;
        const idx = mbAllPageData.findIndex(r => r.page_number === pageNum);
        if (idx >= 0) mbAllPageData[idx] = newRow; else mbAllPageData.push(newRow);
    } catch (_) {}

    // প্রতিটা পেইজের জন্য আলাদা CSV ফাইল — ফাইলের নামে page no থাকে, শুধু এই batch-এর
    // নতুন প্রশ্নগুলো (পুরো accumulated history না) — যাতে প্রতি পেইজের জন্য পরিষ্কার আলাদা ফাইল তৈরি হয়।
    await mbSaveMcqsAsCsv(newMcqs, pageNum, type);
    return newMcqs.length; // bulk progress-এ total MCQ count ট্র্যাক করার জন্য
}

// Special মোডে bulk (all/range): একটা পেইজে existing MCQ না থাকলে silently skip করে (error না),
// থাকলে extract + save + CSV — mbGenerateForPage এর মতোই একই সেভ পাইপলাইন ব্যবহার করে।
async function mbGenerateForPageSpecial(pageNum) {
    const parsed = await mbSpecialExtractPage(pageNum);
    if (!parsed || !parsed.length) return 0; // এই পেইজে কোনো MCQ নেই — বাদ দাও, error না

    const newMcqs = parsed.map(m => ({ id: uid(), ...mbShuffleSpecialOptions(m), type: 'special' }));

    const existingRow = mbAllPageData.find(r => r.page_number === pageNum);
    let currentMcqs = [];
    if (existingRow) { try { currentMcqs = JSON.parse(existingRow.questions_json || '[]'); } catch (_) {} }
    currentMcqs.push(...newMcqs);

    const res = await mbApi('/book_page_mcqs', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ pdf_id: parseInt(mbPdfId), page_number: pageNum, mcq_type: 'admin', questions_json: JSON.stringify(currentMcqs) })
    });
    try {
        const data = await res.json();
        const newRow = Array.isArray(data) ? data[0] : data;
        const idx = mbAllPageData.findIndex(r => r.page_number === pageNum);
        if (idx >= 0) mbAllPageData[idx] = newRow; else mbAllPageData.push(newRow);
    } catch (_) {}

    await mbSaveMcqsAsCsv(newMcqs, pageNum, 'special');
    return newMcqs.length;
}

// Page reload হলে আগের চলমান job থাকলে সেটা আবার resume করে — "refresh দিলেও কাজ থামবে না"
function mbResumeBulkJob() {
    if (mbBulkRunning) return; // ইতিমধ্যে একটা loop চলছে — নতুন parallel loop শুরু করা যাবে না।
    // bug fix: আগে এই guard না থাকায় mbRunBulkJob প্রতি পেইজে mbLoadAllPageMcqs() কল করত,
    // যেটা আবার mbResumeBulkJob() কল করে নতুন parallel mbRunBulkJob শুরু করে দিত —
    // ফলে একই পেইজ বহুবার generate হতো (CSV doubling এর মূল কারণ)।
    try {
        const job = JSON.parse(localStorage.getItem(MB_BULK_KEY) || 'null');
        if (job && !job.done && !job.stopped && job.pdfId === mbPdfId) {
            mbBulkRunning = true;
            mbUpdateBulkUI(job);
            mbRunBulkJob(job);
        }
    } catch (_) {}
}

function mbDiscardAi() {
    mbAiData = [];
    const resultEl = document.getElementById('mbAiResult');
    if (resultEl) resultEl.style.display = 'none';
    const previewList = document.getElementById('mbAiPreviewList');
    if (previewList) previewList.innerHTML = '';
}

/* ════════════════════════════════════════════════════
   15. EXTRA CSS
   ════════════════════════════════════════════════════ */

function mbInjectStyles() {
    if (document.getElementById('mbExtraStyles')) return;
    const s = document.createElement('style');
    s.id = 'mbExtraStyles';
    s.textContent = `
        .inline-add { display: none; margin-top: 8px; }
        .inline-add.show { display: block; }
        .inline-add-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

        .link-btn {
            background: none; border: none; padding: 4px 0;
            font-size: 12px; font-weight: 700; color: var(--accent);
            cursor: pointer; font-family: inherit;
            display: inline-flex; align-items: center; gap: 4px;
        }
        .link-btn:hover { opacity: 0.75; }

        .card-green::before {
            background: linear-gradient(90deg, var(--green, #10B981), #34D399) !important;
        }

        .type-opt-alt.selected {
            background: rgba(124,131,255,0.12);
            border-color: var(--accent);
            color: #9C8BFF;
        }

        .act-btn.act-toggle { color: var(--text2); }
        .act-btn.act-toggle:hover { color: #F59E0B; border-color: #F59E0B; }

        .pdf-card-meta { font-size: 10px; color: var(--text3); margin-top: 2px; }

        @keyframes mbSpin { to { transform: rotate(360deg); } }
        #mbAiSpinner > div:first-child { animation: mbSpin 0.8s linear infinite !important; }

        .btn.btn-green {
            background: rgba(16,185,129,0.12);
            color: var(--green);
            border: 1.5px solid rgba(16,185,129,0.3);
        }
        .btn.btn-green:hover { background: rgba(16,185,129,0.2); }
    `;
    document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════
   15b. AUTO OCR SYSTEM
   ════════════════════════════════════════════════════ */

const OCR_PROXY_URL = AI_PROXY_URL.replace(/\/$/, '') + '/'; // Same proxy with trailing slash

/* ════════════════════════════════════════════════════
   16. INIT & WINDOW EXPORTS
   ════════════════════════════════════════════════════ */

async function mbInit() {
    mbInjectStyles();
    mbLoadSubjects();
    mbLoadAllPdfs();
    await mbLoadAllPrompts();
    // prompt cache load হওয়ার পর বর্তমান selected type এর জন্য textbox populate করো —
    // আগে এই await ছাড়া কল হওয়ায় AI tab প্রথমবার খুললে prompt box ফাঁকা দেখাতো।
    const promptEl = document.getElementById('mbAiPrompt');
    if (promptEl) promptEl.value = mbGetSavedPrompt(mbAiTypeKey) || '';

    // Refresh/reload করলে আগে যে PDF/page খোলা ছিল সেটাই আবার খোলা হবে —
    // এতদিন panel state কোথাও persist হতো না, তাই refresh দিলে panel বন্ধ হয়ে যেতো।
    try {
        const st = JSON.parse(localStorage.getItem('atlasMbOpenPanel') || 'null');
        if (st && st.pdfId) {
            mbOpenMcqPanel(st.pdfId, st.pdfTitle, st.pdfUrl);
            if (st.page && st.page > 1) {
                setTimeout(() => mbGoToPagePill(st.page), 600); // PDF.js load হওয়ার সময় দিতে সামান্য বিলম্ব
            }
        }
    } catch (_) {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mbInit);
} else {
    mbInit();
}

// Expose to window so HTML onclick= attributes work
window.mbOnSubjectChange  = mbOnSubjectChange;
window.mbOnChapterChange  = mbOnChapterChange;
window.mbToggleNewSubject = mbToggleNewSubject;
window.mbCreateSubject    = mbCreateSubject;
window.mbToggleNewChapter = mbToggleNewChapter;
window.mbCreateChapter    = mbCreateChapter;
window.mbDzOver           = mbDzOver;
window.mbDzLeave          = mbDzLeave;
window.mbDzDrop           = mbDzDrop;
window.mbOnFileSelect     = mbOnFileSelect;
window.mbUploadPdf        = mbUploadPdf;
window.mbLoadChapterPdfs  = mbLoadChapterPdfs;
window.mbOpenMcqPanel     = mbOpenMcqPanel;
window.mbCloseMcqPanel    = mbCloseMcqPanel;
window.mbDeletePdf        = mbDeletePdf;
window.mbTogglePremium    = mbTogglePremium;
window.mbPageStep         = mbPageStep;
window.mbOnPageChange     = mbOnPageChange;
window.mbGoToPagePill     = mbGoToPagePill;
window.mbSwitchTab        = mbSwitchTab;
window.mbSelectAnswer     = mbSelectAnswer;
window.mbSelectType       = mbSelectType;
window.mbSelectAiType     = mbSelectAiType;
window.mbSaveMcq          = mbSaveMcq;
window.mbEditMcq          = mbEditMcq;
window.mbCancelInlineEdit = mbCancelInlineEdit;
window.mbSaveInlineEdit   = mbSaveInlineEdit;
window.mbInlineSelectAnswer = mbInlineSelectAnswer;
window.mbCancelMcqEdit    = mbCancelMcqEdit;
window.mbDeleteMcq        = mbDeleteMcq;
window.mbCsvDragOver      = mbCsvDragOver;
window.mbCsvDragLeave     = mbCsvDragLeave;
window.mbCsvDrop          = mbCsvDrop;
window.mbCsvFileSelect    = mbCsvFileSelect;
window.mbImportCsv        = mbImportCsv;
window.mbAiGenerate       = mbAiGenerate;
window.mbSetGenMode        = mbSetGenMode;
window.mbUpdateRangeSummary= mbUpdateRangeSummary;
window.mbGenerateClick     = mbGenerateClick;
window.mbStartBulkGenerate = mbStartBulkGenerate;
window.mbStopBulkGenerate  = mbStopBulkGenerate;
window.mbSaveAiMcqs       = mbSaveAiMcqs;
window.mbLoadCsvArchive    = mbLoadCsvArchive;
window.mbDownloadCsvArchive= mbDownloadCsvArchive;
window.mbDeleteCsvArchive  = mbDeleteCsvArchive;
window.mbDiscardAi        = mbDiscardAi;

/* ══════════════ ⚡ SPECIAL — শুধু existing MCQ এক্সট্র্যাক্ট (নতুন বানাবে না), CSV export ══════════════
   Admin-only tool: PDF page-এ আগে থেকেই ছাপা MCQ থাকলে সেটা AI দিয়ে হুবহু এক্সট্র্যাক্ট করে,
   option shuffle করে, সরাসরি CSV হিসেবে ডাউনলোড করে দেয়। User-side এ এই ফিচার নেই — শুধু admin panel। */

let mbSpecialScope = null;

function mbOpenSpecialSheet() {
    if (!mbPdfDoc) { mbToast('আগে একটা PDF select করো', 'error'); return; }
    mbSpecialScope = null;
    const rangeBox = document.getElementById('mbSpecialRangeBox');
    const singleBox = document.getElementById('mbSpecialSingleBox');
    const allBox = document.getElementById('mbSpecialAllBox');
    const progress = document.getElementById('mbSpecialProgress');
    if (rangeBox) rangeBox.style.display = 'none';
    if (singleBox) singleBox.style.display = 'none';
    if (allBox) allBox.style.display = 'none';
    if (progress) progress.style.display = 'none';
    const singleInput = document.getElementById('mbSpecialSinglePage');
    if (singleInput) singleInput.value = mbCurrentPage || '';
    const sheet = document.getElementById('mbSpecialSheet');
    if (sheet) sheet.style.display = 'flex';
}

function mbCloseSpecialSheet(e) {
    if (e && e.target && e.target.id !== 'mbSpecialSheet') return;
    const sheet = document.getElementById('mbSpecialSheet');
    if (sheet) sheet.style.display = 'none';
}

function mbPickSpecialScope(scope) {
    mbSpecialScope = scope;
    const rangeBox = document.getElementById('mbSpecialRangeBox');
    const singleBox = document.getElementById('mbSpecialSingleBox');
    const allBox = document.getElementById('mbSpecialAllBox');
    if (rangeBox) rangeBox.style.display = scope === 'range' ? 'block' : 'none';
    if (singleBox) singleBox.style.display = scope === 'single' ? 'block' : 'none';
    if (allBox) allBox.style.display = scope === 'all' ? 'block' : 'none';
}

async function mbConfirmSpecialExtract(scope) {
    let pages = [];
    if (scope === 'single') {
        const p = parseInt((document.getElementById('mbSpecialSinglePage') || {}).value);
        if (!p || p < 1 || p > mbPdfDoc.numPages) { mbToast('সঠিক পেইজ নম্বর দাও', 'error'); return; }
        pages = [p];
    } else if (scope === 'range') {
        const from = parseInt((document.getElementById('mbSpecialRangeFrom') || {}).value);
        const to = parseInt((document.getElementById('mbSpecialRangeTo') || {}).value);
        if (!from || !to || from < 1 || to > mbPdfDoc.numPages || from > to) { mbToast('সঠিক রেঞ্জ দাও', 'error'); return; }
        for (let i = from; i <= to; i++) pages.push(i);
    } else if (scope === 'all') {
        for (let i = 1; i <= mbPdfDoc.numPages; i++) pages.push(i);
    } else { return; }

    const progress = document.getElementById('mbSpecialProgress');
    const progressText = document.getElementById('mbSpecialProgressText');
    if (progress) progress.style.display = 'block';

    let allExtracted = [];
    try {
        for (let i = 0; i < pages.length; i++) {
            if (progressText) progressText.textContent = `পেইজ ${i + 1}/${pages.length} — existing MCQ যাচাই হচ্ছে...`;
            const qs = await mbSpecialExtractPage(pages[i]);
            if (qs && qs.length) {
                allExtracted = allExtracted.concat(qs.map(q => mbSpecialShuffleOptions(mbSpecialConvertToAdminFormat(q, pages[i]))));
            }
        }

        if (!allExtracted.length) {
            if (progress) progress.style.display = 'none';
            mbToast('নির্বাচিত পেইজে কোনো existing MCQ পাওয়া যায়নি', 'error');
            return;
        }

        mbCloseSpecialSheet();
        mbDownloadSpecialCsv(allExtracted, pages);
        mbToast('✓ ' + allExtracted.length + 'টি MCQ এক্সট্র্যাক্ট + CSV ডাউনলোড হয়েছে', 'success');
    } catch (ex) {
        mbToast('এক্সট্র্যাক্ট ব্যর্থ: ' + ex.message, 'error');
    } finally {
        if (progress) progress.style.display = 'none';
    }
}

// Extraction-only prompt — কখনো নতুন MCQ বানাবে না, শুধু পেইজে যা আছে হুবহু বের করবে
function mbSpecialExtractPrompt() {
    const jsonFormat = `{"questions":[{"question":"...","options":["...","...","...","..."],"answer_index":0,"explanation":"..."}]}`;
    return (
        `তুমি একজন নিখুঁত ডেটা-এক্সট্র্যাকশন এক্সপার্ট। তোমার কাজ শুধুমাত্র এই পেইজে ইতিমধ্যে ছাপা/লেখা MCQ প্রশ্নগুলো ` +
        `হুবহু এক্সট্র্যাক্ট করা — নতুন কোনো MCQ কখনোই বানাবে না।\n\n` +
        `কঠোর নিয়ম:\n` +
        `১. পেইজে যতগুলো MCQ (প্রশ্ন + অপশন) ইতিমধ্যে ছাপা আছে, ঠিক ততগুলোই ফেরত দিবে — এক্সট্রা যোগ করবে না, বাদও দিবে না।\n` +
        `২. পেইজে যদি একটাও MCQ না থাকে, questions একটা খালি array [] হিসেবে ফেরত দিবে — কোনো MCQ বানিয়ে দিবে না।\n` +
        `৩. প্রশ্নের টেক্সট ও অপশনগুলো পেইজে যেভাবে লেখা ঠিক সেভাবেই (ভাষা অপরিবর্তিত রেখে) নিবে, নিজের মতো ঘুরিয়ে লিখবে না।\n` +
        `৪. সঠিক উত্তর যদি পেইজে চিহ্নিত/উল্লেখ করা থাকে সেটাই answer_index এ বসাবে (0-based)। উল্লেখ না থাকলে বিষয়বস্তু বিশ্লেষণ করে সঠিক উত্তর নির্ধারণ করবে।\n` +
        `৫. ব্যাখ্যা (explanation) নির্ধারণের নিয়ম — এই ক্রম অনুসারে:\n` +
        `   ক) MCQ-র ঠিক নিচে যদি ব্যাখ্যা লেখা থাকে, সেটাই হুবহু ১০০% কপি করবে (পরিবর্তন করবে না)।\n` +
        `   খ) সরাসরি ব্যাখ্যা না থাকলেও পেইজে MCQ-সম্পর্কিত তথ্য থাকলে সেই তথ্য থেকে ব্যাখ্যা তৈরি করবে।\n` +
        `   গ) পেইজে একেবারেই কোনো তথ্য না থাকলে, তুমি নিজে সবচেয়ে প্রাসঙ্গিক ও সঠিক ব্যাখ্যা লিখবে।\n` +
        `৬. গাণিতিক/রাসায়নিক রাশি লেখার সময় সঠিক সাব/সুপারস্ক্রিপ্ট ইউনিকোড ব্যবহার করবে (x², H₂O ইত্যাদি)।\n` +
        `৭. প্রশ্ন বা ব্যাখ্যায় কখনো "উল্লেখিত চিত্রে", "বক্সে", "উদ্দীপকে", "পৃষ্ঠায়" জাতীয় সোর্স-রেফারেন্স বাক্য ব্যবহার করবে না — স্বয়ংসম্পূর্ণ রাখবে।\n` +
        `৮. এটাই সবচেয়ে গুরুত্বপূর্ণ নিয়ম: তুমি একজন এক্সট্র্যাক্টর, জেনারেটর নও — কোনো অবস্থাতেই নিজের থেকে নতুন প্রশ্ন কল্পনা করে বানাবে না।\n\n` +
        `শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দিবে, অন্য কোনো লেখা/markdown/backtick ছাড়া:\n${jsonFormat}`
    );
}

// একটা পেইজ থেকে existing MCQ extract — 2-attempt retry (empty result হলে একবার recheck)
async function mbSpecialExtractPage(pageNum) {
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const page = await mbPdfDoc.getPage(pageNum);
            const textCont = await page.getTextContent();
            const pageText = textCont.items.map(i => i.str).join(' ').trim();

            let raw;
            if (pageText && pageText.length >= 30) {
                raw = await mbCallAiApi(
                    `নিচের টেক্সট বিশ্লেষণ করো:\n${pageText.slice(0, 8000)}`,
                    null,
                    mbSpecialExtractPrompt()
                );
            } else {
                const imageData = await mbGetPageImageBase64(pageNum);
                if (!imageData) return [];
                raw = await mbCallAiApi('', imageData, mbSpecialExtractPrompt());
            }
            const parsed = mbSpecialParseJson(raw);
            const questions = parsed?.questions || [];
            if (questions.length) return questions; // success
            if (questions.length === 0 && attempt === 1) continue; // প্রথমবার খালি এলে একবার রি-চেক
            return []; // দ্বিতীয়বারও খালি → সত্যিই কোনো MCQ নেই
        } catch (_) {
            if (attempt === MAX_ATTEMPTS) return [];
        }
    }
    return [];
}

// Special প্রম্পট {"questions":[...]} object ফরম্যাটে আসে (mbParseAiJson শুধু array ধরে, তাই আলাদা parser)
function mbSpecialParseJson(raw) {
    if (!raw) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
}

// options[]+answer_index(0-based) ফরম্যাট থেকে admin panel-এর option_k/kh/g/gh+correct ফরম্যাটে রূপান্তর
function mbSpecialConvertToAdminFormat(q, pageNum) {
    const opts = q.options || [];
    const keys = ['k', 'kh', 'g', 'gh'];
    return {
        id: uid(),
        question: q.question || '',
        option_k: opts[0] || '',
        option_kh: opts[1] || '',
        option_g: opts[2] || '',
        option_gh: opts[3] || '',
        correct: keys[q.answer_index] || 'k',
        explanation: q.explanation || '',
        type: 'admin',
        _sourcePage: pageNum
    };
}

// প্রতিটা প্রশ্নের অপশন shuffle করে, সঠিক উত্তর ঠিক রেখে আপডেট করে (admin k/kh/g/gh ফরম্যাটে)
function mbSpecialShuffleOptions(q) {
    const keys = ['k', 'kh', 'g', 'gh'];
    const opts = keys.map((k, i) => ({ v: q['option_' + k] || '', origKey: k }));
    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const newCorrectIdx = opts.findIndex(o => o.origKey === q.correct);
    const out = { ...q };
    keys.forEach((k, i) => { out['option_' + k] = opts[i]?.v || ''; });
    out.correct = keys[newCorrectIdx >= 0 ? newCorrectIdx : 0];
    return out;
}

// এক্সট্র্যাক্ট করা MCQ গুলো দিয়ে CSV বানিয়ে সরাসরি ডাউনলোড করে (admin-এর CSV format ব্যবহার করে)
function mbDownloadSpecialCsv(mcqs, pages) {
    const csvContent = mbBuildCsvFromMcqs(mcqs);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const titleSafe = 'pdf' + (mbPdfId || 'special');
    a.href = url;
    a.download = `special_${titleSafe}_p${pages[0]}-${pages[pages.length - 1]}_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.mbOpenSpecialSheet      = mbOpenSpecialSheet;
window.mbCloseSpecialSheet     = mbCloseSpecialSheet;
window.mbPickSpecialScope      = mbPickSpecialScope;
window.mbConfirmSpecialExtract = mbConfirmSpecialExtract;

})(); // end IIFE


