/* 
   AtlasApp - Mulboi MCQ Admin (AtlasPro 100% Match Version)
   This script handles the subject/chapter management and MCQ editing
   exactly like AtlasPro.
*/

/* ── STATE ── */
let activePdfId = null;
let activePdfTitle = '';
let currentPage = 1;
let allMcqs = [];
let allPdfMcqs = [];
let selAnswerKey = null;
let selTypeKey = 'standard';
let cachedPdfDoc = null;
let cachedPdfUrl = null;

/* ── HELPERS ── */
function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function mbToast(msg, type = 'info') {
    if (typeof showToast === 'function') showToast(msg, type);
    else alert(msg);
}

async function api(path, opts) {
    // In AtlasApp, we use Supabase REST or custom worker. 
    // For simplicity, we'll map this to the existing Supabase calls.
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(opts && opts.headers || {})
    };
    return fetch(url, { ...opts, headers });
}

/* ── SUBJECTS & CHAPTERS (AtlasPro Style) ── */
async function loadSubjects() {
    const sel = document.getElementById('selSubject');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- বিষয় বেছে নিন --</option>';
    try {
        const res = await api('/book_subjects?select=id,name,icon&order=sort_order.asc,created_at.asc');
        const data = await res.json();
        (data || []).forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = (s.icon || '') + ' ' + s.name;
            sel.appendChild(o);
        });
    } catch { mbToast('বিষয় লোড ব্যর্থ', 'error'); }
}

async function onSubjectChange() {
    const sid = document.getElementById('selSubject').value;
    const chSel = document.getElementById('selChapter');
    chSel.innerHTML = '<option value="">-- অধ্যায় বেছে নিন --</option>';
    chSel.disabled = true;
    document.getElementById('newChapterBtn').style.display = 'none';
    hideUploadAndList();
    updateSelectedContext();
    if (!sid) return;
    try {
        const res = await api(`/book_chapters?subject_id=eq.${sid}&select=id,name&order=sort_order.asc,created_at.asc`);
        const data = await res.json();
        (data || []).forEach(ch => {
            const o = document.createElement('option');
            o.value = ch.id; o.textContent = ch.name;
            chSel.appendChild(o);
        });
        chSel.disabled = false;
        document.getElementById('newChapterBtn').style.display = 'inline-block';
    } catch { mbToast('অধ্যায় লোড ব্যর্থ', 'error'); }
}

async function onChapterChange() {
    const cid = document.getElementById('selChapter').value;
    updateSelectedContext();
    if (!cid) { hideUploadAndList(); return; }
    showUploadAndList();
    loadPdfs();
}

function hideUploadAndList() {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('pdfListSection').style.display = 'none';
}
function showUploadAndList() {
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('pdfListSection').style.display = 'block';
}

function updateSelectedContext() {
    const ctx = document.getElementById('selectedContext');
    const selSub = document.getElementById('selSubject');
    const subName = selSub.selectedIndex > 0 ? selSub.options[selSub.selectedIndex].textContent.trim() : '';
    const selCh = document.getElementById('selChapter');
    const chName = selCh.selectedIndex > 0 ? selCh.options[selCh.selectedIndex].textContent.trim() : '';
    if (subName && chName) {
        ctx.innerHTML = '📚 ' + esc(subName) + ' &gt; 📖 ' + esc(chName);
        ctx.style.display = 'block';
    } else {
        ctx.style.display = 'none';
    }
}

/* ── CREATE SUBJECT/CHAPTER ── */
function toggleNewSubject() {
    const box = document.getElementById('newSubjectBox');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') document.getElementById('newSubjectName').focus();
}
async function createSubject() {
    const name = document.getElementById('newSubjectName').value.trim();
    const icon = document.getElementById('newSubjectIcon').value.trim() || '📚';
    if (!name) return mbToast('বিষয়ের নাম লিখুন', 'error');
    try {
        const res = await api('/book_subjects', { 
            method: 'POST', 
            body: JSON.stringify({ name, icon, description: '' }),
            headers: { 'Prefer': 'return=representation' }
        });
        const data = await res.json();
        mbToast('বিষয় যোগ হয়েছে ✓', 'success');
        toggleNewSubject();
        document.getElementById('newSubjectName').value = '';
        await loadSubjects();
        document.getElementById('selSubject').value = data[0].id;
        onSubjectChange();
    } catch(e) { mbToast('সমস্যা: ' + e.message, 'error'); }
}

function toggleNewChapter() {
    const box = document.getElementById('newChapterBox');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') document.getElementById('newChapterName').focus();
}
async function createChapter() {
    const sid = document.getElementById('selSubject').value;
    const name = document.getElementById('newChapterName').value.trim();
    if (!name) return mbToast('অধ্যায়ের নাম লিখুন', 'error');
    try {
        const res = await api('/book_chapters', { 
            method: 'POST', 
            body: JSON.stringify({ subject_id: parseInt(sid), name }),
            headers: { 'Prefer': 'return=representation' }
        });
        const data = await res.json();
        mbToast('অধ্যায় যোগ হয়েছে ✓', 'success');
        toggleNewChapter();
        document.getElementById('newChapterName').value = '';
        await onSubjectChange();
        document.getElementById('selChapter').value = data[0].id;
        onChapterChange();
    } catch (e) { mbToast('ত্রুটি: ' + e.message, 'error'); }
}

/* ── PDF UPLOAD ── */
let selectedPdfFile = null;
function dzOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('dragover'); }
function dzLeave() { document.getElementById('dropZone').classList.remove('dragover'); }
function dzDrop(e) {
    e.preventDefault(); dzLeave();
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') setFile(f);
    else mbToast('শুধু PDF ফাইল গ্রহণযোগ্য', 'error');
}
function onFileSelect(e) { if (e.target.files[0]) setFile(e.target.files[0]); }
function setFile(f) {
    selectedPdfFile = f;
    const fc = document.getElementById('fileChosen');
    fc.textContent = '✓ ' + f.name; fc.style.display = 'block';
    const titleEl = document.getElementById('pdfTitle');
    if (!titleEl.value) titleEl.value = f.name.replace(/\.pdf$/i, '');
}

async function uploadPdf() {
    const cid = document.getElementById('selChapter').value;
    const title = document.getElementById('pdfTitle').value.trim();
    if (!cid || !selectedPdfFile || !title) return mbToast('সব তথ্য দিন', 'error');

    const btn = document.getElementById('uploadBtn');
    const pw = document.getElementById('progressWrap');
    const pf = document.getElementById('progressFill');
    const us = document.getElementById('uploadSuccess');

    btn.disabled = true; btn.textContent = 'আপলোড হচ্ছে...';
    pw.style.display = 'block'; pf.style.width = '0%';

    try {
        const safeName = Date.now() + '_' + selectedPdfFile.name.replace(/[^a-z0-9.]/gi, '_');
        const path = `chapter_${cid}/${safeName}`;
        
        // Upload to Supabase Storage
        const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/pdfs/${path}`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/pdf' },
            body: selectedPdfFile
        });
        if (!upRes.ok) throw new Error('Storage upload failed');
        
        const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/pdfs/${path}`;
        
        // Save to Database
        await api('/book_pdfs', {
            method: 'POST',
            body: JSON.stringify({ chapter_id: parseInt(cid), title, file_url: fileUrl })
        });

        pf.style.width = '100%';
        us.style.display = 'block';
        selectedPdfFile = null;
        document.getElementById('fileChosen').style.display = 'none';
        document.getElementById('pdfTitle').value = '';
        setTimeout(() => { us.style.display = 'none'; pw.style.display = 'none'; }, 2000);
        mbToast('PDF আপলোড সম্পন্ন ✓', 'success');
        loadPdfs();
        mbLoadAllPdfs();
    } catch (e) {
        mbToast('আপলোড ব্যর্থ: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '💾 সংরক্ষণ করো';
    }
}

/* ── PDF LIST ── */
async function loadPdfs() {
    const cid = document.getElementById('selChapter').value;
    const listEl = document.getElementById('pdfList');
    listEl.innerHTML = '<div class="skeleton skel-row"></div>';
    try {
        const res = await api(`/book_pdfs?chapter_id=eq.${cid}&select=*&order=created_at.desc`);
        const pdfs = await res.json();
        renderPdfList(pdfs, 'pdfList');
    } catch { mbToast('লোড ব্যর্থ', 'error'); }
}

async function mbLoadAllPdfs() {
    const listEl = document.getElementById('mbAllPdfsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="skeleton skel-row"></div>';
    try {
        const res = await api('/book_pdfs?select=*,book_chapters(name,book_subjects(name,icon))&order=created_at.desc&limit=20');
        const pdfs = await res.json();
        renderPdfList(pdfs, 'mbAllPdfsList', true);
    } catch { listEl.innerHTML = 'লোড ব্যর্থ'; }
}

function renderPdfList(pdfs, targetId, showContext = false) {
    const listEl = document.getElementById(targetId);
    if (!pdfs.length) {
        listEl.innerHTML = '<div class="empty-state">কোনো PDF নেই</div>';
        return;
    }
    listEl.innerHTML = pdfs.map(p => {
        let ctxLine = '';
        if (showContext && p.book_chapters) {
            const sub = p.book_chapters.book_subjects;
            ctxLine = `<div style="font-size:10px;color:var(--text3);margin-top:2px">${sub.icon || ''} ${sub.name} > ${p.book_chapters.name}</div>`;
        }
        return `
        <div class="pdf-card">
            <div class="pdf-card-top">
                <div class="pdf-card-icon">📕</div>
                <div class="pdf-card-info">
                    <div class="pdf-card-title">${esc(p.title)}</div>
                    ${ctxLine}
                </div>
                <div class="pdf-card-actions">
                    <button class="act-btn act-edit" title="MCQ সম্পাদনা" onclick="openMbMcqPanel(${p.id}, '${esc(p.title)}', '${p.file_url}')">📝</button>
                    <button class="act-btn act-delete" title="মুছুন" onclick="deletePdf(${p.id})">🗑️</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function deletePdf(id) {
    if (!confirm('এই PDF টি মুছে ফেলবেন?')) return;
    try {
        await api(`/book_pdfs?id=eq.${id}`, { method: 'DELETE' });
        mbToast('PDF মুছে গেছে', 'success');
        loadPdfs();
        mbLoadAllPdfs();
    } catch { mbToast('মুছতে ব্যর্থ', 'error'); }
}

/* ── MCQ PANEL (AtlasPro 100% Match) ── */
function mbInjectStyles() {
    if (document.getElementById('mbMcqStyles')) return;
    const style = document.createElement('style');
    style.id = 'mbMcqStyles';
    style.textContent = `
        .mcq-panel {
            position: fixed; inset: 0; background: var(--bg);
            z-index: 1000; transform: translateX(100%);
            transition: transform 0.32s cubic-bezier(.4,0,.2,1);
            display: flex; flex-direction: column; overflow: hidden;
        }
        .mcq-panel.active { transform: translateX(0); }
        .mcq-panel-header {
            height: 56px; background: var(--bg2);
            border-bottom: 1px solid var(--border);
            display: flex; align-items: center; gap: 10px;
            padding: 0 14px; flex-shrink: 0;
        }
        .mcq-panel-title { flex: 1; font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mcq-panel-body { flex: 1; overflow-y: auto; padding: 14px; }
        .mcq-panel-context {
            padding: 6px 14px; font-size: 11px; font-weight: 600;
            color: var(--text3); background: rgba(108,99,255,0.05);
            border-bottom: 1px solid var(--border);
        }
        .back-btn {
            display: flex; align-items: center; gap: 6px;
            padding: 7px 12px; border-radius: var(--radius-sm);
            background: var(--card); border: 1px solid var(--border);
            font-size: 13px; font-weight: 600; color: var(--text2);
            cursor: pointer; transition: all 0.2s;
        }
        .page-preview {
            background: #111120; border: 1px solid var(--border);
            border-radius: var(--radius); margin-bottom: 14px;
            overflow: hidden; position: relative;
            display: flex; align-items: center; justify-content: center;
        }
        .page-preview canvas { max-width: 100%; display: block; }
        .page-preview-loading {
            position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
            font-size: 12px; color: var(--text3); background: rgba(17,17,32,0.85);
        }
        .page-preview-loading.show { display: flex; }
        .page-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .page-pill {
            padding: 4px 10px; border-radius: 20px; font-size: 11px;
            font-weight: 700; cursor: pointer; transition: all 0.2s;
            border: 1px solid var(--border); background: var(--card); color: var(--text3);
        }
        .page-pill.active { background: rgba(108,99,255,0.15); border-color: var(--primary); color: #9C8BFF; }
        .page-pill .pill-count { display: inline-block; min-width: 14px; text-align: center; padding: 0 4px; border-radius: 10px; margin-left: 4px; background: rgba(108,99,255,0.2); font-size: 10px; }
        .page-pill.has-mcqs { color: var(--text2); }
        .page-nav { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 14px; }
        .page-nav-input { width: 64px; background: var(--bg2); border: 1.5px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 15px; font-weight: 700; padding: 8px 10px; outline: none; text-align: center; }
        .page-nav-btn { width: 36px; height: 36px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--card); color: var(--text2); font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .page-nav-count { margin-left: auto; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: rgba(108,99,255,0.12); color: #9C8BFF; border: 1px solid rgba(108,99,255,0.25); }
        
        .tab-bar { display: flex; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 14px; }
        .tab-btn { flex: 1; padding: 11px 6px; text-align: center; font-size: 12px; font-weight: 700; cursor: pointer; background: transparent; color: var(--text3); border: none; border-right: 1px solid var(--border); transition: all 0.2s; }
        .tab-btn.active { background: var(--primary); color: white; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        
        .type-selector { display: flex; gap: 8px; margin-bottom: 14px; }
        .type-opt { flex: 1; padding: 8px 6px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--bg2); text-align: center; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; color: var(--text3); }
        .type-opt.selected { background: rgba(108,99,255,0.12); border-color: var(--primary); color: #9C8BFF; }
        
        .mcq-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 10px; }
        .mcq-card-header { padding: 12px 14px; display: flex; align-items: flex-start; gap: 10px; }
        .mcq-num { width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; background: rgba(108,99,255,0.12); border: 1px solid rgba(108,99,255,0.3); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #9C8BFF; }
        .mcq-question { flex: 1; font-size: 13px; font-weight: 600; line-height: 1.5; }
        .mcq-options { padding: 0 14px 12px 46px; display: flex; flex-direction: column; gap: 6px; }
        .mcq-opt { font-size: 12px; color: var(--text2); display: flex; gap: 8px; }
        .mcq-opt.correct { color: var(--green); font-weight: 700; }
        .opt-key { color: var(--text3); font-weight: 700; }
    `;
    document.head.appendChild(style);
}

function mbBuildMcqPanelDom() {
    mbInjectStyles();
    if (document.getElementById('mbMcqOverlay')) return;
    const div = document.createElement('div');
    div.id = 'mbMcqOverlay';
    div.className = 'mcq-panel';
    div.innerHTML = `
        <div class="mcq-panel-header">
            <button class="back-btn" onclick="closeMbMcqPanel()">← ফিরে যাও</button>
            <div class="mcq-panel-title" id="mbMcqTitle">MCQ ব্যবস্থাপনা</div>
        </div>
        <div class="mcq-panel-context" id="mbMcqContext"></div>
        <div class="mcq-panel-body">
            <div class="page-preview" id="mbMcqPreviewWrap">
                <canvas id="mbMcqCanvas"></canvas>
                <div class="page-preview-loading" id="mbMcqLoading">PDF পেইজ লোড হচ্ছে...</div>
            </div>
            <div class="page-summary" id="mbMcqSummary"></div>
            <div class="page-nav">
                <span class="page-nav-label">পেইজ নং:</span>
                <button class="page-nav-btn" onclick="mbPageStep(-1)">‹</button>
                <input type="number" class="page-nav-input" id="mbMcqPageInput" value="1" min="1" onchange="mbOnPageChange()">
                <button class="page-nav-btn" onclick="mbPageStep(1)">›</button>
                <span class="page-nav-count" id="mbMcqPageCount">০ টি MCQ</span>
            </div>

            <div class="type-selector">
                <div class="type-opt selected" data-type="standard" onclick="mbSelectType('standard')">📚 Standard</div>
                <div class="type-opt" data-type="true_false" onclick="mbSelectType('true_false')">✅ True-False</div>
                <div class="type-opt" data-type="hard" onclick="mbSelectType('hard')">🔥 Hard</div>
            </div>

            <div class="tab-bar">
                <button class="tab-btn active" onclick="mbSwitchTab('manual')">📝 ম্যানুয়াল</button>
                <button class="tab-btn" onclick="mbSwitchTab('csv')">📊 CSV</button>
                <button class="tab-btn" onclick="mbSwitchTab('ai')">🤖 AI</button>
            </div>

            <div id="mbTab_manual" class="tab-panel active">
                <div class="section-card" style="background:var(--bg2);padding:14px;border-radius:8px;margin-bottom:14px;">
                    <div class="form-group">
                        <label class="form-label">প্রশ্ন</label>
                        <textarea class="form-textarea" id="mbQ" rows="2"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">বিকল্পসমূহ (ক, খ, গ, ঘ)</label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <input class="form-input" id="mbOpt_a" placeholder="ক">
                            <input class="form-input" id="mbOpt_b" placeholder="খ">
                            <input class="form-input" id="mbOpt_c" placeholder="গ">
                            <input class="form-input" id="mbOpt_d" placeholder="ঘ">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">সঠিক উত্তর</label>
                        <select class="form-select" id="mbAns">
                            <option value="A">ক</option><option value="B">খ</option><option value="C">গ</option><option value="D">ঘ</option>
                        </select>
                    </div>
                    <button class="btn btn-primary btn-full" onclick="mbSaveMcq()">✓ সংরক্ষণ করো</button>
                </div>
                <div id="mbMcqList"></div>
            </div>

            <div id="mbTab_csv" class="tab-panel">
                <div class="section-card" style="background:var(--bg2);padding:14px;border-radius:8px;text-align:center;">
                    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">CSV ফরম্যাট: question,a,b,c,d,answer,explanation</div>
                    <input type="file" id="mbCsvFile" accept=".csv" style="font-size:12px;">
                    <button class="btn btn-primary btn-full" style="margin-top:10px;" onclick="mbImportCsv()">📥 আমদানি করো</button>
                </div>
            </div>

            <div id="mbTab_ai" class="tab-panel">
                <div class="section-card" style="background:var(--bg2);padding:14px;border-radius:8px;text-align:center;">
                    <div style="font-size:13px;font-weight:700;margin-bottom:10px;">🤖 AI প্রশ্ন জেনারেটর</div>
                    <button class="btn btn-primary btn-full" onclick="mbGenerateAi()">✨ প্রশ্ন তৈরি করো</button>
                    <div id="mbAiLoading" style="display:none;margin-top:10px;font-size:12px;">AI চিন্তা করছে...</div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

/* ── MCQ LOGIC ── */
async function openMbMcqPanel(pdfId, title, url) {
    activePdfId = pdfId;
    activePdfTitle = title;
    cachedPdfUrl = url;
    currentPage = 1;
    cachedPdfDoc = null;

    mbBuildMcqPanelDom();
    document.getElementById('mbMcqTitle').textContent = title + ' — MCQ সম্পাদনা';
    document.getElementById('mbMcqOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    mbLoadPagePreview();
    mbLoadMcqs();
    mbLoadPageSummary();
}

function closeMbMcqPanel() {
    document.getElementById('mbMcqOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function mbLoadPagePreview() {
    if (!cachedPdfUrl) return;
    const loading = document.getElementById('mbMcqLoading');
    const canvas = document.getElementById('mbMcqCanvas');
    loading.classList.add('show');
    try {
        if (!cachedPdfDoc) {
            cachedPdfDoc = await pdfjsLib.getDocument(cachedPdfUrl).promise;
        }
        const page = await cachedPdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch (e) { console.error(e); }
    loading.classList.remove('show');
}

async function mbLoadMcqs() {
    const listEl = document.getElementById('mbMcqList');
    listEl.innerHTML = '<div class="skeleton skel-sm"></div>';
    try {
        const res = await api(`/book_page_mcqs?pdf_id=eq.${activePdfId}&page_number=eq.${currentPage}&mcq_type=eq.${selTypeKey}&select=questions_json`);
        const data = await res.json();
        allMcqs = data.length ? JSON.parse(data[0].questions_json) : [];
        document.getElementById('mbMcqPageCount').textContent = allMcqs.length + ' টি MCQ';
        renderMcqs();
    } catch { listEl.innerHTML = 'লোড ব্যর্থ'; }
}

function renderMcqs() {
    const listEl = document.getElementById('mbMcqList');
    if (!allMcqs.length) {
        listEl.innerHTML = '<div class="empty-state">এই পেইজে কোনো প্রশ্ন নেই</div>';
        return;
    }
    const labels = { A:'ক', B:'খ', C:'গ', D:'ঘ' };
    listEl.innerHTML = allMcqs.map((q, i) => `
        <div class="mcq-card">
            <div class="mcq-card-header">
                <div class="mcq-num">${i+1}</div>
                <div class="mcq-question">${esc(q.question)}</div>
                <div class="mcq-actions">
                    <button class="act-btn" onclick="mbDeleteMcq(${i})">🗑️</button>
                </div>
            </div>
            <div class="mcq-options">
                <div class="mcq-opt ${q.answer_index===0?'correct':''}"><span class="opt-key">ক)</span> ${esc(q.options[0])}</div>
                <div class="mcq-opt ${q.answer_index===1?'correct':''}"><span class="opt-key">খ)</span> ${esc(q.options[1])}</div>
                <div class="mcq-opt ${q.answer_index===2?'correct':''}"><span class="opt-key">গ)</span> ${esc(q.options[2])}</div>
                <div class="mcq-opt ${q.answer_index===3?'correct':''}"><span class="opt-key">ঘ)</span> ${esc(q.options[3])}</div>
            </div>
        </div>
    `).join('');
}

async function mbLoadPageSummary() {
    const summaryEl = document.getElementById('mbMcqSummary');
    try {
        const res = await api(`/book_page_mcqs?pdf_id=eq.${activePdfId}&select=page_number,questions_json`);
        const data = await res.json();
        const counts = {};
        data.forEach(row => {
            const qList = JSON.parse(row.questions_json);
            counts[row.page_number] = (counts[row.page_number] || 0) + qList.length;
        });
        const totalPages = cachedPdfDoc ? cachedPdfDoc.numPages : Math.max(...Object.keys(counts).map(Number), 10);
        let html = '';
        for (let i = 1; i <= Math.min(totalPages, 50); i++) {
            const count = counts[i] || 0;
            const active = i === currentPage ? ' active' : '';
            const hasMcqs = count > 0 ? ' has-mcqs' : '';
            html += `<span class="page-pill${active}${hasMcqs}" onclick="mbGoToPage(${i})">P${i}<span class="pill-count">${count}</span></span>`;
        }
        summaryEl.innerHTML = html;
    } catch { summaryEl.innerHTML = ''; }
}

function mbGoToPage(p) {
    currentPage = p;
    document.getElementById('mbMcqPageInput').value = p;
    mbLoadPagePreview();
    mbLoadMcqs();
    mbLoadPageSummary();
}

function mbPageStep(d) {
    const next = Math.max(1, currentPage + d);
    mbGoToPage(next);
}

function mbOnPageChange() {
    const v = parseInt(document.getElementById('mbMcqPageInput').value);
    if (v > 0) mbGoToPage(v);
}

function mbSelectType(type) {
    selTypeKey = type;
    document.querySelectorAll('.type-opt').forEach(el => el.classList.toggle('selected', el.dataset.type === type));
    mbLoadMcqs();
}

function mbSwitchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', ['manual','csv','ai'][i] === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('mbTab_' + tab).classList.add('active');
}

async function mbSaveMcq() {
    const q = document.getElementById('mbQ').value.trim();
    const opts = [
        document.getElementById('mbOpt_a').value.trim(),
        document.getElementById('mbOpt_b').value.trim(),
        document.getElementById('mbOpt_c').value.trim(),
        document.getElementById('mbOpt_d').value.trim()
    ];
    const ans = document.getElementById('mbAns').value;
    const ansIdx = ['A','B','C','D'].indexOf(ans);
    if (!q || opts.some(o => !o)) return mbToast('সব তথ্য দিন');

    const newMcq = { question: q, options: opts, answer_index: ansIdx };
    allMcqs.push(newMcq);
    await mbUpdateDb();
    document.getElementById('mbQ').value = '';
    opts.forEach((_, i) => document.getElementById('mbOpt_' + ['a','b','c','d'][i]).value = '');
    renderMcqs();
    mbLoadPageSummary();
}

async function mbDeleteMcq(idx) {
    if (!confirm('মুছে ফেলবেন?')) return;
    allMcqs.splice(idx, 1);
    await mbUpdateDb();
    renderMcqs();
    mbLoadPageSummary();
}

async function mbUpdateDb() {
    try {
        await api('/book_page_mcqs', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({
                pdf_id: activePdfId,
                page_number: currentPage,
                mcq_type: selTypeKey,
                questions_json: JSON.stringify(allMcqs)
            })
        });
        mbToast('সংরক্ষিত ✓', 'success');
    } catch { mbToast('সংরক্ষণ ব্যর্থ', 'error'); }
}

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('secMulboi')) {
        loadSubjects();
        mbLoadAllPdfs();
    }
});
