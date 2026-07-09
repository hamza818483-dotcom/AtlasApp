/* ════════════════════════════════════════════════════════════
   মূলবই-২ ADMIN — independent PDF/subject/chapter/MCQ system,
   backed by mb2_subjects / mb2_chapters / mb2_pdfs / mb2_page_mcqs
   (auto-created server-side). Reuses the same AI_PROXY_URL / D1_API_KEY
   / mbToast / esc / fmtDate helpers already defined by mulboi-mcq-admin.js
   (loaded on the same page before this file).
   ════════════════════════════════════════════════════════════ */

let mb2PdfFile = null;
let mb2IsPremium = false;
let mb2ChapterId = null;
let mb2SubjectId = null;

function mb2Api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
        'Content-Type': 'application/json',
        'apikey': D1_API_KEY
    }, opts.headers || {});
    return fetch(AI_PROXY_URL.replace(/\/$/, '') + '/d1/' + path.replace(/^\//, ''), opts);
}

function mb2SelectAccess(premium) {
    mb2IsPremium = premium;
    document.getElementById('mb2AccFree').classList.toggle('selected', !premium);
    document.getElementById('mb2AccPremium').classList.toggle('selected', premium);
}

function mb2DzOver(e) { e.preventDefault(); document.getElementById('mb2DropZone').classList.add('dragover'); }
function mb2DzLeave() { document.getElementById('mb2DropZone').classList.remove('dragover'); }
function mb2DzDrop(e) {
    e.preventDefault();
    document.getElementById('mb2DropZone').classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') mb2SetFile(f);
    else mbToast('শুধু PDF ফাইল গ্রহণযোগ্য', 'error');
}
function mb2OnFileSelect(e) { if (e.target.files[0]) mb2SetFile(e.target.files[0]); }
function mb2SetFile(f) {
    mb2PdfFile = f;
    const fc = document.getElementById('mb2FileChosen');
    if (fc) { fc.textContent = '✓ ' + f.name; fc.style.display = 'block'; }
    const t = document.getElementById('mb2PdfTitle');
    if (t && !t.value) t.value = f.name.replace(/\.pdf$/i, '');
}

async function mb2FindOrCreateSubject(name) {
    let res = await mb2Api('mb2_subjects?name=eq.' + encodeURIComponent(name) + '&limit=1');
    let rows = await res.json();
    if (Array.isArray(rows) && rows.length) return rows[0].id;
    res = await mb2Api('mb2_subjects', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ name, icon: '📚', description: '', sort_order: 0 })
    });
    const data = await res.json();
    return Array.isArray(data) ? data[0].id : data.id;
}

async function mb2FindOrCreateChapter(subjectId, name) {
    let res = await mb2Api('mb2_chapters?subject_id=eq.' + subjectId + '&name=eq.' + encodeURIComponent(name) + '&limit=1');
    let rows = await res.json();
    if (Array.isArray(rows) && rows.length) return rows[0].id;
    res = await mb2Api('mb2_chapters', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ subject_id: subjectId, name, sort_order: 0 })
    });
    const data = await res.json();
    return Array.isArray(data) ? data[0].id : data.id;
}

async function mb2LoadDatalists() {
    try {
        const res = await mb2Api('mb2_subjects?select=id,name&order=sort_order.asc,created_at.asc&limit=200');
        const rows = await res.json();
        const dl = document.getElementById('mb2SubjectList');
        if (dl) dl.innerHTML = (rows || []).map(s => `<option value="${esc(s.name)}">`).join('');
    } catch (e) { console.error('mb2LoadDatalists subjects failed', e); }
    try {
        const res = await mb2Api('mb2_chapters?select=id,name&order=sort_order.asc,created_at.asc&limit=500');
        const rows = await res.json();
        const dl = document.getElementById('mb2ChapterList');
        if (dl) dl.innerHTML = (rows || []).map(c => `<option value="${esc(c.name)}">`).join('');
    } catch (e) { console.error('mb2LoadDatalists chapters failed', e); }
}

async function mb2UploadPdf() {
    const subjectName = (document.getElementById('mb2Subject').value || '').trim();
    const chapterName = (document.getElementById('mb2Chapter').value || '').trim();
    const title = (document.getElementById('mb2PdfTitle').value || '').trim();
    if (!subjectName) { mbToast('বিষয়ের নাম লিখুন', 'error'); return; }
    if (!chapterName) { mbToast('অধ্যায়ের নাম লিখুন', 'error'); return; }
    if (!title)       { mbToast('PDF শিরোনাম লিখুন', 'error'); return; }
    if (!mb2PdfFile)  { mbToast('PDF ফাইল নির্বাচন করুন', 'error'); return; }

    const btn = document.getElementById('mb2UploadBtn');
    const pw  = document.getElementById('mb2ProgressWrap');
    const pf  = document.getElementById('mb2ProgressFill');
    const pl  = document.getElementById('mb2ProgressLabel');

    btn.disabled = true;
    btn.textContent = 'আপলোড হচ্ছে...';
    if (pw) pw.style.display = 'block';
    if (pf) pf.style.width = '0%';

    try {
        const subjectId = await mb2FindOrCreateSubject(subjectName);
        const chapterId = await mb2FindOrCreateChapter(subjectId, chapterName);

        if (pl) pl.textContent = 'PDF আপলোড হচ্ছে...';
        const fileName = Date.now() + '_' + mb2PdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', AI_PROXY_URL.replace(/\/$/, '') + '/storage/pdfs/' + fileName);
            xhr.setRequestHeader('apikey', D1_API_KEY);
            xhr.upload.onprogress = ev => {
                if (ev.lengthComputable && pf) {
                    const pct = Math.round(ev.loaded / ev.total * 90);
                    pf.style.width = pct + '%';
                    if (pl) pl.textContent = 'আপলোড হচ্ছে... ' + pct + '%';
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else { try { reject(new Error(JSON.parse(xhr.responseText).error || 'আপলোড ব্যর্থ')); }
                       catch { reject(new Error('আপলোড ব্যর্থ (' + xhr.status + ')')); } }
            };
            xhr.onerror = () => reject(new Error('নেটওয়ার্ক ত্রুটি'));
            xhr.send(mb2PdfFile);
        });

        const fileUrl = AI_PROXY_URL.replace(/\/$/, '') + '/storage/pdfs/' + fileName;

        if (pl) pl.textContent = 'রেকর্ড সংরক্ষণ করছে...';
        if (pf) pf.style.width = '95%';

        const dbRes = await mb2Api('mb2_pdfs', {
            method: 'POST',
            body: JSON.stringify({
                chapter_id: chapterId, title, file_url: fileUrl,
                page_count: 0, is_premium: mb2IsPremium, sort_order: 0
            })
        });
        if (!dbRes.ok) { const err = await dbRes.json().catch(() => ({})); throw new Error(err.message || 'DB রেকর্ড তৈরি ব্যর্থ'); }

        if (pf) pf.style.width = '100%';
        mbToast('✓ PDF আপলোড সম্পন্ন', 'success');

        mb2PdfFile = null;
        document.getElementById('mb2PdfTitle').value = '';
        document.getElementById('mb2PdfFileInput').value = '';
        document.getElementById('mb2Subject').value = '';
        document.getElementById('mb2Chapter').value = '';
        mb2SelectAccess(false);
        const fc = document.getElementById('mb2FileChosen');
        if (fc) fc.style.display = 'none';

        mb2LoadDatalists();
        mb2LoadAllPdfs();

    } catch (e) {
        mbToast('আপলোড ব্যর্থ: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'আপলোড করো';
        setTimeout(() => { if (pw) pw.style.display = 'none'; }, 2000);
    }
}

async function mb2LoadAllPdfs(isRetry) {
    const listEl = document.getElementById('mb2AllPdfsList');
    if (!listEl) return;
    if (!isRetry) listEl.innerHTML = '<div class="skeleton skel-row"></div>';
    let pdfs = [];
    try {
        const res = await mb2Api('mb2_pdfs?select=*,mb2_chapters(name,mb2_subjects(name,icon))&order=created_at.desc&limit=200');
        if (!res.ok) throw new Error('status ' + res.status);
        pdfs = await res.json();
    } catch (e) {
        if (!isRetry) { await new Promise(r => setTimeout(r, 1000)); return mb2LoadAllPdfs(true); }
        listEl.innerHTML = '<div class="empty-state">লোড ব্যর্থ — ' +
            '<button type="button" onclick="mb2LoadAllPdfs()" style="margin-left:8px;padding:4px 12px;border-radius:6px;border:1px solid var(--accent);background:rgba(108,99,255,0.1);color:#9C8BFF;cursor:pointer;font-size:12px">🔄 আবার চেষ্টা করুন</button></div>';
        return;
    }
    mb2RenderAllPdfs(pdfs || []);
}

function mb2RenderAllPdfs(pdfs) {
    const listEl = document.getElementById('mb2AllPdfsList');
    if (!listEl) return;
    if (!pdfs.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-title">কোনো PDF নেই</div></div>';
        return;
    }
    const groups = {};
    pdfs.forEach(p => {
        const ch = p.mb2_chapters || {};
        const sub = ch.mb2_subjects || {};
        const subName = sub.name || 'অজানা বিষয়';
        const chName = ch.name || 'অজানা অধ্যায়';
        if (!groups[subName]) groups[subName] = { icon: sub.icon || '📚', chapters: {} };
        if (!groups[subName].chapters[chName]) groups[subName].chapters[chName] = [];
        groups[subName].chapters[chName].push(p);
    });
    let html = '';
    Object.keys(groups).forEach(subName => {
        const g = groups[subName];
        const subTotal = Object.values(g.chapters).reduce((n, arr) => n + arr.length, 0);
        html += `<div class="section-header" style="margin-top:8px;"><div class="section-title">${esc(g.icon)} ${esc(subName)} (${subTotal})</div></div>`;
        Object.keys(g.chapters).forEach(chName => {
            const items = g.chapters[chName];
            html += `<div style="font-size:11px;font-weight:600;color:var(--text2);margin:6px 0 4px 4px;">📖 ${esc(chName)} (${items.length})</div>`;
            items.forEach(p => {
                html += `
                <div class="pdf-card">
                    <div class="pdf-card-top">
                        <div class="pdf-card-icon">📕</div>
                        <div class="pdf-card-info">
                            <div class="pdf-card-title">${esc(p.title)} ${p.is_premium ? '<span style="color:#f5c542">⭐ Premium</span>' : '<span style="color:#4ade80">🔓 Free</span>'}</div>
                            <div class="pdf-card-meta">${p.page_count ? p.page_count + ' পৃষ্ঠা · ' : ''}${fmtDate(p.created_at)}</div>
                        </div>
                        <div class="pdf-card-actions">
                            <button class="act-btn act-toggle" title="${p.is_premium ? 'Free করো' : 'Premium করো'}" onclick="mb2TogglePremium(${p.id}, ${!p.is_premium})">${p.is_premium ? '⭐' : '🔓'}</button>
                            <button class="act-btn act-edit" title="Edit" onclick="mb2OpenEditPanel(${p.id}, '${esc(p.title)}', '${esc(p.file_url)}', '${esc(subName)}', '${esc(chName)}')">📝</button>
                            <button class="act-btn act-delete" title="মুছুন" onclick="mb2DeletePdf(${p.id}, '${esc(p.title)}')">🗑️</button>
                        </div>
                    </div>
                </div>`;
            });
        });
    });
    listEl.innerHTML = html;
}

async function mb2TogglePremium(pdfId, newState) {
    try {
        await mb2Api('mb2_pdfs?id=eq.' + pdfId, { method: 'PATCH', body: JSON.stringify({ is_premium: newState }) });
        mbToast(newState ? '⭐ Premium করা হয়েছে' : '🔓 Free করা হয়েছে', 'success');
        mb2LoadAllPdfs();
    } catch { mbToast('আপডেট ব্যর্থ', 'error'); }
}

async function mb2DeletePdf(id, title) {
    if (!confirm('"' + title + '" মুছে ফেলবেন? এই PDF এর সব MCQ ও ডেটা মুছে যাবে।')) return;
    try {
        await mb2Api('mb2_page_mcqs?pdf_id=eq.' + id, { method: 'DELETE' });
        await mb2Api('mb2_pdfs?id=eq.' + id, { method: 'DELETE' });
        mbToast('✓ PDF মুছে গেছে', 'success');
        mb2LoadAllPdfs();
    } catch { mbToast('মুছতে ব্যর্থ', 'error'); }
}

function mb2OpenEditPanel(pdfId, title, fileUrl, subName, chName) {
    if (typeof ed2Open === 'function') {
        ed2Open(pdfId, title, fileUrl, subName, chName);
    } else {
        mbToast('এডিটর লোড হয়নি, পেইজ রিফ্রেশ করুন', 'error');
    }
}

window.mb2SelectAccess   = mb2SelectAccess;
window.mb2DzOver         = mb2DzOver;
window.mb2DzLeave        = mb2DzLeave;
window.mb2DzDrop         = mb2DzDrop;
window.mb2OnFileSelect   = mb2OnFileSelect;
window.mb2UploadPdf      = mb2UploadPdf;
window.mb2LoadDatalists  = mb2LoadDatalists;
window.mb2LoadAllPdfs    = mb2LoadAllPdfs;
window.mb2TogglePremium  = mb2TogglePremium;
window.mb2DeletePdf      = mb2DeletePdf;
window.mb2OpenEditPanel  = mb2OpenEditPanel;
