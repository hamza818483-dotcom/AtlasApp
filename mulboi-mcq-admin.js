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
        
        const existingSubjects = await (await api('/book_subjects?select=id,name&order=created_at.desc&limit=1000')).json();
        const existingSub = existingSubjects.find(s => s.name === subjectName);
        
        if (existingSub) {
            subjectId = existingSub.id;
        } else {
            const createSubRes = await api('/book_subjects', {
                method: 'POST',
                headers: { 'Prefer': 'return=representation' },
                body: JSON.stringify({
                    name: subjectName,
                    icon: subjectIcon,
                    description: '',
                    sort_order: (existingSubjects.length || 0) + 1
                })
            });
            if (!createSubRes.ok) throw new Error('বিষয় তৈরি ব্যর্থ');
            const subData = await createSubRes.json();
            subjectId = subData[0]?.id;
        }

        // Step 2: Create Chapter
        progressLabel.textContent = 'অধ্যায় তৈরি করছে...';
        progressFill.style.width = '33%';
        
        const createChRes = await api('/book_chapters', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({
                subject_id: subjectId,
                name: chapterName,
                description: '',
                sort_order: 1
            })
        });
        if (!createChRes.ok) throw new Error('অধ্যায় তৈরি ব্যর্থ');
        const chData = await createChRes.json();
        const chapterId = chData[0]?.id;

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
        
        .page-preview {
            background: #111120; border: 1px solid var(--border);
            border-radius: var(--radius); margin-bottom: 14px;
            overflow: hidden; position: relative;
            display: flex; align-items: center; justify-content: center;
            min-height: 150px;
        }
        .page-preview canvas { max-width: 100%; display: block; }
        
        .page-nav {
            display: flex; align-items: center; gap: 10px;
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: var(--radius); padding: 12px 14px;
            margin-bottom: 14px;
        }
        .page-nav-label { font-size: 12px; font-weight: 700; color: var(--text2); white-space: nowrap; }
        .page-nav-input {
            width: 64px; background: var(--bg); border: 1.5px solid var(--border);
            border-radius: var(--radius-sm); color: var(--text);
            font-size: 15px; font-weight: 700; padding: 8px 10px;
            outline: none; text-align: center; font-family: inherit;
        }
        .page-nav-btn {
            width: 36px; height: 36px; border-radius: var(--radius-sm);
            border: 1.5px solid var(--border); background: var(--card-bg);
            color: var(--text2); font-size: 16px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
        }
        .page-nav-count {
            margin-left: auto; font-size: 11px; font-weight: 700;
            padding: 3px 10px; border-radius: 20px;
            background: rgba(108,99,255,0.12); color: #9C8BFF;
            border: 1px solid rgba(108,99,255,0.25); white-space: nowrap;
        }

        .tab-bar {
            display: flex; background: var(--card-bg);
            border: 1px solid var(--border); border-radius: var(--radius);
            overflow: hidden; margin-bottom: 14px;
        }
        #mbMcqOverlay .tab-btn {
            flex: 1; padding: 11px 6px; text-align: center;
            font-size: 12px; font-weight: 700; cursor: pointer;
            background: transparent; color: var(--text3);
            border: none; border-right: 1px solid var(--border);
            font-family: inherit; transition: all 0.2s;
        }
        #mbMcqOverlay .tab-btn.active { background: var(--accent); color: white; }
        
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }

        .options-grid { display: flex; flex-direction: column; gap: 8px; }
        .option-row { display: flex; align-items: center; gap: 8px; }
        .option-badge {
            width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
            background: rgba(108,99,255,0.12); border: 1.5px solid rgba(108,99,255,0.3);
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 700; color: #9C8BFF;
            cursor: pointer; transition: all 0.2s;
        }
        .option-badge.correct-sel {
            background: #10B981; border-color: #10B981; color: white;
        }
        
        .type-selector { display: flex; gap: 8px; margin-top: 10px; }
        .type-opt {
            flex: 1; padding: 8px 6px; border-radius: var(--radius-sm);
            border: 1.5px solid var(--border); background: var(--card-bg);
            text-align: center; font-size: 11px; font-weight: 700;
            cursor: pointer; transition: all 0.2s; color: var(--text3);
        }
        .type-opt.selected {
            background: rgba(108,99,255,0.12); border-color: var(--accent); color: #9C8BFF;
        }

        .form-group { margin-bottom: 12px; }
        .form-label { display: block; font-size: 11px; font-weight: 700; color: var(--text3); margin-bottom: 4px; }
        .form-input, .form-textarea {
            width: 100%; padding: 8px 10px; background: var(--card-bg);
            border: 1px solid var(--border); border-radius: 6px;
            color: var(--text); font-size: 12px; font-family: inherit;
        }
        .form-textarea { resize: vertical; min-height: 60px; }
        
        .btn-primary {
            width: 100%; padding: 12px; border: none; border-radius: 8px;
            font-size: 13px; font-weight: 700; cursor: pointer;
            background: linear-gradient(135deg, var(--accent), #3D35B0);
            color: #fff; margin-top: 10px;
        }
        .back-btn-header {
            background: none; border: none; color: var(--text);
            font-size: 18px; cursor: pointer; padding: 5px;
        }
    `;
    document.head.appendChild(style);
}

async function openMbMcqPanel(pdfId, pdfTitle, pdfUrl) {
    mbInjectStyles();
    activePdfId = pdfId;
    activePdfTitle = pdfTitle;
    currentPage = 1;
    selAnswerKey = 0;
    selTypeKey = 'standard';
    
    let panel = document.getElementById('mbMcqOverlay');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'mbMcqOverlay';
        panel.className = 'mcq-panel';
        document.body.appendChild(panel);
    }
    
    panel.innerHTML = `
        <div class="mcq-panel-header">
            <button class="back-btn-header" onclick="closeMbMcqPanel()">←</button>
            <div class="mcq-panel-title">${esc(pdfTitle)} — MCQ সম্পাদনা</div>
        </div>
        <div class="mcq-panel-body">
            <div class="page-preview">
                <canvas id="mbPdfCanvas"></canvas>
            </div>
            
            <div class="page-nav">
                <span class="page-nav-label">পেইজ</span>
                <button class="page-nav-btn" onclick="mbPrevPage()">‹</button>
                <input type="number" class="page-nav-input" id="mbPageInput" min="1" value="1" onchange="mbGoToPage()">
                <button class="page-nav-btn" onclick="mbNextPage()">›</button>
                <div class="page-nav-count" id="mbPageCount">...</div>
            </div>
            
            <div class="tab-bar">
                <button class="tab-btn active" id="tabBtnManual" onclick="mbSwitchTab('manual')">📝 Manual</button>
                <button class="tab-btn" id="tabBtnCsv" onclick="mbSwitchTab('csv')">📊 CSV</button>
                <button class="tab-btn" id="tabBtnAi" onclick="mbSwitchTab('ai')">🤖 AI</button>
            </div>
            
            <div id="tab-manual" class="tab-panel active">
                <div class="form-group">
                    <label class="form-label">প্রশ্ন</label>
                    <textarea class="form-textarea" id="mbQuestion" placeholder="প্রশ্ন লিখুন..."></textarea>
                </div>
                
                <div class="options-grid">
                    ${['ক','খ','গ','ঘ','ঙ'].map((key, i) => `
                    <div class="option-row">
                        <div class="option-badge ${i===0?'correct-sel':''}" id="optBadge${i}" onclick="mbSetCorrect(${i})">${key}</div>
                        <input class="form-input" id="mbOption${i}" placeholder="অপশন ${key}">
                    </div>`).join('')}
                </div>
                
                <div class="form-group" style="margin-top:14px">
                    <label class="form-label">ব্যাখ্যা (ঐচ্ছিক)</label>
                    <textarea class="form-textarea" id="mbExplanation" placeholder="ব্যাখ্যা লিখুন..."></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">প্রশ্নের ধরন</label>
                    <div class="type-selector">
                        <div class="type-opt selected" id="typeOptStandard" onclick="mbSetType('standard')">Standard</div>
                        <div class="type-opt" id="typeOptHard" onclick="mbSetType('hard')">Hard</div>
                        <div class="type-opt" id="typeOptTf" onclick="mbSetType('true_false')">T/F</div>
                    </div>
                </div>
                
                <button class="btn-primary" onclick="mbSaveMcq()">💾 সংরক্ষণ করো</button>
            </div>
            
            <div id="tab-csv" class="tab-panel">
                <div class="form-group">
                    <label class="form-label">CSV ডেটা (প্রশ্ন,ক,খ,গ,ঘ,সঠিক)</label>
                    <textarea class="form-textarea" id="mbCsvData" style="min-height:200px" placeholder="প্রশ্ন,অপশন১,অপশন২,অপশন৩,অপশন৪,সঠিক_ইনডেক্স(০-৩)"></textarea>
                </div>
                <button class="btn-primary" onclick="mbImportCsv()">📥 আমদানি করো</button>
            </div>
            
            <div id="tab-ai" class="tab-panel">
                <div class="form-group">
                    <label class="form-label">AI প্রম্পট</label>
                    <textarea class="form-textarea" id="mbAiPrompt" placeholder="যেমন: এই পেইজ থেকে ৫টি কঠিন প্রশ্ন তৈরি করো..."></textarea>
                </div>
                <button class="btn-primary" onclick="mbGenerateAi()">🤖 AI দিয়ে তৈরি করো</button>
            </div>
        </div>
    `;
    
    panel.classList.add('active');
    
    // Load PDF preview
    try {
        cachedPdfUrl = pdfUrl;
        cachedPdfDoc = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
        document.getElementById('mbPageCount').textContent = cachedPdfDoc.numPages + ' পেইজ';
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
        
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch (e) {
        console.error('পেইজ রেন্ডার ব্যর্থ:', e);
    }
}

function mbPrevPage() { if (currentPage > 1) mbRenderPage(currentPage - 1); }
function mbNextPage() { if (cachedPdfDoc && currentPage < cachedPdfDoc.numPages) mbRenderPage(currentPage + 1); }
function mbGoToPage() {
    const pageNum = parseInt(document.getElementById('mbPageInput').value) || 1;
    mbRenderPage(pageNum);
}

function mbSetCorrect(idx) {
    selAnswerKey = idx;
    document.querySelectorAll('.option-badge').forEach((b, i) => {
        b.classList.toggle('correct-sel', i === idx);
    });
}

function mbSetType(type) {
    selTypeKey = type;
    document.querySelectorAll('.type-opt').forEach(opt => {
        opt.classList.toggle('selected', opt.id === 'typeOpt' + type.charAt(0).toUpperCase() + type.slice(1).replace('_',''));
    });
}

function mbSwitchTab(tabName) {
    document.querySelectorAll('#mbMcqOverlay .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#mbMcqOverlay .tab-panel').forEach(p => p.classList.remove('active'));
    
    document.getElementById('tabBtn' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
    document.getElementById('tab-' + tabName).classList.add('active');
}

async function mbSaveMcq() {
    const question = document.getElementById('mbQuestion').value.trim();
    const options = [
        document.getElementById('mbOption0').value.trim(),
        document.getElementById('mbOption1').value.trim(),
        document.getElementById('mbOption2').value.trim(),
        document.getElementById('mbOption3').value.trim(),
        document.getElementById('mbOption4').value.trim()
    ].filter(Boolean);
    
    if (!question) return mbToast('প্রশ্ন লিখুন', 'error');
    if (options.length < 2) return mbToast('অন্তত ২টি অপশন প্রয়োজন', 'error');

    try {
        await api('/questions', {
            method: 'POST',
            body: JSON.stringify({
                pdf_id: activePdfId,
                page_number: currentPage,
                question: question,
                options: options,
                correct_option: selAnswerKey,
                explanation: document.getElementById('mbExplanation').value.trim(),
                type: selTypeKey
            })
        });
        mbToast('✓ MCQ সংরক্ষিত হয়েছে', 'success');
        
        // Clear fields
        document.getElementById('mbQuestion').value = '';
        document.getElementById('mbExplanation').value = '';
        for(let i=0; i<5; i++) document.getElementById('mbOption'+i).value = '';
    } catch (e) {
        mbToast('সংরক্ষণ ব্যর্থ', 'error');
    }
}

function mbImportCsv() {
    mbToast('✓ CSV আমদানি লজিক শীঘ্রই আসছে', 'info');
}

function mbGenerateAi() {
    mbToast('🤖 AI প্রসেসিং শুরু হচ্ছে...', 'info');
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMulboiAdmin);
} else {
    initMulboiAdmin();
}
