/*
 * mulboi-mcq-admin.js
 * মূলবই (Main Book) PDF ও MCQ ব্যবস্থাপনা — AtlasPro থেকে অভিযোজিত, Supabase REST API ব্যবহার করে।
 * সব ফাংশন ও ভ্যারিয়েবল 'mb' prefix দিয়ে শুরু — admin.html এর অন্য কোডের সাথে কোনো conflict নেই।
 */

(function () {
'use strict';

// All AI calls (CSV-free MCQ generation, etc.) go through this single proxy
// worker — no provider API key ever lives in this file or admin.html.
const AI_PROXY_URL = 'https://atlas-ai-proxy.YOUR_SUBDOMAIN.workers.dev/';

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
let mbCurrentPage = 1;
let mbAllPageData = [];
let mbEditingId   = null;
let mbAnswerKey   = null;
let mbTypeKey     = 'standard';
let mbAiTypeKey   = 'standard';
let mbCsvData     = [];
let mbAiData      = [];

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
        document.getElementById('mbNewSubjectIcon').value = '';
    }
}

async function mbCreateSubject() {
    const name = document.getElementById('mbNewSubjectName').value.trim();
    const icon = document.getElementById('mbNewSubjectIcon').value.trim() || '📚';
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
        mbToast('✓ PDF আপলোড সম্পন্ন', 'success');

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
    try {
        const res = await mbApi('/book_pdfs?select=*,book_chapters(name,book_subjects(name,icon))&order=created_at.desc&limit=100');
        if (!res.ok) throw new Error();
        const pdfs = await res.json();
        mbRenderAllPdfs(pdfs || []);
    } catch {
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

    mbLoadAllPageMcqs().then(() => {
        mbRenderPageSummary();
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
    const loadingEl = document.getElementById('mbPreviewLoading');
    if (loadingEl) loadingEl.classList.add('show');
    try {
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        mbPdfDoc = await pdfjsLib.getDocument({ url }).promise;
        const pi = document.getElementById('mbPageInput');
        if (pi) pi.max = mbPdfDoc.numPages;
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

    // Build page→count map from all loaded MCQ rows
    const pageCounts = {};
    mbAllPageData.forEach(row => {
        try {
            const qs = JSON.parse(row.questions_json || '[]');
            pageCounts[row.page_number] = (pageCounts[row.page_number] || 0) + qs.length;
        } catch {}
    });

    // Total pages = max of (pages with MCQs, currentPage, numPages from PDF.js) capped at 50
    const maxFromMcqs = Object.keys(pageCounts).length ? Math.max(...Object.keys(pageCounts).map(Number)) : 0;
    const numPdfPages = mbPdfDoc ? mbPdfDoc.numPages : 0;
    const totalPages  = Math.min(Math.max(maxFromMcqs, mbCurrentPage, numPdfPages, 1), 50);

    if (totalPages <= 1 && !Object.keys(pageCounts).length) { wrap.innerHTML = ''; return; }

    let html = '';
    for (let p = 1; p <= totalPages; p++) {
        const cnt      = pageCounts[p] || 0;
        const isActive = p === mbCurrentPage;
        const hasMcqs  = cnt > 0;
        html += `<button onclick="mbGoToPagePill(${p})" id="mbPill-${p}" style="
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
    try {
        const res = await mbApi(
            '/book_page_mcqs?pdf_id=eq.' + mbPdfId +
            '&mcq_type=eq.admin&select=id,page_number,questions_json&limit=500'
        );
        if (!res.ok) throw new Error();
        mbAllPageData = await res.json() || [];
    } catch {
        mbAllPageData = [];
    }
}

function mbGetPageMcqs(pageNum) {
    const row = mbAllPageData.find(r => r.page_number === pageNum);
    if (!row) return [];
    try { return JSON.parse(row.questions_json || '[]'); } catch { return []; }
}

async function mbUpsertPageMcqs(pageNum, mcqs) {
    const body = {
        pdf_id:         parseInt(mbPdfId),
        page_number:    pageNum,
        mcq_type:       'admin',
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
    const idx = mbAllPageData.findIndex(r => r.page_number === pageNum);
    if (idx >= 0) mbAllPageData[idx] = newRow;
    else mbAllPageData.push(newRow);
}

function mbUpdatePageCount() {
    const mcqs = mbGetPageMcqs(mbCurrentPage);
    const pc = document.getElementById('mbPageCount');
    if (pc) pc.textContent = mcqs.length + ' টি MCQ';
}

/* ════════════════════════════════════════════════════
   11. TAB SWITCHING
   ════════════════════════════════════════════════════ */

function mbSwitchTab(name) {
    const tabs = { manual: 'Manual', csv: 'Csv', ai: 'Ai' };
    Object.keys(tabs).forEach(t => {
        const btn = document.getElementById('mbTabBtn' + tabs[t]);
        const pan = document.getElementById('mbTab'    + tabs[t]);
        if (btn) btn.classList.toggle('active', t === name);
        if (pan) pan.classList.toggle('active', t === name);
    });
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

function mbSelectAiType(type) {
    mbAiTypeKey = type;
    const typeMap = { standard: 'Standard', true_false: 'TrueFalse', hard: 'Hard' };
    Object.keys(typeMap).forEach(t => {
        const el = document.getElementById('mbAiType' + typeMap[t]);
        if (el) el.classList.toggle('selected', t === type);
    });
    const at = document.getElementById('mbAiType');
    if (at) at.value = type;
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

function mbEditMcq(mcqId) {
    const mcqs = mbGetPageMcqs(mbCurrentPage);
    const m = mcqs.find(q => q.id === mcqId);
    if (!m) return;

    mbEditingId = mcqId;

    const q  = document.getElementById('mbMcqQuestion');
    const ok = document.getElementById('mbOptK');
    const okh= document.getElementById('mbOptKh');
    const og = document.getElementById('mbOptG');
    const ogh= document.getElementById('mbOptGh');
    const ex = document.getElementById('mbMcqExplanation');

    if (q)   q.value   = m.question     || '';
    if (ok)  ok.value  = m.option_k     || '';
    if (okh) okh.value = m.option_kh    || '';
    if (og)  og.value  = m.option_g     || '';
    if (ogh) ogh.value = m.option_gh    || '';
    if (ex)  ex.value  = m.explanation  || '';

    mbSelectAnswer(m.correct  || 'k');
    mbSelectType(m.type       || 'standard');

    const title = document.getElementById('mbManualFormTitle');
    if (title) title.textContent = '✏️ প্রশ্ন সম্পাদনা';
    const cancelBtn = document.getElementById('mbMcqCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    const saveBtn = document.getElementById('mbMcqSaveBtn');
    if (saveBtn) saveBtn.textContent = '✓ আপডেট করো';

    mbSwitchTab('manual');
    const form = document.getElementById('mbMcqForm');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mbCancelMcqEdit() {
    mbResetMcqForm();
}

async function mbDeleteMcq(mcqId) {
    if (!confirm('এই প্রশ্নটি মুছে ফেলবেন?')) return;
    try {
        const currentMcqs = mbGetPageMcqs(mbCurrentPage).filter(m => m.id !== mcqId);
        await mbUpsertPageMcqs(mbCurrentPage, currentMcqs);
        mbToast('✓ প্রশ্ন মুছে গেছে', 'success');
        mbRenderPageMcqList();
        mbUpdatePageCount();
        mbRenderPageSummary();
    } catch (ex) {
        mbToast('মুছতে ব্যর্থ: ' + ex.message, 'error');
    }
}

function mbRenderPageMcqList() {
    const listEl = document.getElementById('mbMcqList');
    if (!listEl) return;

    const mcqs = mbGetPageMcqs(mbCurrentPage);

    if (!mcqs.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">এই পেইজে কোনো MCQ নেই। উপরে যোগ করুন।</div>';
        return;
    }

    const labelMap = { k: 'ক', kh: 'খ', g: 'গ', gh: 'ঘ' };
    const typeLabel = { standard: 'Standard', true_false: 'True-False', hard: 'Hard' };

    listEl.innerHTML = mcqs.map((m, idx) => `
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
            <div style="margin-top:6px">
                <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(108,99,255,0.1);color:#9C8BFF;text-transform:uppercase">${typeLabel[m.type]||m.type||'standard'}</span>
            </div>
        </div>`).join('');
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
            const idx    = h => header.indexOf(h);
            const qIdx   = idx('question');
            const kIdx   = idx('option_k');
            const khIdx  = idx('option_kh');
            const gIdx   = idx('option_g');
            const ghIdx  = idx('option_gh');
            const cIdx   = idx('correct');
            const eIdx   = idx('explanation');
            const tIdx   = idx('type');

            if (qIdx < 0 || kIdx < 0 || cIdx < 0) {
                mbToast('CSV হেডার ভুল। question, option_k, correct কলাম প্রয়োজন।', 'error');
                return;
            }

            mbCsvData = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = mbSplitCsv(lines[i]);
                const q = cols[qIdx] ? cols[qIdx].trim() : '';
                if (!q) continue;
                mbCsvData.push({
                    id:          uid(),
                    question:    q,
                    option_k:    kIdx  >= 0 ? (cols[kIdx]  || '').trim() : '',
                    option_kh:   khIdx >= 0 ? (cols[khIdx] || '').trim() : '',
                    option_g:    gIdx  >= 0 ? (cols[gIdx]  || '').trim() : '',
                    option_gh:   ghIdx >= 0 ? (cols[ghIdx] || '').trim() : '',
                    correct:     cIdx  >= 0 ? (cols[cIdx]  || 'k').trim().toLowerCase() : 'k',
                    explanation: eIdx  >= 0 ? (cols[eIdx]  || '').trim() : '',
                    type:        tIdx  >= 0 ? (cols[tIdx]  || 'standard').trim() : 'standard'
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

async function mbAiGenerate() {
    if (!mbPdfDoc) { mbToast('আগে একটি PDF খুলুন', 'error'); return; }

    const count    = parseInt((document.getElementById('mbAiCount') || {}).value) || 10;
    const type     = mbAiTypeKey;
    const customP  = ((document.getElementById('mbAiPrompt') || {}).value || '').trim();

    const spinner  = document.getElementById('mbAiSpinner');
    const genBtn   = document.getElementById('mbAiGenBtn');
    const resultEl = document.getElementById('mbAiResult');

    if (spinner)  spinner.style.display  = 'block';
    if (genBtn)   genBtn.style.display   = 'none';
    if (resultEl) resultEl.style.display = 'none';
    mbAiData = [];

    try {
        const page     = await mbPdfDoc.getPage(mbCurrentPage);
        const textCont = await page.getTextContent();
        const pageText = textCont.items.map(i => i.str).join(' ').trim();

        if (!pageText || pageText.length < 30) {
            mbToast('পেইজে পর্যাপ্ত টেক্সট নেই (text-based PDF প্রয়োজন)', 'error');
            return;
        }

        const typeLabel = { standard: 'সাধারণ', true_false: 'সত্য/মিথ্যা', hard: 'কঠিন' };
        const prompt = customP || (
            `নিচের টেক্সট থেকে ${count}টি ${typeLabel[type]||type} MCQ তৈরি করো। ` +
            `Content যে ভাষায় আছে সেই ভাষায় রাখো। ` +
            `প্রতিটিতে চারটি বিকল্প (option_k, option_kh, option_g, option_gh) এবং সঠিক উত্তর (k/kh/g/gh) থাকবে। ` +
            `শুধু JSON array রিটার্ন করো, কোনো markdown বা অতিরিক্ত text ছাড়া। Format:\n` +
            `[{"question":"...","option_k":"...","option_kh":"...","option_g":"...","option_gh":"...","correct":"k","explanation":"...","type":"${type}"}]\n\n` +
            `টেক্সট:\n${pageText.slice(0, 4000)}`
        );

        const rawJson = await mbCallAiApi(prompt);
        const parsed  = mbParseAiJson(rawJson);

        if (!parsed || !parsed.length) {
            mbToast('AI সঠিক JSON দেয়নি। পুনরায় চেষ্টা করুন।', 'error');
            return;
        }

        mbAiData = parsed.map(m => ({ id: uid(), ...m, type: m.type || type }));

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

// All AI calls now go through the centralized proxy worker — no API key lives in
// this file or any client-side code. See atlas-ai-proxy-worker.js for the actual
// provider fallback chain (Gemini → OpenRouter → Groq → Cerebras → Cloudflare AI).
async function mbCallAiApi(prompt, image) {
    const res = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: prompt,
            image: image ? { base64: image.base64, mimeType: image.mimeType } : null,
            systemPrompt: 'তুমি একজন অভিজ্ঞ HSC শিক্ষক যে নির্ভুল MCQ তৈরি করতে পারো।'
        })
    });
    if (!res.ok) throw new Error('AI প্রক্সি ব্যর্থ (' + res.status + ')');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'AI থেকে কোনো উত্তর পাওয়া যায়নি');
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
        mbToast('✓ ' + mbAiData.length + 'টি AI MCQ সংরক্ষিত হয়েছে', 'success');
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
   16. INIT & WINDOW EXPORTS
   ════════════════════════════════════════════════════ */

function mbInit() {
    mbInjectStyles();
    mbLoadSubjects();
    mbLoadAllPdfs();
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
window.mbCancelMcqEdit    = mbCancelMcqEdit;
window.mbDeleteMcq        = mbDeleteMcq;
window.mbCsvDragOver      = mbCsvDragOver;
window.mbCsvDragLeave     = mbCsvDragLeave;
window.mbCsvDrop          = mbCsvDrop;
window.mbCsvFileSelect    = mbCsvFileSelect;
window.mbImportCsv        = mbImportCsv;
window.mbAiGenerate       = mbAiGenerate;
window.mbSaveAiMcqs       = mbSaveAiMcqs;
window.mbDiscardAi        = mbDiscardAi;

})(); // end IIFE
