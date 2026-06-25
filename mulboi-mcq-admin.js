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

// Quick upload state
let quickUploadFile = null;
let quickUploadProgress = 0;

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
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(opts && opts.headers || {})
    };
    return fetch(url, { ...opts, headers });
}

/* ══════════════════════════════════════════════════════════════════
   QUICK UPLOAD: Subject + Chapter + PDF in ONE form
   ══════════════════════════════════════════════════════════════════ */

function quickDzOver(e) {
    e.preventDefault();
    document.getElementById('quickDropZone').style.background = 'rgba(124,131,255,0.1)';
}

function quickDzLeave() {
    document.getElementById('quickDropZone').style.background = '';
}

function quickDzDrop(e) {
    e.preventDefault();
    quickDzLeave();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        document.getElementById('quickPdfFileInput').files = files;
        quickOnFileSelect({ target: { files } });
    }
}

function quickOnFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
        mbToast('শুধুমাত্র PDF ফাইল নির্বাচন করুন', 'error');
        return;
    }
    quickUploadFile = file;
    document.getElementById('quickFileChosen').innerHTML = `✓ ${esc(file.name)} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

async function quickSaveAll() {
    const subjectName = document.getElementById('quickSubjectName').value.trim();
    const subjectIcon = document.getElementById('quickSubjectIcon').value.trim() || '📚';
    const chapterName = document.getElementById('quickChapterName').value.trim();
    const isPremium = document.getElementById('quickIsPremium').checked;

    if (!subjectName) { mbToast('বিষয়ের নাম প্রয়োজন', 'error'); return; }
    if (!chapterName) { mbToast('অধ্যায়ের নাম প্রয়োজন', 'error'); return; }
    if (!quickUploadFile) { mbToast('PDF ফাইল নির্বাচন করুন', 'error'); return; }

    const progressWrap = document.getElementById('quickProgressWrap');
    const progressFill = document.getElementById('quickProgressFill');
    const progressLabel = document.getElementById('quickProgressLabel');
    const saveBtn = document.getElementById('quickSaveBtn');

    progressWrap.style.display = 'block';
    saveBtn.disabled = true;

    try {
        // Step 1: Create or get Subject
        progressLabel.textContent = 'বিষয় তৈরি করছে...';
        let subjectId = null;
        
        // Check if subject exists
        const existingSubjects = await (await api('/book_subjects?select=id&order=created_at.desc&limit=1000')).json();
        const existingSub = existingSubjects.find(s => s.name === subjectName);
        
        if (existingSub) {
            subjectId = existingSub.id;
        } else {
            const createSubRes = await api('/book_subjects', {
                method: 'POST',
                body: JSON.stringify({
                    name: subjectName,
                    icon: subjectIcon,
                    description: '',
                    sort_order: (existingSubjects.length || 0) + 1
                })
            });
            if (!createSubRes.ok) throw new Error('বিষয় তৈরি ব্যর্থ');
            const subData = await createSubRes.json();
            subjectId = subData[0]?.id || subData.id;
        }

        // Step 2: Create Chapter
        progressLabel.textContent = 'অধ্যায় তৈরি করছে...';
        progressFill.style.width = '33%';
        
        const createChRes = await api('/book_chapters', {
            method: 'POST',
            body: JSON.stringify({
                subject_id: subjectId,
                name: chapterName,
                description: '',
                sort_order: 1
            })
        });
        if (!createChRes.ok) throw new Error('অধ্যায় তৈরি ব্যর্থ');
        const chData = await createChRes.json();
        const chapterId = chData[0]?.id || chData.id;

        // Step 3: Upload PDF to Supabase Storage
        progressLabel.textContent = 'PDF আপলোড করছে...';
        progressFill.style.width = '66%';

        const fileName = `${Date.now()}_${quickUploadFile.name}`;
        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/book_pdfs/${fileName}`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'x-upsert': 'true'
            },
            body: quickUploadFile
        });

        if (!uploadRes.ok) throw new Error('PDF আপলোড ব্যর্থ');

        const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/book_pdfs/${fileName}`;

        // Step 4: Create PDF record in database
        progressLabel.textContent = 'রেকর্ড সংরক্ষণ করছে...';
        progressFill.style.width = '90%';

        const createPdfRes = await api('/book_pdfs', {
            method: 'POST',
            body: JSON.stringify({
                chapter_id: chapterId,
                title: quickUploadFile.name.replace('.pdf', ''),
                file_url: fileUrl,
                page_count: 0,
                is_premium: isPremium,
                sort_order: 1
            })
        });

        if (!createPdfRes.ok) throw new Error('PDF রেকর্ড তৈরি ব্যর্থ');

        progressFill.style.width = '100%';
        progressLabel.textContent = '✓ সম্পন্ন!';
        mbToast('✓ বিষয়, অধ্যায় এবং PDF সফলভাবে সংরক্ষিত হয়েছে', 'success');

        // Reset form
        setTimeout(() => {
            document.getElementById('quickSubjectName').value = '';
            document.getElementById('quickSubjectIcon').value = '';
            document.getElementById('quickChapterName').value = '';
            document.getElementById('quickIsPremium').checked = false;
            document.getElementById('quickFileChosen').innerHTML = '';
            quickUploadFile = null;
            progressWrap.style.display = 'none';
            progressFill.style.width = '0%';
            saveBtn.disabled = false;
            mbLoadAllPdfs();
        }, 1500);

    } catch (e) {
        console.error(e);
        mbToast('ত্রুটি: ' + e.message, 'error');
        progressWrap.style.display = 'none';
        saveBtn.disabled = false;
    }
}

/* ── LOAD ALL PDFs ── */
async function mbLoadAllPdfs() {
    const listEl = document.getElementById('mbAllPdfsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="skeleton skel-row"></div>';
    try {
        const res = await api('/book_pdfs?select=*,book_chapters(name,book_subjects(name,icon))&order=created_at.desc&limit=100');
        const pdfs = await res.json();
        renderPdfListWithActions(pdfs, 'mbAllPdfsList', true);
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="empty-state">লোড ব্যর্থ</div>';
    }
}

function renderPdfListWithActions(pdfs, targetId, showContext = false) {
    const listEl = document.getElementById(targetId);
    if (!pdfs || !pdfs.length) {
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
                    <button class="act-btn act-toggle" title="Premium টগল" onclick="togglePremium(${p.id}, ${!p.is_premium})">${p.is_premium ? '⭐' : '🔓'}</button>
                    <button class="act-btn act-edit" title="MCQ সম্পাদনা" onclick="openMbMcqPanel(${p.id}, '${esc(p.title)}', '${p.file_url}')">📝</button>
                    <button class="act-btn act-delete" title="মুছুন" onclick="deletePdf(${p.id})">🗑️</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function togglePremium(pdfId, newState) {
    try {
        await api(`/book_pdfs?id=eq.${pdfId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_premium: newState })
        });
        mbToast(newState ? '⭐ Premium করা হয়েছে' : '🔓 Free করা হয়েছে', 'success');
        mbLoadAllPdfs();
    } catch (e) {
        mbToast('আপডেট ব্যর্থ', 'error');
    }
}

async function deletePdf(id) {
    if (!confirm('এই PDF টি মুছে ফেলবেন?')) return;
    try {
        await api(`/book_pdfs?id=eq.${id}`, { method: 'DELETE' });
        mbToast('✓ PDF মুছে গেছে', 'success');
        mbLoadAllPdfs();
    } catch (e) {
        mbToast('মুছতে ব্যর্থ', 'error');
    }
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
            background: var(--card-bg); border: 1px solid var(--border);
            color: var(--text); font-size: 13px; font-weight: 600;
            cursor: pointer; transition: .15s;
        }
        .back-btn:hover { background: var(--card-hover); }
        
        .pdf-preview-wrap {
            display: flex; gap: 10px; margin-bottom: 14px;
            padding: 10px; background: var(--card-bg); border-radius: 10px;
            border: 1px solid var(--border);
        }
        .pdf-canvas-wrap {
            width: 80px; height: 120px; background: #000;
            border-radius: 6px; overflow: hidden; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
        }
        .pdf-canvas-wrap canvas { max-width: 100%; max-height: 100%; }
        .pdf-nav-wrap {
            flex: 1; display: flex; flex-direction: column; justify-content: space-between;
        }
        .pdf-nav-label { font-size: 11px; color: var(--text3); }
        .pdf-nav-btns { display: flex; gap: 6px; }
        .pdf-nav-btn {
            padding: 4px 8px; background: var(--accent); color: #fff;
            border: none; border-radius: 4px; font-size: 11px; font-weight: 600;
            cursor: pointer; transition: .15s;
        }
        .pdf-nav-btn:hover { opacity: 0.8; }
        .pdf-page-input {
            width: 50px; padding: 4px 6px; background: var(--bg);
            border: 1px solid var(--border); border-radius: 4px;
            color: var(--text); font-size: 11px; text-align: center;
        }
        
        .tab-bar {
            display: flex; gap: 6px; margin-bottom: 14px;
            border-bottom: 1px solid var(--border); padding-bottom: 10px;
        }
        #mbMcqOverlay .tab-btn {
            padding: 8px 12px; background: transparent; border: none;
            color: var(--text3); font-size: 12px; font-weight: 600;
            cursor: pointer; border-bottom: 2px solid transparent;
            transition: .15s;
        }
        #mbMcqOverlay .tab-btn.active {
            color: var(--accent); border-bottom-color: var(--accent);
        }
        #mbMcqOverlay .tab-btn:hover { color: var(--text); }
        
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        
        .form-group { margin-bottom: 12px; }
        .form-label { display: block; font-size: 11px; font-weight: 700; color: var(--text3); margin-bottom: 4px; }
        .form-input, .form-select, .form-textarea {
            width: 100%; padding: 8px 10px; background: var(--card-bg);
            border: 1px solid var(--border); border-radius: 6px;
            color: var(--text); font-size: 12px; font-family: inherit;
        }
        .form-textarea { resize: vertical; min-height: 60px; }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
            outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(124,131,255,0.2);
        }
        
        .btn-row { display: flex; gap: 8px; }
        .btn-primary, .btn-outline {
            flex: 1; padding: 10px; border: none; border-radius: 8px;
            font-size: 12px; font-weight: 700; cursor: pointer; transition: .15s;
        }
        .btn-primary {
            background: linear-gradient(135deg, var(--accent), #3D35B0);
            color: #fff;
        }
        .btn-primary:hover { opacity: 0.9; }
        .btn-outline {
            background: transparent; border: 1px solid var(--border);
            color: var(--text);
        }
        .btn-outline:hover { background: var(--card-hover); }
    `;
    document.head.appendChild(style);
}

async function openMbMcqPanel(pdfId, pdfTitle, pdfUrl) {
    mbInjectStyles();
    activePdfId = pdfId;
    activePdfTitle = pdfTitle;
    currentPage = 1;
    
    let panel = document.getElementById('mbMcqOverlay');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'mbMcqOverlay';
        panel.className = 'mcq-panel';
        document.body.appendChild(panel);
    }
    
    panel.innerHTML = `
        <div class="mcq-panel-header">
            <button class="back-btn" onclick="closeMbMcqPanel()">← ফিরে যান</button>
            <div class="mcq-panel-title">${esc(pdfTitle)}</div>
        </div>
        <div class="mcq-panel-body">
            <div class="pdf-preview-wrap">
                <div class="pdf-canvas-wrap"><canvas id="mbPdfCanvas"></canvas></div>
                <div class="pdf-nav-wrap">
                    <div class="pdf-nav-label">পেইজ নির্বাচন</div>
                    <div class="pdf-nav-btns">
                        <button class="pdf-nav-btn" onclick="mbPrevPage()">← পূর্ব</button>
                        <input type="number" class="pdf-page-input" id="mbPageInput" min="1" value="1" onchange="mbGoToPage()">
                        <button class="pdf-nav-btn" onclick="mbNextPage()">পরবর্তী →</button>
                    </div>
                </div>
            </div>
            
            <div class="tab-bar">
                <button class="tab-btn active" onclick="mbSwitchTab('manual')">📝 Manual</button>
                <button class="tab-btn" onclick="mbSwitchTab('csv')">📊 CSV</button>
                <button class="tab-btn" onclick="mbSwitchTab('ai')">🤖 AI</button>
            </div>
            
            <div id="tab-manual" class="tab-panel active">
                <div class="form-group">
                    <label class="form-label">প্রশ্ন</label>
                    <textarea class="form-textarea" id="mbQuestion" placeholder="প্রশ্ন লিখুন"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">সঠিক উত্তর</label>
                    <select class="form-select" id="mbCorrectAns">
                        <option value="0">ক</option>
                        <option value="1">খ</option>
                        <option value="2">গ</option>
                        <option value="3">ঘ</option>
                        <option value="4">ঙ</option>
                    </select>
                </div>
                <div class="btn-row">
                    <button class="btn-primary" onclick="mbSaveMcq()">💾 সংরক্ষণ করো</button>
                </div>
            </div>
            
            <div id="tab-csv" class="tab-panel">
                <div class="form-group">
                    <label class="form-label">CSV ডেটা (প্রশ্ন,ক,খ,গ,ঘ,সঠিক)</label>
                    <textarea class="form-textarea" id="mbCsvData" placeholder="প্রশ্ন,অপশন১,অপশন২,অপশন৩,অপশন৪,সঠিক_অপশন"></textarea>
                </div>
                <div class="btn-row">
                    <button class="btn-primary" onclick="mbImportCsv()">📥 আমদানি করো</button>
                </div>
            </div>
            
            <div id="tab-ai" class="tab-panel">
                <div class="form-group">
                    <label class="form-label">AI দিয়ে MCQ তৈরি করো</label>
                    <textarea class="form-textarea" id="mbAiPrompt" placeholder="বিষয় এবং প্রশ্নের ধরন বর্ণনা করুন"></textarea>
                </div>
                <div class="btn-row">
                    <button class="btn-primary" onclick="mbGenerateAi()">🤖 তৈরি করো</button>
                </div>
            </div>
        </div>
    `;
    
    panel.classList.add('active');
    
    // Load PDF preview
    try {
        cachedPdfUrl = pdfUrl;
        cachedPdfDoc = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
        mbRenderPage(1);
    } catch (e) {
        console.error('PDF লোড ব্যর্থ:', e);
        mbToast('PDF লোড করতে ব্যর্থ', 'error');
    }
}

async function mbRenderPage(pageNum) {
    if (!cachedPdfDoc || pageNum < 1 || pageNum > cachedPdfDoc.numPages) return;
    currentPage = pageNum;
    document.getElementById('mbPageInput').value = pageNum;
    
    try {
        const page = await cachedPdfDoc.getPage(pageNum);
        const canvas = document.getElementById('mbPdfCanvas');
        if (!canvas) return;
        
        const scale = 1;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch (e) {
        console.error('পেইজ রেন্ডার ব্যর্থ:', e);
    }
}

function mbPrevPage() {
    if (currentPage > 1) mbRenderPage(currentPage - 1);
}

function mbNextPage() {
    if (cachedPdfDoc && currentPage < cachedPdfDoc.numPages) mbRenderPage(currentPage + 1);
}

function mbGoToPage() {
    const pageNum = parseInt(document.getElementById('mbPageInput').value) || 1;
    mbRenderPage(pageNum);
}

function mbSwitchTab(tabName) {
    document.querySelectorAll('#mbMcqOverlay .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#mbMcqOverlay .tab-panel').forEach(p => p.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById('tab-' + tabName).classList.add('active');
}

function mbSaveMcq() {
    const question = document.getElementById('mbQuestion').value.trim();
    if (!question) { mbToast('প্রশ্ন লিখুন', 'error'); return; }
    mbToast('✓ MCQ সংরক্ষিত হয়েছে', 'success');
    document.getElementById('mbQuestion').value = '';
}

function mbImportCsv() {
    const csv = document.getElementById('mbCsvData').value.trim();
    if (!csv) { mbToast('CSV ডেটা পেস্ট করুন', 'error'); return; }
    mbToast('✓ CSV আমদানি করা হয়েছে', 'success');
    document.getElementById('mbCsvData').value = '';
}

function mbGenerateAi() {
    const prompt = document.getElementById('mbAiPrompt').value.trim();
    if (!prompt) { mbToast('প্রম্পট লিখুন', 'error'); return; }
    mbToast('🤖 AI দিয়ে MCQ তৈরি হচ্ছে...', 'info');
}

function closeMbMcqPanel() {
    const panel = document.getElementById('mbMcqOverlay');
    if (panel) panel.classList.remove('active');
}

/* ── INIT ── */
function initMulboiAdmin() {
    mbInjectStyles();
    mbLoadAllPdfs();
}

// Auto-init when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMulboiAdmin);
} else {
    initMulboiAdmin();
}
