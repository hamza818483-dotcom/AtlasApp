/* ════════════════════════════════════════════════════════════
   মূলবই-২ EDITOR — pagewise PDF viewer + CSV/AI/MCQ tabs.
   Independent module, fresh implementation (not a copy of the
   মূলবই-১ editor). Uses mb2_pdfs / mb2_page_mcqs tables via the
   existing /d1/ REST layer and /mcq-from-pdf AI endpoint.
   Shares AI_PROXY_URL, D1_API_KEY, esc, fmtDate, mbToast helpers
   already defined by mulboi-mcq-admin.js (loaded earlier).
   ════════════════════════════════════════════════════════════ */

(function () {
'use strict';

// bug fix: এগুলো mulboi-mcq-admin.js এর IIFE-প্রাইভেট ভ্যারিয়েবল/ফাংশন ধরে নিয়ে ব্যবহার
// করা হচ্ছিল, কিন্তু সেগুলো window-এ কখনো এক্সপোজ হয়নি — ফলে এডিটর খুললেই
// "AI_PROXY_URL/esc is not defined" এরর দিতো। এখানে নিজের স্বাধীন কপি রাখা হলো।
const AI_PROXY_URL = 'https://atlas-ai-proxy.hamza818483.workers.dev/';
const D1_API_KEY   = 'mb_d1_9f2a7c6e1b4d8305';
function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function mbToast(msg, type) {
    if (typeof window.mbToast === 'function' && window.mbToast !== mbToast) { window.mbToast(msg, type); return; }
    const t = document.getElementById('toast');
    if (!t) { console.warn('[toast]', msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._ed2Timer);
    t._ed2Timer = setTimeout(() => t.classList.remove('show'), 3000);
}

const ED = {
    pdfId: null,
    pdfTitle: '',
    pdfUrl: '',
    subjectName: '',
    chapterName: '',
    pdfDoc: null,
    numPages: 0,
    page: 1,
    mcqCache: {},      // {pageNum: [mcq,...]}
    pageCounts: {},    // {pageNum: count}
    activeTab: 'mcq',
    csvRows: [],
    aiDraft: [],
    aiMode: 'single',  // single | bulk | range
    bulkRunning: false,
};

function ed2Api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
        'Content-Type': 'application/json',
        'apikey': D1_API_KEY
    }, opts.headers || {});
    return fetch(AI_PROXY_URL.replace(/\/$/, '') + '/d1/' + path.replace(/^\//, ''), opts);
}

/* ── OPEN / CLOSE ── */

function ed2Open(pdfId, title, fileUrl, subjectName, chapterName) {
    ED.pdfId = pdfId;
    ED.pdfTitle = title;
    ED.pdfUrl = fileUrl;
    ED.subjectName = subjectName || '';
    ED.chapterName = chapterName || '';
    ED.pdfDoc = null;
    ED.numPages = 0;
    ED.page = 1;
    ED.mcqCache = {};
    ED.pageCounts = {};
    ED.csvRows = [];
    ED.aiDraft = [];
    ED.aiMode = 'single';

    const head = document.getElementById('ed2Heading');
    if (head) head.textContent = title;
    const ctx = document.getElementById('ed2Context');
    if (ctx) ctx.textContent = (subjectName && chapterName) ? (subjectName + ' › ' + chapterName) : '';

    const sheet = document.getElementById('ed2Sheet');
    if (sheet) { sheet.classList.add('ed2-open'); document.body.style.overflow = 'hidden'; }

    ed2SwitchTab('mcq');
    ed2LoadPageCounts();
    ed2RenderStrip();
    if (fileUrl) ed2LoadPdf(fileUrl);
}

function ed2Close() {
    const sheet = document.getElementById('ed2Sheet');
    if (sheet) sheet.classList.remove('ed2-open');
    document.body.style.overflow = '';
    ED.pdfDoc = null;
    const cv = document.getElementById('ed2Canvas');
    if (cv) { try { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); } catch (_) {} cv.width = 0; cv.height = 0; }
}

/* ── PDF.JS PAGE RENDER ── */

async function ed2LoadPdf(url) {
    const loading = document.getElementById('ed2Loading');
    if (loading) loading.style.display = 'flex';
    try {
        if (typeof pdfjsLib === 'undefined') {
            let waited = 0;
            while (typeof pdfjsLib === 'undefined' && waited < 8000) {
                await new Promise(r => setTimeout(r, 100));
                waited += 100;
            }
            if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not ready');
        }
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        ED.pdfDoc = await pdfjsLib.getDocument({
            url,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
        }).promise;
        ED.numPages = ED.pdfDoc.numPages;
        ed2RenderStrip();
        await ed2RenderPage(ED.page);
        // persist page_count so future opens know pill range even if pdf.js is slow
        if (ED.pdfId) {
            ed2Api('mb2_pdfs?id=eq.' + ED.pdfId, {
                method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
                body: JSON.stringify({ page_count: ED.numPages })
            }).catch(() => {});
        }
    } catch (e) {
        console.warn('ed2LoadPdf failed', e);
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

async function ed2RenderPage(n) {
    if (!ED.pdfDoc || n < 1 || n > ED.pdfDoc.numPages) return;
    ED.page = n;
    const label = document.getElementById('ed2PageLabel');
    if (label) label.textContent = 'পৃষ্ঠা ' + n + ' / ' + (ED.numPages || '?');
    const loading = document.getElementById('ed2Loading');
    if (loading) loading.style.display = 'flex';
    try {
        const page = await ED.pdfDoc.getPage(n);
        const cv = document.getElementById('ed2Canvas');
        const vp = page.getViewport({ scale: 1.4 });
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    } catch (e) {
        console.warn('ed2RenderPage failed', e);
    } finally {
        if (loading) loading.style.display = 'none';
    }
    ed2RenderStrip();
    ed2RenderTabBody();
}

function ed2GoPage(delta) {
    ed2RenderPage(Math.max(1, ED.page + delta));
}

/* Right-to-left finger swipe on the page viewer */
let ed2TouchStartX = null;
function ed2AttachSwipe() {
    const viewer = document.getElementById('ed2Viewer');
    if (!viewer || viewer._ed2SwipeBound) return;
    viewer._ed2SwipeBound = true;
    viewer.addEventListener('touchstart', e => { ed2TouchStartX = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', e => {
        if (ed2TouchStartX == null) return;
        const dx = e.changedTouches[0].clientX - ed2TouchStartX;
        ed2TouchStartX = null;
        if (Math.abs(dx) < 40) return;
        // right-to-left swipe (dx negative) => next page; left-to-right => previous
        if (dx < 0) ed2GoPage(1); else ed2GoPage(-1);
    }, { passive: true });
}

/* ── PAGE STRIP: page pill + MCQ count ── */

async function ed2LoadPageCounts() {
    try {
        const res = await ed2Api('mb2_page_mcqs?pdf_id=eq.' + ED.pdfId + '&select=page_number,questions_json&limit=2000');
        const rows = await res.json();
        ED.pageCounts = {};
        (rows || []).forEach(r => {
            let n = 0;
            try { n = JSON.parse(r.questions_json || '[]').length; } catch (_) {}
            const pn = Number(r.page_number);
            ED.pageCounts[pn] = (ED.pageCounts[pn] || 0) + n;
        });
    } catch (e) { console.warn('ed2LoadPageCounts failed', e); }
    ed2RenderStrip();
}

function ed2RenderStrip() {
    const wrap = document.getElementById('ed2Strip');
    if (!wrap) return;
    const total = ED.numPages || Object.keys(ED.pageCounts).reduce((m, k) => Math.max(m, Number(k)), 0) || 1;
    let html = '';
    for (let p = 1; p <= total; p++) {
        const cnt = ED.pageCounts[p] || 0;
        const active = p === ED.page ? ' ed2-pill-active' : '';
        html += `<button type="button" class="ed2-pill${active}" onclick="ed2GoToPage(${p})">
                    <span class="ed2-pill-num">${p}</span>${cnt ? `<span class="ed2-pill-count">${cnt}</span>` : ''}
                 </button>`;
    }
    wrap.innerHTML = html;
    const cur = wrap.querySelector('.ed2-pill-active');
    if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}

function ed2GoToPage(n) { ed2RenderPage(n); }

/* ── TABS: CSV / AI / MCQ ── */

function ed2SwitchTab(tab) {
    ED.activeTab = tab;
    ['mcq', 'csv', 'ai'].forEach(t => {
        const btn = document.getElementById('ed2Tab_' + t);
        const body = document.getElementById('ed2Body_' + t);
        if (btn) btn.classList.toggle('ed2-tab-active', t === tab);
        if (body) body.style.display = (t === tab) ? 'block' : 'none';
    });
    ed2RenderTabBody();
}

function ed2RenderTabBody() {
    if (ED.activeTab === 'mcq') ed2RenderMcqList();
}

/* ── MCQ TAB (view/manage saved MCQs for current page) ── */

async function ed2FetchPageMcqs(pageNum) {
    if (ED.mcqCache[pageNum]) return ED.mcqCache[pageNum];
    try {
        const res = await ed2Api('mb2_page_mcqs?pdf_id=eq.' + ED.pdfId + '&page_number=eq.' + pageNum + '&limit=1');
        const rows = await res.json();
        const list = (rows && rows[0] && JSON.parse(rows[0].questions_json || '[]')) || [];
        ED.mcqCache[pageNum] = list;
        return list;
    } catch (e) { console.warn('ed2FetchPageMcqs failed', e); return []; }
}

async function ed2RenderMcqList() {
    const listEl = document.getElementById('ed2McqList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="ed2-muted">লোড হচ্ছে...</div>';
    const list = await ed2FetchPageMcqs(ED.page);
    if (!list.length) {
        listEl.innerHTML = '<div class="ed2-muted">এই পৃষ্ঠায় কোনো MCQ নেই। CSV বা AI ট্যাব থেকে যোগ করো।</div>';
        return;
    }
    listEl.innerHTML = list.map((q, i) => `
        <div class="ed2-mcq-card">
            <div class="ed2-mcq-q">${i + 1}. ${esc(q.question || '')}</div>
            <div class="ed2-mcq-opts">
                ${['k', 'kh', 'g', 'gh'].map(k => `<span class="ed2-opt${q.correct === k ? ' ed2-opt-correct' : ''}">${esc(q['option_' + k] || '')}</span>`).join('')}
            </div>
            <button type="button" class="ed2-del-btn" onclick="ed2DeleteMcq(${i})">🗑️ মুছুন</button>
        </div>`).join('');
}

async function ed2SavePageMcqs(pageNum, list) {
    ED.mcqCache[pageNum] = list;
    const body = { pdf_id: ED.pdfId, page_number: pageNum, mcq_type: 'admin', questions_json: JSON.stringify(list) };
    await ed2Api('mb2_page_mcqs?on_conflict=pdf_id,page_number,mcq_type', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(body)
    });
    ED.pageCounts[pageNum] = list.length;
    ed2RenderStrip();
}

async function ed2DeleteMcq(idx) {
    const list = (ED.mcqCache[ED.page] || []).slice();
    list.splice(idx, 1);
    await ed2SavePageMcqs(ED.page, list);
    ed2RenderMcqList();
    mbToast('✓ মুছে ফেলা হয়েছে', 'success');
}

/* ── CSV TAB ── */

function ed2CsvFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => ed2ParseCsv(reader.result);
    reader.readAsText(f);
}

function ed2ParseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { mbToast('CSV ফাঁকা বা ভুল ফরম্যাট', 'error'); return; }
    const header = lines[0].split(',').map(h => h.trim());
    const idx = k => header.indexOf(k);
    ED.csvRows = lines.slice(1).map(line => {
        const cells = line.split(',');
        return {
            question: (cells[idx('question')] || '').trim(),
            option_k: (cells[idx('option_k')] || '').trim(),
            option_kh: (cells[idx('option_kh')] || '').trim(),
            option_g: (cells[idx('option_g')] || '').trim(),
            option_gh: (cells[idx('option_gh')] || '').trim(),
            correct: (cells[idx('correct')] || 'k').trim(),
            explanation: (cells[idx('explanation')] || '').trim(),
        };
    }).filter(r => r.question);
    const info = document.getElementById('ed2CsvInfo');
    if (info) info.textContent = ED.csvRows.length + ' টি প্রশ্ন পাওয়া গেছে — নিচের বাটনে চাপ দিয়ে এই পৃষ্ঠায় যোগ করো।';
    const btn = document.getElementById('ed2CsvImportBtn');
    if (btn) btn.style.display = 'block';
}

async function ed2ImportCsv() {
    if (!ED.csvRows.length) return;
    const existing = await ed2FetchPageMcqs(ED.page);
    const merged = existing.concat(ED.csvRows);
    await ed2SavePageMcqs(ED.page, merged);
    mbToast('✓ ' + ED.csvRows.length + ' টি MCQ যোগ হয়েছে', 'success');
    ED.csvRows = [];
    const info = document.getElementById('ed2CsvInfo');
    if (info) info.textContent = '';
    const btn = document.getElementById('ed2CsvImportBtn');
    if (btn) btn.style.display = 'none';
    ed2SwitchTab('mcq');
}

/* ── AI TAB — pagewise / bulk / range MCQ generation using Groq primary ── */

function ed2SetAiMode(mode) {
    ED.aiMode = mode;
    ['single', 'bulk', 'range'].forEach(m => {
        const btn = document.getElementById('ed2AiMode_' + m);
        if (btn) btn.classList.toggle('ed2-mode-active', m === mode);
    });
    const rangeBox = document.getElementById('ed2RangeBox');
    if (rangeBox) rangeBox.style.display = (mode === 'range') ? 'flex' : 'none';
}

function ed2AiPrompt(count) {
    const n = count || 5;
    return `তুমি একজন বাংলা মেডিকেল/HSC প্রস্তুতি প্রশ্ন প্রণেতা। এই PDF-এর নির্দিষ্ট পৃষ্ঠা থেকে ` +
        `শুধুমাত্র পৃষ্ঠায় থাকা তথ্যের ভিত্তিতে ${n}টি MCQ তৈরি করো। প্রতিটির জন্য question, option_k, ` +
        `option_kh, option_g, option_gh, correct(k/kh/g/gh), explanation দাও। শুধু নিচের JSON array ` +
        `ফরম্যাটে উত্তর দাও, অন্য কোনো টেক্সট/markdown ছাড়া:\n` +
        `[{"question":"...","option_k":"...","option_kh":"...","option_g":"...","option_gh":"...","correct":"k","explanation":"..."}]`;
}

// bug fix: /mcq-from-pdf রুট backend এ (atlas-ai-proxy-worker.js) আসলে সংজ্ঞায়িত নেই —
// রিকোয়েস্ট ফলস-থ্রু হয়ে ডিফল্ট AI proxy handler এ যায়, যেটা body.question/body.image
// আশা করে (pdf_url/prompt না), ফলে সবসময় "question বা image এর একটি দিতে হবে" (400)
// রিটার্ন করত — এই কারণেই "MCQ তৈরি করো" বাটনে ক্লিক করলে কিছুই হতো না (silent throw)।
// ফিক্স: মূলবই-১ এর মতোই — প্রথমে PDF-native পথ চেষ্টা করো (থাকলে ভবিষ্যতে কাজ করবে),
// ব্যর্থ হলে সরাসরি ওই পৃষ্ঠার canvas ছবি (base64) দিয়ে ডিফল্ট /`` এন্ডপয়েন্টে যাও —
// এটাই আসল কাজ করা পথ, backend সবসময় এটাই সাপোর্ট করে।
async function ed2GetPageImageBase64(pageNum) {
    if (!ED.pdfDoc) throw new Error('PDF এখনো লোড হয়নি');
    const page = await ED.pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.6 });
    const cv = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const dataUrl = cv.toDataURL('image/jpeg', 0.85);
    return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

async function ed2CallAi(pageNum, count) {
    const prompt = ed2AiPrompt(count);

    // ১ম চেষ্টা: PDF-native (কাজ না-ও করতে পারে, backend route নেই — চুপচাপ ব্যর্থ হয়ে নিচে যাবে)
    try {
        const pdfPrompt = `এই PDF-এর পৃষ্ঠা ${pageNum} দেখো। ${prompt}`;
        const res = await fetch(AI_PROXY_URL.replace(/\/$/, '') + '/mcq-from-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf_url: ED.pdfUrl, prompt: pdfPrompt })
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success && data.answer) {
            const match = data.answer.match(/\[[\s\S]*\]/);
            if (match) return JSON.parse(match[0]);
        }
    } catch (_) {}

    // ২য় (আসল কাজ করা) পথ: canvas থেকে ছবি নিয়ে ডিফল্ট AI proxy এন্ডপয়েন্ট
    const imageData = await ed2GetPageImageBase64(pageNum);
    const res2 = await fetch(AI_PROXY_URL.replace(/\/$/, ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: '',
            image: imageData,
            systemPrompt: prompt
        })
    });
    const data2 = await res2.json().catch(() => null);
    if (!res2.ok || !data2 || !data2.success || !data2.answer) {
        throw new Error((data2 && data2.error) || 'AI response ব্যর্থ');
    }
    const match2 = data2.answer.match(/\[[\s\S]*\]/);
    if (!match2) throw new Error('AI সঠিক JSON দেয়নি');
    return JSON.parse(match2[0]);
}

async function ed2GenerateClick() {
    const countInput = document.getElementById('ed2AiCount');
    const count = parseInt(countInput && countInput.value) || 5;

    if (ED.aiMode === 'single') {
        return ed2GenerateForPage(ED.page, count);
    }
    if (ED.aiMode === 'bulk') {
        const total = ED.numPages || 1;
        return ed2GenerateRange(1, total, count);
    }
    if (ED.aiMode === 'range') {
        const from = parseInt(document.getElementById('ed2RangeFrom').value) || ED.page;
        const to = parseInt(document.getElementById('ed2RangeTo').value) || ED.page;
        return ed2GenerateRange(from, to, count);
    }
}

async function ed2GenerateForPage(pageNum, count) {
    const spinner = document.getElementById('ed2AiSpinner');
    if (spinner) spinner.style.display = 'block';
    try {
        const mcqs = await ed2CallAi(pageNum, count);
        ED.aiDraft = mcqs;
        ed2RenderAiPreview();
    } catch (e) {
        mbToast('AI জেনারেট ব্যর্থ: ' + e.message, 'error');
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
}

async function ed2GenerateRange(from, to, count) {
    ED.bulkRunning = true;
    const box = document.getElementById('ed2BulkBox');
    if (box) box.style.display = 'block';
    for (let p = from; p <= to; p++) {
        if (!ED.bulkRunning) break;
        const label = document.getElementById('ed2BulkLabel');
        if (label) label.textContent = `⚡ চলছে: পৃষ্ঠা ${p}/${to}`;
        try {
            const mcqs = await ed2CallAi(p, count);
            const existing = await ed2FetchPageMcqs(p);
            await ed2SavePageMcqs(p, existing.concat(mcqs));
        } catch (e) {
            console.warn('bulk page failed', p, e.message);
        }
        const fill = document.getElementById('ed2BulkFill');
        if (fill) fill.style.width = Math.round(((p - from + 1) / (to - from + 1)) * 100) + '%';
    }
    ED.bulkRunning = false;
    if (box) box.style.display = 'none';
    mbToast('✓ বাল্ক জেনারেশন শেষ', 'success');
    ed2RenderMcqList();
}

function ed2StopBulk() { ED.bulkRunning = false; }

function ed2RenderAiPreview() {
    const wrap = document.getElementById('ed2AiPreview');
    if (!wrap) return;
    if (!ED.aiDraft.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    wrap.innerHTML = ED.aiDraft.map((q, i) => `
        <div class="ed2-mcq-card">
            <div class="ed2-mcq-q">${i + 1}. ${esc(q.question || '')}</div>
            <div class="ed2-mcq-opts">
                ${['k', 'kh', 'g', 'gh'].map(k => `<span class="ed2-opt${q.correct === k ? ' ed2-opt-correct' : ''}">${esc(q['option_' + k] || '')}</span>`).join('')}
            </div>
        </div>`).join('') +
        `<div class="ed2-ai-actions">
            <button type="button" class="ed2-btn-outline" onclick="ed2DiscardAiDraft()">✕ বাতিল</button>
            <button type="button" class="ed2-btn-primary" onclick="ed2SaveAiDraft()">✓ সংরক্ষণ করো</button>
         </div>`;
}

function ed2DiscardAiDraft() {
    ED.aiDraft = [];
    ed2RenderAiPreview();
}

async function ed2SaveAiDraft() {
    if (!ED.aiDraft.length) return;
    const existing = await ed2FetchPageMcqs(ED.page);
    await ed2SavePageMcqs(ED.page, existing.concat(ED.aiDraft));
    mbToast('✓ ' + ED.aiDraft.length + ' টি MCQ সংরক্ষণ হয়েছে', 'success');
    ED.aiDraft = [];
    ed2RenderAiPreview();
    ed2SwitchTab('mcq');
}

/* ── EXPORTS ── */
window.ed2Open            = ed2Open;
window.ed2Close            = ed2Close;
window.ed2GoPage           = ed2GoPage;
window.ed2GoToPage         = ed2GoToPage;
window.ed2SwitchTab        = ed2SwitchTab;
window.ed2DeleteMcq        = ed2DeleteMcq;
window.ed2CsvFileSelect    = ed2CsvFileSelect;
window.ed2ImportCsv        = ed2ImportCsv;
window.ed2SetAiMode        = ed2SetAiMode;
window.ed2GenerateClick    = ed2GenerateClick;
window.ed2StopBulk         = ed2StopBulk;
window.ed2DiscardAiDraft   = ed2DiscardAiDraft;
window.ed2SaveAiDraft      = ed2SaveAiDraft;
window.ed2AttachSwipe      = ed2AttachSwipe;

document.addEventListener('DOMContentLoaded', ed2AttachSwipe);
if (document.readyState !== 'loading') ed2AttachSwipe();

})();
