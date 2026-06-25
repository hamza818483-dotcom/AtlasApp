/* ══════════════════════════════════════════════════════════
   মূলবই — PDF PER-PAGE MCQ ADMIN PANEL  (NEW FILE, ISOLATED)
   Brought in from AtlasPro's admin/pdf.html UI/UX, rewritten to use
   this app's Supabase REST API instead of AtlasPro's Cloudflare
   Worker + D1 backend. Reuses the exact same AI-generation function
   already used by study.html (the student-facing reader), so admin-
   created MCQs and on-demand student-generated MCQs are 100% compatible
   — both read/write the same `book_page_mcqs` table:
     columns: pdf_id, page_number, mcq_type, questions_json (JSON array)
   questions_json item shape: {question, options:[4], answer_index (0-based), explanation}

   Depends on globals already defined in admin.html: SUPABASE_URL,
   SUPABASE_KEY, safeFetch(), escMb(), showToast() (if present), pdfjsLib,
   GROQ_KEY, GEMINI_KEYS.
   Does not modify or override any existing admin.html function.
═══════════════════════════════════════════════════════════ */

// PDF.js worker setup — must run before any pdfjsLib.getDocument() call
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ---------- ALL-PDFS FLAT LIST (parity with AtlasPro's loadAllPdfs) ---------- */
async function mbLoadAllPdfs() {
    const box = document.getElementById('mbAllPdfsList');
    if (!box) return;
    box.innerHTML = '<p style="color:var(--text2);text-align:center;padding:16px;">লোড হচ্ছে...</p>';
    try {
        const pdfs = await safeFetch(`${SUPABASE_URL}/rest/v1/book_pdfs?select=*,book_chapters(name,book_subjects(name))&order=created_at.desc`);
        if (!pdfs?.length) {
            box.innerHTML = '<p style="color:var(--text2);text-align:center;padding:16px;">📄 কোনো PDF নেই — উপরে বিষয় ও অধ্যায় বেছে PDF আপলোড করো</p>';
            return;
        }
        box.innerHTML = pdfs.map(p => {
            const chapterName = p.book_chapters?.name || '';
            const subjectName = p.book_chapters?.book_subjects?.name || '';
            const st = escMb(p.title).replace(/'/g, "\\'");
            const su = (p.file_url || '').replace(/'/g, "\\'");
            return `<div class="pdf-card">
                <div class="pdf-card-top">
                    <div class="pdf-card-icon">📕</div>
                    <div class="pdf-card-info">
                        <div class="pdf-card-title">${escMb(p.title)}</div>
                        <div class="pdf-card-meta">
                            ${subjectName ? '📚 ' + escMb(subjectName) : ''}${chapterName ? ' › 📖 ' + escMb(chapterName) : ''}${p.page_count ? ' · ' + p.page_count + ' পেইজ' : ''}
                        </div>
                    </div>
                    <div class="pdf-card-actions">
                        <button class="act-btn act-edit" onclick="openMbMcqPanel('${p.id}','${st}',${p.page_count||0},'${su}')" title="MCQ ব্যবস্থাপনা">❓</button>
                        <button class="act-btn act-delete" onclick="mbDeletePdfFromFlatList('${p.id}')" title="মুছে ফেলুন">🗑️</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        box.innerHTML = '<p style="color:var(--red);text-align:center;padding:16px;">লোড এরর — <a href="#" onclick="mbLoadAllPdfs();return false;" style="color:var(--accent);">আবার চেষ্টা করো</a></p>';
    }
}

async function mbDeletePdfFromFlatList(pdfId) {
    if (!confirm('এই PDF মুছে ফেলবেন? এর সব MCQ ও পেইজ-ভিউ ডেটাও মুছে যাবে।')) return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/book_pdfs?id=eq.${pdfId}`, {
            method: 'DELETE',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
        });
        mbToast('🗑️ PDF মুছে গেছে');
        mbLoadAllPdfs();
        // Also refresh the subject/chapter accordion if it's currently showing this PDF's chapter
        if (typeof loadMulboiSubjects === 'function' && typeof mbOpenSubject !== 'undefined' && mbOpenSubject) {
            loadMbChapters(mbOpenSubject);
        }
    } catch (e) { mbToast('❌ ডিলিট ব্যর্থ'); }
}

let mbMcq = {
    pdfId: null, pdfTitle: '', pageCount: 0, fileUrl: '',
    currentPage: 1, currentType: 'standard',
    pdfDoc: null, cachedUrl: null,
    pageQuestions: [], // current page+type's questions array (in-memory, edited then saved as one batch)
    editingIndex: null,
    csvRows: [],
    pageMcqCounts: {}, // { pageNumber: count } for the current type — powers the page-grid badges
    gridOpen: false
};

function mbToast(msg) {
    if (typeof showToast === 'function') { showToast(msg); return; }
    console.log(msg);
}

/* ---------- OPEN / CLOSE PANEL ---------- */
function openMbMcqPanel(pdfId, pdfTitle, pageCount, fileUrl) {
    mbMcq.pdfId = parseInt(pdfId);
    mbMcq.pdfTitle = pdfTitle;
    mbMcq.pageCount = pageCount || 0;
    mbMcq.fileUrl = fileUrl || '';
    mbMcq.currentPage = 1;
    mbMcq.currentType = 'standard';
    mbMcq.pdfDoc = null;
    mbMcq.cachedUrl = null;
    mbMcq.pageQuestions = [];
    mbMcq.editingIndex = null;
    mbMcq.csvRows = [];
    mbMcq._currentImageUrl = null;
    mbMcq.pageMcqCounts = {};
    mbMcq.gridOpen = false;

    let overlay = document.getElementById('mbMcqOverlay');
    if (!overlay) { mbBuildMcqPanelDom(); overlay = document.getElementById('mbMcqOverlay'); }
    document.getElementById('mbMcqTitle').textContent = '❓ ' + pdfTitle + ' — MCQ ব্যবস্থাপনা';
    document.getElementById('mbMcqPageInput').value = 1;
    const aiCountEl = document.getElementById('mbAiCount'); if (aiCountEl) aiCountEl.value = 5;
    const aiTypeEl = document.getElementById('mbAiTypeSelect'); if (aiTypeEl) aiTypeEl.value = 'current';
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    mbSwitchTab('manual');
    mbLoadPagePreview();
    mbLoadPageQuestions();
}

function closeMbMcqPanel() {
    const overlay = document.getElementById('mbMcqOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

/* ---------- BUILD DOM (once) ---------- */
function mbInjectStyles() {
    if (document.getElementById('mbMcqStyles')) return;
    const style = document.createElement('style');
    style.id = 'mbMcqStyles';
    style.textContent = `
        #mbMcqOverlay input, #mbMcqOverlay textarea, #mbMcqOverlay select {
            padding:9px 11px;border:1px solid var(--border);border-radius:8px;
            background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;
            outline:none;transition:all .2s;width:100%;box-sizing:border-box;
        }
        #mbMcqOverlay input:focus, #mbMcqOverlay textarea:focus, #mbMcqOverlay select:focus {
            border-color:var(--accent);
        }
        #mbMcqOverlay input[type="file"] { padding:7px; }
        #mbMcqOverlay input[type="number"] { width:60px; }
    `;
    document.head.appendChild(style);
}

function mbBuildMcqPanelDom() {
    mbInjectStyles();
    const div = document.createElement('div');
    div.innerHTML = `
    <div class="mcq-panel" id="mbMcqOverlay">
        <div class="mcq-panel-header">
            <button class="act-btn" onclick="closeMbMcqPanel()">←</button>
            <div class="mcq-panel-title" id="mbMcqTitle">MCQ ব্যবস্থাপনা</div>
        </div>
        <div class="mcq-panel-context" id="mbMcqContext" style="display:block;"></div>
        <div class="mcq-panel-body">
            
            <div class="page-preview" id="mbMcqPagePreviewWrap">
                <canvas id="mbMcqPreviewCanvas"></canvas>
                <div class="page-preview-loading" id="mbMcqPreviewLoading">PDF পেইজ লোড হচ্ছে...</div>
            </div>

            <div class="page-nav">
                <span class="page-nav-label">পেইজ নং:</span>
                <button class="page-nav-btn" onclick="mbPageStep(-1)">‹</button>
                <input type="number" class="page-nav-input" id="mbMcqPageInput" value="1" min="1" onchange="mbOnPageChange()">
                <button class="page-nav-btn" onclick="mbPageStep(1)">›</button>
                <button class="act-btn" id="mbPageGridToggleBtn" onclick="mbTogglePageGrid()" style="margin-left:8px;width:auto;padding:0 10px;font-size:12px;">▦ সব পেইজ</button>
                <span class="page-nav-count" id="mbMcqPageCount">০ টি MCQ</span>
            </div>

            <div id="mbPageGridWrap" style="display:none;background:var(--hover);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:14px;max-height:160px;overflow-y:auto;">
                <div id="mbPageGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:6px;"></div>
            </div>

            <div class="type-selector-alt">
                <div class="type-opt-alt selected" id="mbTypeBtn_standard" onclick="mbSwitchType('standard')">📚 Standard</div>
                <div class="type-opt-alt" id="mbTypeBtn_true_false" onclick="mbSwitchType('true_false')">✅ True-False</div>
                <div class="type-opt-alt" id="mbTypeBtn_hard" onclick="mbSwitchType('hard')">🔥 Hard</div>
            </div>

            <div class="tab-bar">
                <button class="tab-btn-alt active" id="mbTabBtn_manual" onclick="mbSwitchTab('manual')">📝 ম্যানুয়াল</button>
                <button class="tab-btn-alt" id="mbTabBtn_csv" onclick="mbSwitchTab('csv')">📊 CSV</button>
                <button class="tab-btn-alt" id="mbTabBtn_ai" onclick="mbSwitchTab('ai')">🤖 AI</button>
            </div>

            <!-- MANUAL TAB -->
            <div id="mbTabPanel_manual">
                <div class="section-card" style="margin-bottom:14px;border-top:none;">
                    <div class="card-body" style="background:var(--hover);">
                        <div class="card-title" id="mbManualFormTitle">➕ নতুন প্রশ্ন যোগ</div>
                        <div class="form-group">
                            <label class="form-label">প্রশ্ন *</label>
                            <textarea class="form-textarea" id="mbMcqQuestion" placeholder="প্রশ্নটি লিখুন..." rows="3"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">বিকল্পসমূহ *</label>
                            <div id="mbMcqOptionsWrap" style="display:flex;flex-direction:column;gap:8px;"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">ব্যাখ্যা (ঐচ্ছিক)</label>
                            <textarea class="form-textarea" id="mbMcqExplanation" placeholder="সঠিক উত্তরের ব্যাখ্যা..." rows="2"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">ছবি (ঐচ্ছিক)</label>
                            <input type="file" id="mbMcqImage" accept="image/*" onchange="mbMcqImageSelect(event)" style="font-size:12px;">
                            <div id="mbMcqImagePreviewWrap" style="display:none;margin-top:10px;position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border);">
                                <img id="mbMcqImagePreview" style="max-width:100%;display:block;">
                                <button type="button" onclick="mbRemoveMcqImage()" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;">✕</button>
                            </div>
                            <div id="mbMcqImageUploading" style="display:none;font-size:11px;color:var(--accent);margin-top:6px;">⏳ ছবি আপলোড হচ্ছে...</div>
                        </div>
                        <div style="display:flex;gap:10px;margin-top:16px;">
                            <button class="btn btn-outline" id="mbMcqCancelBtn" style="display:none;flex:1;" onclick="mbCancelEdit()">বাতিল</button>
                            <button class="btn btn-primary" id="mbMcqSaveBtn" style="flex:1;" onclick="mbSaveManualMcq()">✓ সংরক্ষণ করো</button>
                        </div>
                    </div>
                </div>
                <div id="mbManualMcqList"></div>
            </div>

            <!-- CSV TAB -->
            <div id="mbTabPanel_csv" style="display:none;">
                <div class="section-card" style="border-top:none;">
                    <div class="card-body" style="background:var(--hover);">
                        <div style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:12px;">
                            <b style="color:var(--green);">CSV ফরম্যাট:</b> <code>question,option1,option2,option3,option4,answer,explanation</code><br>
                            সঠিক উত্তর (answer) হিসেবে ১, ২, ৩ বা ৪ ব্যবহার করুন।
                        </div>
                        <button class="btn btn-outline btn-full" style="margin-bottom:12px;" onclick="mbDownloadCsvTemplate()">⬇️ টেমপ্লেট ডাউনলোড</button>
                        <div class="drop-zone" id="mbCsvDropZone" onclick="document.getElementById('mbCsvFileInput').click()"
                            ondragover="mbCsvDragOver(event)" ondragleave="mbCsvDragLeave(event)" ondrop="mbCsvDrop(event)">
                            <div class="drop-zone-icon">📊</div>
                            <div class="drop-zone-text">CSV ফাইল এখানে ড্র্যাগ করুন বা ক্লিক করুন</div>
                            <input type="file" id="mbCsvFileInput" accept=".csv" onchange="mbCsvFileSelect(event)" style="display:none;">
                        </div>
                        <div id="mbCsvPreviewInfo" style="display:none;font-size:12px;color:var(--text2);margin-top:12px;font-weight:600;"></div>
                        <div id="mbCsvPreviewTableWrap" style="display:none;overflow-x:auto;margin-top:10px;border:1px solid var(--border);border-radius:8px;background:var(--card);">
                            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                                <thead style="background:var(--hover);border-bottom:1px solid var(--border);">
                                    <tr><th style="padding:8px;">#</th><th style="padding:8px;text-align:left;">প্রশ্ন</th><th style="padding:8px;">উত্তর</th></tr>
                                </thead>
                                <tbody id="mbCsvPreviewBody"></tbody>
                            </table>
                        </div>
                        <button class="btn btn-primary btn-full" id="mbCsvImportBtn" style="display:none;margin-top:14px;" onclick="mbImportCsv()">📥 আমদানি সম্পন্ন করো</button>
                    </div>
                </div>
            </div>

            <!-- AI TAB -->
            <div id="mbTabPanel_ai" style="display:none;">
                <div class="section-card" style="border-top:none;">
                    <div class="card-body" style="background:var(--hover);">
                        <div style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:14px;">
                            🤖 AI এই পেইজের ছবি থেকে স্বয়ংক্রিয়ভাবে MCQ তৈরি করবে।
                        </div>
                        <div style="display:flex;gap:10px;margin-bottom:14px;">
                            <div style="flex:1;">
                                <label class="form-label">প্রশ্ন সংখ্যা</label>
                                <input type="number" class="form-input" id="mbAiCount" value="5" min="1" max="20">
                            </div>
                            <div style="flex:1;">
                                <label class="form-label">ধরন</label>
                                <select class="form-select" id="mbAiTypeSelect">
                                    <option value="current">বর্তমান টাইপ</option>
                                    <option value="mixed">🎯 Mixed</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">কাস্টম প্রম্পট (ঐচ্ছিক)</label>
                            <textarea class="form-textarea" id="mbAiPrompt" rows="3" placeholder="AI-কে বিশেষ কোনো নির্দেশনা দিতে চাইলে এখানে লিখুন..."></textarea>
                        </div>
                        <div style="display:flex;gap:8px;margin-bottom:14px;">
                            <button class="btn btn-sm btn-outline" style="flex:1;" onclick="mbSaveAiPrompt()">💾 সেভ প্রম্পট</button>
                            <button class="btn btn-sm btn-outline" style="flex:1;" onclick="mbLoadAiPrompt()">📂 লোড প্রম্পট</button>
                        </div>
                        <button class="btn btn-primary btn-full" id="mbAiGenBtn" onclick="mbAiGenerate()" style="background:linear-gradient(90deg, #6366F1, #8B5CF6);border:none;">🤖 AI দিয়ে MCQ তৈরি করো</button>
                        <div id="mbAiSpinner" style="display:none;text-align:center;padding:20px;">
                            <div style="width:30px;height:30px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;"></div>
                            <div style="font-size:12px;color:var(--accent);font-weight:600;">AI প্রশ্ন তৈরি করছে...</div>
                        </div>
                        <div id="mbAiPreviewWrap" style="display:none;margin-top:16px;">
                            <div class="section-heading" id="mbAiResultHeader">AI ফলাফল</div>
                            <div id="mbAiPreviewList"></div>
                            <div style="display:flex;gap:10px;margin-top:14px;">
                                <button class="btn btn-outline" style="flex:1;" onclick="mbDiscardAi()">✕ বাতিল</button>
                                <button class="btn btn-primary" style="flex:1;background:var(--green);border-color:var(--green);" onclick="mbSaveAiMcqs()">✓ সব সেভ করো</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>`;
    document.body.appendChild(div);
}

/* ---------- TYPE / TAB SWITCHING ---------- */
function mbSwitchType(type) {
    mbMcq.currentType = type;
    ['standard','true_false','hard'].forEach(t => {
        const btn = document.getElementById('mbTypeBtn_' + t);
        if (btn) btn.className = 'btn btn-sm' + (t === type ? '' : ' btn-outline');
    });
    const promptEl = document.getElementById('mbAiPrompt'); if (promptEl) promptEl.value = '';
    mbRenderOptionInputs();
    mbCancelEdit();
    mbLoadPageQuestions();
    if (mbMcq.gridOpen) mbLoadPageGrid();
}

function mbSwitchTab(tab) {
    ['manual','csv','ai'].forEach(t => {
        const panel = document.getElementById('mbTabPanel_' + t);
        const btn = document.getElementById('mbTabBtn_' + t);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
        if (btn) btn.className = 'btn btn-sm' + (t === tab ? '' : ' btn-outline');
    });
}

function mbRenderOptionInputs() {
    const wrap = document.getElementById('mbMcqOptionsWrap');
    if (!wrap) return;
    const isTF = mbMcq.currentType === 'true_false';
    const labels = isTF ? ['সত্য','মিথ্যা'] : ['ক','খ','গ','ঘ'];
    wrap.innerHTML = labels.map((lbl, i) => `
        <div style="display:flex;align-items:center;gap:10px;">
            <div class="option-badge-alt" id="mbAnsBadge_${i}" onclick="mbSelectAnswer(${i})">${lbl}</div>
            <input class="form-input" id="mbOpt_${i}" placeholder="${isTF ? lbl : 'বিকল্প ' + lbl}" value="${isTF ? lbl : ''}" ${isTF ? 'readonly' : ''} style="flex:1;">
        </div>`).join('');
    mbMcq._selectedAnswer = null;
}

function mbSelectAnswer(i) {
    mbMcq._selectedAnswer = i;
    const count = mbMcq.currentType === 'true_false' ? 2 : 4;
    for (let k = 0; k < count; k++) {
        const b = document.getElementById('mbAnsBadge_' + k);
        if (!b) continue;
        if (k === i) b.classList.add('correct-sel');
        else b.classList.remove('correct-sel');
    }
}

/* ---------- PAGE NAVIGATION ---------- */
function mbPageStep(d) {
    const cur = parseInt(document.getElementById('mbMcqPageInput').value) || 1;
    const next = Math.max(1, cur + d);
    document.getElementById('mbMcqPageInput').value = next;
    mbMcq.currentPage = next;
    mbCancelEdit();
    mbLoadPagePreview();
    mbLoadPageQuestions();
    mbHighlightActiveGridPage();
}
function mbOnPageChange() {
    const v = parseInt(document.getElementById('mbMcqPageInput').value);
    mbMcq.currentPage = (isNaN(v) || v < 1) ? 1 : v;
    document.getElementById('mbMcqPageInput').value = mbMcq.currentPage;
    mbCancelEdit();
    mbLoadPagePreview();
    mbLoadPageQuestions();
    mbHighlightActiveGridPage();
}

/* ---------- PAGE GRID (parity with AtlasPro's mcq.html page-number grid + count badges) ---------- */
function mbTogglePageGrid() {
    mbMcq.gridOpen = !mbMcq.gridOpen;
    const wrap = document.getElementById('mbPageGridWrap');
    const btn = document.getElementById('mbPageGridToggleBtn');
    wrap.style.display = mbMcq.gridOpen ? 'block' : 'none';
    btn.className = 'btn btn-sm' + (mbMcq.gridOpen ? '' : ' btn-outline');
    if (mbMcq.gridOpen) mbLoadPageGrid();
}

async function mbLoadPageGrid() {
    const grid = document.getElementById('mbPageGrid');
    if (!grid) return;
    grid.innerHTML = '<div style="font-size:11px;color:var(--text2);">লোড হচ্ছে...</div>';
    try {
        // One query for all pages of this pdf+type, instead of N requests — then count client-side
        const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_page_mcqs?pdf_id=eq.${mbMcq.pdfId}&mcq_type=eq.${mbMcq.currentType}&select=page_number,questions_json`);
        mbMcq.pageMcqCounts = {};
        (rows || []).forEach(r => {
            try { mbMcq.pageMcqCounts[r.page_number] = (JSON.parse(r.questions_json) || []).length; } catch (_) {}
        });
    } catch (e) { mbMcq.pageMcqCounts = {}; }
    mbRenderPageGrid();
}

function mbRenderPageGrid() {
    const grid = document.getElementById('mbPageGrid');
    if (!grid) return;
    const totalPages = mbMcq.pageCount > 0 ? mbMcq.pageCount : 30;
    let html = '';
    for (let p = 1; p <= totalPages; p++) {
        const count = mbMcq.pageMcqCounts[p] || 0;
        const hasMcq = count > 0;
        const isActive = mbMcq.currentPage === p;
        html += `<button class="mb-page-grid-btn${hasMcq?' has-mcq':''}${isActive?' active':''}" id="mbPageGridBtn_${p}" onclick="mbSelectPageFromGrid(${p})"
            style="position:relative;height:34px;border-radius:6px;border:1.5px solid ${isActive?'var(--accent)':(hasMcq?'var(--green)':'var(--border)')};background:${isActive?'var(--accent)':'var(--card)'};color:${isActive?'#fff':'var(--text)'};font-size:11px;cursor:pointer;">
            ${p}${hasMcq?`<span style="position:absolute;top:-5px;right:-5px;background:var(--green);color:#fff;border-radius:8px;font-size:8px;padding:1px 4px;min-width:12px;">${count>9?'9+':count}</span>`:''}
        </button>`;
    }
    grid.innerHTML = html;
}

function mbHighlightActiveGridPage() {
    if (!mbMcq.gridOpen) return;
    document.querySelectorAll('.mb-page-grid-btn').forEach(b => {
        const isActive = b.id === 'mbPageGridBtn_' + mbMcq.currentPage;
        b.style.background = isActive ? 'var(--accent)' : 'var(--card)';
        b.style.color = isActive ? '#fff' : 'var(--text)';
        b.style.borderColor = isActive ? 'var(--accent)' : (b.classList.contains('has-mcq') ? 'var(--green)' : 'var(--border)');
    });
}

function mbSelectPageFromGrid(p) {
    mbMcq.currentPage = p;
    document.getElementById('mbMcqPageInput').value = p;
    mbCancelEdit();
    mbLoadPagePreview();
    mbLoadPageQuestions();
    mbHighlightActiveGridPage();
}

/* ---------- PDF PAGE PREVIEW (pdf.js, already loaded by admin.html) ---------- */
async function mbLoadPagePreview() {
    const loading = document.getElementById('mbMcqPreviewLoading');
    const canvas = document.getElementById('mbMcqPreviewCanvas');
    if (!mbMcq.fileUrl || typeof pdfjsLib === 'undefined') {
        if (loading) loading.textContent = 'PDF প্রিভিউ পাওয়া যায়নি (URL নেই)';
        return;
    }
    loading.style.display = 'block';
    loading.textContent = 'পেইজ লোড হচ্ছে...';
    try {
        if (!mbMcq.pdfDoc || mbMcq.cachedUrl !== mbMcq.fileUrl) {
            mbMcq.pdfDoc = await pdfjsLib.getDocument(mbMcq.fileUrl).promise;
            mbMcq.cachedUrl = mbMcq.fileUrl;
        }
        const pageNum = Math.min(mbMcq.currentPage, mbMcq.pdfDoc.numPages);
        if (pageNum < 1) { loading.style.display = 'none'; return; }
        const page = await mbMcq.pdfDoc.getPage(pageNum);
        const dpr = window.devicePixelRatio || 2;
        const maxW = Math.min(canvas.parentElement?.clientWidth || 400, 560);
        const orig = page.getViewport({ scale: 1 });
        const scale = (maxW / orig.width) * dpr;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width; canvas.height = viewport.height;
        canvas.style.width = (viewport.width / dpr) + 'px';
        canvas.style.height = (viewport.height / dpr) + 'px';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        loading.style.display = 'none';
    } catch (e) {
        loading.textContent = 'পেইজ প্রিভিউ লোড ব্যর্থ';
    }
}

async function mbGetPageImageBase64() {
    const canvas = document.getElementById('mbMcqPreviewCanvas');
    if (canvas && canvas.width > 0) {
        return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
    }
    return null;
}

/* ---------- LOAD / SAVE book_page_mcqs ROW ---------- */
async function mbLoadPageQuestions() {
    mbMcq.pageQuestions = [];
    try {
        const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_page_mcqs?pdf_id=eq.${mbMcq.pdfId}&page_number=eq.${mbMcq.currentPage}&mcq_type=eq.${mbMcq.currentType}&select=questions_json`);
        if (rows?.length) {
            try { mbMcq.pageQuestions = JSON.parse(rows[0].questions_json) || []; } catch (_) { mbMcq.pageQuestions = []; }
        }
    } catch (_) {}
    mbRenderOptionInputs();
    mbRenderManualList();
    mbUpdatePageCountLabel();
}

async function mbSavePageQuestionsToDb() {
    // NOTE: uses fetch() directly (not safeFetch()) because safeFetch() unconditionally
    // overwrites the Prefer header for POST requests, which would silently drop
    // 'resolution=merge-duplicates' below and break the upsert (causing a duplicate-key
    // error on every save after the first, since pdf_id+page_number+mcq_type is UNIQUE).
    const res = await fetch(`${SUPABASE_URL}/rest/v1/book_page_mcqs`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
            pdf_id: mbMcq.pdfId, page_number: mbMcq.currentPage, mcq_type: mbMcq.currentType,
            questions_json: JSON.stringify(mbMcq.pageQuestions)
        })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('❌ mbSavePageQuestionsToDb failed:', errText);
        mbToast('❌ সংরক্ষণ ব্যর্থ — আবার চেষ্টা করুন');
        throw new Error(errText || 'Save failed');
    }
    // Keep the page-grid badge in sync without a full reload
    mbMcq.pageMcqCounts[mbMcq.currentPage] = mbMcq.pageQuestions.length;
    if (mbMcq.gridOpen) mbRenderPageGrid();
}

function mbUpdatePageCountLabel() {
    const el = document.getElementById('mbMcqPageCount');
    if (el) el.textContent = mbMcq.pageQuestions.length + ' টি MCQ (' + ({standard:'Standard',true_false:'সত্য/মিথ্যা',hard:'Hard'}[mbMcq.currentType] || mbMcq.currentType) + ')';
}

/* ---------- MANUAL ADD / EDIT / DELETE ---------- */
function mbRenderManualList() {
    const listEl = document.getElementById('mbManualMcqList');
    if (!listEl) return;
    if (!mbMcq.pageQuestions.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px 10px;color:var(--text3);font-size:12px;">এই পেইজে এখনো কোনো প্রশ্ন যোগ করা হয়নি।</div>';
        return;
    }
    listEl.innerHTML = mbMcq.pageQuestions.map((q, i) => {
        const isDisabled = q.is_active === false;
        const typeLabels = { standard: 'Standard', true_false: 'True-False', hard: 'Hard' };
        const typeBadgeClass = `badge-${q.type || mbMcq.currentType}-alt`;
        
        return `
        <div class="mcq-card-alt" style="${isDisabled ? 'opacity:0.6;' : ''}">
            <div style="padding:12px 14px; display:flex; align-items:flex-start; gap:10px;">
                <div class="mcq-num-alt">${i + 1}</div>
                <div style="flex:1; font-size:13px; line-height:1.5; color:var(--text);">
                    ${escMb(q.question)}
                    ${isDisabled ? ' <span style="font-size:10px;color:var(--red);">(নিষ্ক্রিয়)</span>' : ''}
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button class="act-btn act-edit" onclick="mbEditManualMcq(${i})" title="সম্পাদনা">✏️</button>
                    <button class="act-btn act-delete" onclick="mbDeleteManualMcq(${i})" title="মুছে ফেলুন">🗑️</button>
                </div>
            </div>
            ${q.image_url ? `<div style="padding:0 14px 12px 46px;"><img src="${q.image_url}" style="max-width:100%;border-radius:8px;border:1px solid var(--border);"></div>` : ''}
            <div style="padding:0 14px 12px 46px; display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                ${(q.options || []).map((o, oi) => `
                    <div class="mcq-opt-alt ${oi === q.answer_index ? 'correct' : ''}">
                        <div class="opt-key-alt">${['ক', 'খ', 'গ', 'ঘ'][oi] || (oi + 1)}</div>
                        <div style="overflow:hidden;text-overflow:ellipsis;">${escMb(o)}</div>
                    </div>
                `).join('')}
            </div>
            <div style="padding:8px 14px 12px 46px; border-top:1px solid var(--border); display:flex; align-items:center; gap:10px;">
                <span class="type-badge-alt ${typeBadgeClass}">${typeLabels[q.type || mbMcq.currentType]}</span>
                <div style="font-size:10px; color:var(--text3); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${q.explanation ? 'ব্যাখ্যা: ' + escMb(q.explanation) : 'ব্যাখ্যা নেই'}
                </div>
                <button onclick="mbToggleMcqActive(${i})" style="background:none;border:none;font-size:12px;cursor:pointer;color:${isDisabled ? 'var(--text3)' : 'var(--green)'};" title="${isDisabled ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}">
                    ${isDisabled ? '👁️‍🗨️' : '👁️'}
                </button>
                <div style="display:flex;gap:4px;">
                    <button onclick="mbMoveMcq(${i},-1)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--card);font-size:9px;cursor:pointer;" ${i === 0 ? 'disabled' : ''}>▲</button>
                    <button onclick="mbMoveMcq(${i},1)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--card);font-size:9px;cursor:pointer;" ${i === mbMcq.pageQuestions.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Reorder a question up(-1)/down(1) within the current page+type, persisted immediately
async function mbMoveMcq(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= mbMcq.pageQuestions.length) return;
    const tmp = mbMcq.pageQuestions[i];
    mbMcq.pageQuestions[i] = mbMcq.pageQuestions[j];
    mbMcq.pageQuestions[j] = tmp;
    mbRenderManualList();
    try { await mbSavePageQuestionsToDb(); }
    catch (e) { mbToast('❌ ক্রম সংরক্ষণ ব্যর্থ'); }
}

// Toggle a question active/inactive without deleting it — inactive questions are
// filtered out before being served to students (see study.html / exam.html note below)
async function mbToggleMcqActive(i) {
    const q = mbMcq.pageQuestions[i];
    if (!q) return;
    const wasActive = q.is_active !== false;
    q.is_active = !wasActive;
    mbRenderManualList();
    try {
        await mbSavePageQuestionsToDb();
        mbToast(q.is_active ? 'প্রশ্ন সক্রিয় ✓' : 'প্রশ্ন নিষ্ক্রিয় ✓');
    } catch (e) {
        q.is_active = wasActive; // revert on failure
        mbRenderManualList();
        mbToast('❌ পরিবর্তন ব্যর্থ');
    }
}


function mbEditManualMcq(i) {
    const q = mbMcq.pageQuestions[i];
    if (!q) return;
    mbMcq.editingIndex = i;
    document.getElementById('mbManualFormTitle').textContent = '✏️ প্রশ্ন সম্পাদনা';
    document.getElementById('mbMcqQuestion').value = q.question || '';
    document.getElementById('mbMcqExplanation').value = q.explanation || '';
    (q.options || []).forEach((o, oi) => { const el = document.getElementById('mbOpt_' + oi); if (el && mbMcq.currentType !== 'true_false') el.value = o; });
    mbSelectAnswer(q.answer_index || 0);
    mbMcq._currentImageUrl = q.image_url || null;
    mbRenderMcqImagePreview();
    document.getElementById('mbMcqCancelBtn').style.display = 'block';
    document.getElementById('mbMcqSaveBtn').textContent = '✓ আপডেট করো';
    document.getElementById('mbMcqQuestion').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function mbCancelEdit() {
    mbMcq.editingIndex = null;
    const qEl = document.getElementById('mbMcqQuestion'); if (qEl) qEl.value = '';
    const eEl = document.getElementById('mbMcqExplanation'); if (eEl) eEl.value = '';
    if (mbMcq.currentType !== 'true_false') {
        for (let i = 0; i < 4; i++) { const el = document.getElementById('mbOpt_' + i); if (el) el.value = ''; }
    }
    mbMcq._selectedAnswer = null;
    mbMcq._currentImageUrl = null;
    mbRenderMcqImagePreview();
    const imgInput = document.getElementById('mbMcqImage'); if (imgInput) imgInput.value = '';
    const count = mbMcq.currentType === 'true_false' ? 2 : 4;
    for (let k = 0; k < count; k++) { const b = document.getElementById('mbAnsBadge_' + k); if (b) { b.style.background='var(--card)'; b.style.color='var(--text)'; b.style.borderColor='var(--border)'; } }
    const cancelBtn = document.getElementById('mbMcqCancelBtn'); if (cancelBtn) cancelBtn.style.display = 'none';
    const saveBtn = document.getElementById('mbMcqSaveBtn'); if (saveBtn) saveBtn.textContent = '✓ সংরক্ষণ করো';
}

async function mbDeleteManualMcq(i) {
    if (!confirm('এই প্রশ্নটি মুছে ফেলবেন?')) return;
    mbMcq.pageQuestions.splice(i, 1);
    await mbSavePageQuestionsToDb();
    mbToast('🗑️ প্রশ্ন মুছে গেছে');
    mbRenderManualList();
    mbUpdatePageCountLabel();
}

/* ---------- MCQ IMAGE (optional, per-question — via ImgBB, same hosting used elsewhere in this app) ---------- */
function mbRenderMcqImagePreview() {
    const wrap = document.getElementById('mbMcqImagePreviewWrap');
    const img = document.getElementById('mbMcqImagePreview');
    if (!wrap || !img) return;
    if (mbMcq._currentImageUrl) { img.src = mbMcq._currentImageUrl; wrap.style.display = 'block'; }
    else { img.src = ''; wrap.style.display = 'none'; }
}

function mbRemoveMcqImage() {
    mbMcq._currentImageUrl = null;
    const imgInput = document.getElementById('mbMcqImage'); if (imgInput) imgInput.value = '';
    mbRenderMcqImagePreview();
}

async function mbMcqImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const uploadingEl = document.getElementById('mbMcqImageUploading');
    uploadingEl.style.display = 'block';
    try {
        const url = await mbUploadImageFile(file);
        mbMcq._currentImageUrl = url;
        mbRenderMcqImagePreview();
        mbToast('🖼️ ছবি আপলোড সম্পন্ন');
    } catch (err) {
        mbToast('❌ ছবি আপলোড ব্যর্থ');
        e.target.value = '';
    } finally {
        uploadingEl.style.display = 'none';
    }
}

// Uploads a local image File to ImgBB using the same multi-key pool as
// ImgBBManager (kakhacq/imgbb-manager.js), but as base64 (ImgBBManager only
// exposes uploadFromUrl for re-hosting existing URLs, not local files).
async function mbUploadImageFile(file) {
    const keys = (typeof ImgBBManager !== 'undefined') ? ImgBBManager.getHealthyKeys() : [];
    if (!keys.length) throw new Error('NO_HEALTHY_IMGBB_KEYS');
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    let lastError = null;
    for (const key of keys) {
        try {
            const formData = new FormData();
            formData.append('key', key);
            formData.append('image', base64);
            const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data?.success && data.data?.url) return data.data.url;
            lastError = data?.error?.message || 'Unknown ImgBB error';
        } catch (e) { lastError = e.message; }
    }
    throw new Error(lastError || 'ImgBB upload failed');
}

async function mbSaveManualMcq() {
    const question = document.getElementById('mbMcqQuestion').value.trim();
    if (!question) { mbToast('❌ প্রশ্ন লিখুন'); return; }
    const count = mbMcq.currentType === 'true_false' ? 2 : 4;
    const options = [];
    for (let i = 0; i < count; i++) { options.push((document.getElementById('mbOpt_' + i)?.value || '').trim()); }
    if (options.some(o => !o)) { mbToast('❌ সব বিকল্প পূরণ করুন'); return; }
    if (mbMcq._selectedAnswer === null || mbMcq._selectedAnswer === undefined) { mbToast('❌ সঠিক উত্তর বাছুন'); return; }

    const mcqObj = {
        question, options,
        answer_index: mbMcq._selectedAnswer,
        explanation: document.getElementById('mbMcqExplanation').value.trim() || '',
        image_url: mbMcq._currentImageUrl || null
    };

    if (mbMcq.editingIndex !== null) {
        mbMcq.pageQuestions[mbMcq.editingIndex] = mcqObj;
    } else {
        mbMcq.pageQuestions.push(mcqObj);
    }
    await mbSavePageQuestionsToDb();
    mbToast(mbMcq.editingIndex !== null ? '✓ প্রশ্ন আপডেট হয়েছে' : '✓ প্রশ্ন যোগ হয়েছে');
    mbCancelEdit();
    mbRenderManualList();
    mbUpdatePageCountLabel();
}

/* ---------- CSV IMPORT ---------- */
function mbParseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
        const fields = []; let inQ = false, cur = '';
        for (const ch of line) {
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        fields.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (fields[i] || '').replace(/^"|"$/g, '').trim(); });
        return obj;
    }).filter(r => r.question || r.questions || r.question_text);
}

function mbCsvFileSelect(e) {
    const file = e.target.files[0];
    if (file) mbProcessCsvFile(file);
}

function mbCsvDragOver(e) { e.preventDefault(); document.getElementById('mbCsvDropZone').style.borderColor = 'var(--accent)'; }
function mbCsvDragLeave(e) { document.getElementById('mbCsvDropZone').style.borderColor = 'var(--border)'; }
function mbCsvDrop(e) {
    e.preventDefault();
    document.getElementById('mbCsvDropZone').style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) mbProcessCsvFile(file);
}

function mbProcessCsvFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
        const rows = mbParseCsv(ev.target.result);
        if (!rows.length) { mbToast('❌ CSV ফাইলে কোনো ডেটা নেই'); return; }
        mbMcq.csvRows = rows;
        mbRenderCsvPreview(rows);
    };
    reader.readAsText(file, 'UTF-8');
}

function mbRenderCsvPreview(rows) {
    const info = document.getElementById('mbCsvPreviewInfo');
    const tableWrap = document.getElementById('mbCsvPreviewTableWrap');
    const tbody = document.getElementById('mbCsvPreviewBody');
    const numToIdx = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const numLabel = { 0: '১', 1: '২', 2: '৩', 3: '৪' };

    const preview = rows.slice(0, 5);
    tbody.innerHTML = preview.map((r, i) => {
        const ansIdx = numToIdx[String(r.answer || '1').trim()] ?? 0;
        return `<tr style="border-top:1px solid var(--border);">
            <td style="padding:6px 8px;">${i+1}</td>
            <td style="padding:6px 8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;">${escMb((r.question||'').slice(0,40))}${(r.question||'').length>40?'...':''}</td>
            <td style="padding:6px 8px;text-align:center;${ansIdx===0?'color:var(--green);font-weight:700;':''}">${escMb((r.option1||'').slice(0,12))}</td>
            <td style="padding:6px 8px;text-align:center;${ansIdx===1?'color:var(--green);font-weight:700;':''}">${escMb((r.option2||'').slice(0,12))}</td>
            <td style="padding:6px 8px;text-align:center;${ansIdx===2?'color:var(--green);font-weight:700;':''}">${escMb((r.option3||'').slice(0,12))}</td>
            <td style="padding:6px 8px;text-align:center;${ansIdx===3?'color:var(--green);font-weight:700;':''}">${escMb((r.option4||'').slice(0,12))}</td>
            <td style="padding:6px 8px;text-align:center;font-weight:700;">${numLabel[ansIdx]}</td>
        </tr>`;
    }).join('');

    tableWrap.style.display = 'block';
    info.style.display = 'block';
    info.textContent = 'মোট ' + rows.length + ' টি প্রশ্ন পাওয়া গেছে' + (rows.length > 5 ? ' (প্রথম ৫টি দেখানো হচ্ছে)' : '') + ' — বর্তমান পেইজ ' + mbMcq.currentPage + ', টাইপ "' + mbMcq.currentType + '"-এ যোগ হবে।';
    const btn = document.getElementById('mbCsvImportBtn');
    btn.style.display = 'block';
    btn.textContent = '📥 ' + rows.length + ' টি প্রশ্ন আমদানি করো';
}

function mbDownloadCsvTemplate() {
    const headers = 'question,option1,option2,option3,option4,answer,explanation\n';
    const example = '"বাংলাদেশের রাজধানীর নাম কি?","ঢাকা","চট্টগ্রাম","সিলেট","রাজশাহী","1","ঢাকা বাংলাদেশের রাজধানী"\n';
    const blob = new Blob([headers + example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mcq-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

async function mbImportCsv() {
    if (!mbMcq.csvRows.length) return;
    const numToIdx = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const imported = mbMcq.csvRows.map(r => ({
        question: r.question || r.questions || r.question_text || '',
        options: [r.option1 || '', r.option2 || '', r.option3 || '', r.option4 || ''],
        answer_index: numToIdx[String(r.answer || '1').trim()] ?? 0,
        explanation: r.explanation || ''
    })).filter(q => q.question);

    mbMcq.pageQuestions = mbMcq.pageQuestions.concat(imported);
    await mbSavePageQuestionsToDb();

    const res = document.getElementById('mbCsvImportResult');
    res.style.display = 'block';
    res.textContent = '✅ ' + imported.length + ' টি প্রশ্ন আমদানি সম্পন্ন!';
    mbMcq.csvRows = [];
    document.getElementById('mbCsvPreviewInfo').style.display = 'none';
    document.getElementById('mbCsvPreviewTableWrap').style.display = 'none';
    document.getElementById('mbCsvImportBtn').style.display = 'none';
    document.getElementById('mbCsvFileInput').value = '';
    mbToast(imported.length + ' টি প্রশ্ন আমদানি ✓');
    mbRenderManualList();
    mbUpdatePageCountLabel();
}

/* ---------- AI GENERATE (reuses the exact same model chain as study.html) ---------- */
let mbKeyUsage = {};
function mbGetNextGeminiKey() {
    const today = new Date().toDateString();
    if (mbKeyUsage._date !== today) mbKeyUsage = { _date: today };
    let best = null, bestCnt = Infinity;
    GEMINI_KEYS.forEach(k => { const c = mbKeyUsage[k] || 0; if (c < 1450 && c < bestCnt) { best = k; bestCnt = c; } });
    if (best) { mbKeyUsage[best] = (mbKeyUsage[best] || 0) + 1; return best; }
    return GEMINI_KEYS[GEMINI_KEYS.length - 1];
}
const MB_VISION_MODELS = [
    { id: 'gemini25', provider: 'google', model: 'gemini-2.5-flash', key: mbGetNextGeminiKey },
    { id: 'gemini20', provider: 'google', model: 'gemini-2.0-flash', key: mbGetNextGeminiKey },
    { id: 'llama90v', provider: 'groq', model: 'llama-3.2-90b-vision-preview', key: () => GROQ_KEY }
];

function mbMcqPrompt(type, customPrompt, count) {
    count = count || 5;
    const typeInstructions = {
        standard: `সাধারণ মানের ${count}টি বহুনির্বাচনী (৪টি অপশন) প্রশ্ন তৈরি করো।`,
        true_false: `${count}টি সত্য/মিথ্যা ধরনের প্রশ্ন তৈরি করো (অপশন: "সত্য", "মিথ্যা" — ২টি অপশন)।`,
        hard: `বিশ্লেষণমূলক ও কঠিন মানের ${count}টি বহুনির্বাচনী (৪টি অপশন) প্রশ্ন তৈরি করো — সরাসরি তথ্য নয়, প্রয়োগ/বিশ্লেষণ ভিত্তিক।`
    };
    const instructionLine = (customPrompt && customPrompt.trim()) ? customPrompt.trim() : (typeInstructions[type] || typeInstructions.standard);
    return `তুমি একজন অভিজ্ঞ HSC শিক্ষক। নিচের বইয়ের পেইজের ছবি দেখে বাংলায় MCQ তৈরি করো।

নিয়ম:
১. প্রশ্ন, অপশন, ব্যাখ্যা — সব অবশ্যই এই পেইজের ভাষায় (যদি পেইজ বাংলায় হয় তাহলে বাংলায়, ইংরেজিতে হলে ইংরেজিতে) লিখবে।
২. ${instructionLine}
৩. প্রতিটি প্রশ্নের সাথে সংক্ষিপ্ত ব্যাখ্যা দিবে।
৪. শুধুমাত্র এই পেইজের কন্টেন্ট থেকে প্রশ্ন বানাবে, বাইরের তথ্য না। প্লেসহোল্ডার/নমুনা প্রশ্ন বানাবে না।

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দিবে, অন্য কোনো লেখা/markdown/backtick ছাড়া:
{"questions":[{"question":"...","options":["...","...","...","..."],"answer_index":0,"explanation":"..."}]}`;
}

async function mbCallGoogleVision(model, imageData, type, customPrompt, count) {
    const key = model.key();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [
                { inline_data: { mime_type: imageData.mimeType, data: imageData.base64 } },
                { text: mbMcqPrompt(type, customPrompt, count) }
            ] }],
            generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
        })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}
async function mbCallGroqVision(model, imageData, type, customPrompt, count) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + model.key(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model.model,
            messages: [{ role: 'user', content: [
                { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
                { type: 'text', text: mbMcqPrompt(type, customPrompt, count) }
            ] }],
            temperature: 0.6, max_tokens: 2000
        })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
}
function mbParseQuestionsJSON(raw) {
    try {
        let clean = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
        const parsed = JSON.parse(clean);
        const list = parsed.questions || [];
        return list.filter(q => {
            if (!q || typeof q !== 'object') return false;
            const qText = (q.question || '').trim();
            if (!qText || qText.length < 5) return false;
            const opts = (q.options || []).map(o => (o || '').trim());
            return opts.filter(o => o.length > 0).length >= 2;
        });
    } catch (e) { return []; }
}
async function mbRaceForValidQuestions(promises) {
    const settled = await Promise.allSettled(promises);
    for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
            const parsed = mbParseQuestionsJSON(r.value);
            if (parsed?.length) return parsed;
        }
    }
    return [];
}
async function mbGenerateMCQsFromImage(imageData, type, customPrompt, count) {
    const group1 = [
        mbCallGoogleVision(MB_VISION_MODELS[0], imageData, type, customPrompt, count).catch(() => null),
        mbCallGoogleVision(MB_VISION_MODELS[1], imageData, type, customPrompt, count).catch(() => null)
    ];
    let result = await mbRaceForValidQuestions(group1);
    if (result?.length) return result;
    const group2 = [mbCallGroqVision(MB_VISION_MODELS[2], imageData, type, customPrompt, count).catch(() => null)];
    result = await mbRaceForValidQuestions(group2);
    return result || [];
}

let mbAiPreviewData = [];
let mbAiPreviewIsMixed = false; // tracks whether the current preview spans multiple types (each item tagged with _mbType)

async function mbAiGenerate() {
    const spin = document.getElementById('mbAiSpinner');
    const genBtn = document.getElementById('mbAiGenBtn');
    const resultWrap = document.getElementById('mbAiPreviewWrap');
    spin.style.display = 'block'; genBtn.disabled = true; resultWrap.style.display = 'none'; mbAiPreviewData = [];

    const count = Math.min(20, Math.max(1, parseInt(document.getElementById('mbAiCount')?.value) || 5));
    const mode = document.getElementById('mbAiTypeSelect')?.value || 'current';
    mbAiPreviewIsMixed = (mode === 'mixed');

    try {
        const imageData = await mbGetPageImageBase64();
        if (!imageData) throw new Error('পেইজের ছবি পাওয়া যায়নি');
        const customPrompt = document.getElementById('mbAiPrompt')?.value.trim() || '';

        let questions = [];
        if (mode === 'mixed') {
            // Mixed: generate for all 3 types, splitting the requested count roughly evenly,
            // tagging each question with its type so it saves into the right book_page_mcqs row.
            const types = ['standard', 'true_false', 'hard'];
            const perType = Math.max(1, Math.round(count / types.length));
            for (const t of types) {
                const qs = await mbGenerateMCQsFromImage(imageData, t, '', perType); // mixed mode ignores custom prompt (it's per-type)
                qs.forEach(q => q._mbType = t);
                questions = questions.concat(qs);
            }
        } else {
            questions = await mbGenerateMCQsFromImage(imageData, mbMcq.currentType, customPrompt, count);
            questions.forEach(q => q._mbType = mbMcq.currentType);
        }

        if (!questions.length) throw new Error('AI কোনো বৈধ MCQ তৈরি করতে পারেনি। আবার চেষ্টা করুন।');
        mbAiPreviewData = questions;
        mbRenderAiPreview(questions);
        mbToast(questions.length + ' টি MCQ তৈরি হয়েছে ✓');
    } catch (e) {
        mbToast('❌ AI ত্রুটি: ' + e.message);
    } finally {
        spin.style.display = 'none'; genBtn.disabled = false;
    }
}

/* ---------- SAVE/LOAD CUSTOM AI PROMPT (per-PDF, per-type) ---------- */
async function mbSaveAiPrompt() {
    const prompt = document.getElementById('mbAiPrompt')?.value.trim();
    if (!prompt) { mbToast('❌ প্রম্পট লিখুন'); return; }
    const btn = document.getElementById('mbSavePromptBtn');
    btn.disabled = true;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/book_ai_prompts`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({ pdf_id: mbMcq.pdfId, mcq_type: mbMcq.currentType, prompt })
        });
        if (!res.ok) throw new Error(await res.text());
        const status = document.getElementById('mbPromptSaveStatus');
        status.textContent = '✅ প্রম্পট সেভ হয়েছে (' + mbMcq.currentType + ')';
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', 3000);
        mbToast('✓ প্রম্পট সেভ হয়েছে');
    } catch (e) {
        mbToast('❌ সেভ ব্যর্থ');
    } finally { btn.disabled = false; }
}

async function mbLoadAiPrompt() {
    try {
        const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_ai_prompts?pdf_id=eq.${mbMcq.pdfId}&mcq_type=eq.${mbMcq.currentType}&select=prompt`);
        if (rows?.length && rows[0].prompt) {
            document.getElementById('mbAiPrompt').value = rows[0].prompt;
            mbToast('📂 সেভ করা প্রম্পট লোড হয়েছে (' + mbMcq.currentType + ')');
        } else {
            mbToast('এই ধরনের জন্য কোনো সেভ করা প্রম্পট নেই');
        }
    } catch (e) { mbToast('❌ লোড ব্যর্থ'); }
}

const MB_TYPE_LABELS = { standard: '📚 Standard', true_false: '✅ সত্য/মিথ্যা', hard: '🔥 Hard' };

function mbRenderAiPreview(qs) {
    document.getElementById('mbAiResultHeader').textContent = 'AI তৈরি করেছে ' + qs.length + ' টি প্রশ্ন (সম্পাদনা করতে পারবেন)';
    document.getElementById('mbAiPreviewList').innerHTML = qs.map((q, idx) => `
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:6px;">
            ${mbAiPreviewIsMixed ? `<div style="font-size:9.5px;color:var(--accent);font-weight:700;margin-bottom:4px;">${MB_TYPE_LABELS[q._mbType] || q._mbType}</div>` : ''}
            <textarea id="mbAiQ_${idx}" rows="2" style="width:100%;margin-bottom:6px;font-size:12px;">${escMb(q.question)}</textarea>
            ${(q.options||[]).map((o,oi)=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="font-size:10px;width:16px;color:${oi===q.answer_index?'var(--green)':'var(--text2)'};">${oi===q.answer_index?'✅':'◽'}</span>
                <input id="mbAiOpt_${idx}_${oi}" value="${escMb(o)}" style="flex:1;font-size:11px;padding:5px;">
            </div>`).join('')}
            <select id="mbAiAns_${idx}" style="font-size:10.5px;padding:4px;margin-top:4px;">
                ${(q.options||[]).map((o,oi)=>`<option value="${oi}" ${oi===q.answer_index?'selected':''}>সঠিক: ${oi+1}) ${escMb(o).slice(0,20)}</option>`).join('')}
            </select>
        </div>`).join('');
    document.getElementById('mbAiPreviewWrap').style.display = 'block';
}

function mbDiscardAi() {
    mbAiPreviewData = [];
    mbAiPreviewIsMixed = false;
    document.getElementById('mbAiPreviewWrap').style.display = 'none';
    document.getElementById('mbAiPreviewList').innerHTML = '';
}

async function mbSaveAiMcqs() {
    if (!mbAiPreviewData.length) return;
    const finalQs = mbAiPreviewData.map((q, idx) => {
        const options = (q.options || []).map((_, oi) => document.getElementById(`mbAiOpt_${idx}_${oi}`)?.value.trim() || '');
        return {
            question: document.getElementById(`mbAiQ_${idx}`)?.value.trim() || q.question,
            options,
            answer_index: parseInt(document.getElementById(`mbAiAns_${idx}`)?.value) || 0,
            explanation: q.explanation || '',
            _mbType: q._mbType || mbMcq.currentType
        };
    });

    if (mbAiPreviewIsMixed) {
        // Group by type and save each group into its own book_page_mcqs row (pdf_id+page+type),
        // without disturbing the in-memory list for types the admin isn't currently viewing.
        const byType = { standard: [], true_false: [], hard: [] };
        finalQs.forEach(q => { const { _mbType, ...clean } = q; (byType[_mbType] || byType.standard).push(clean); });
        const originalType = mbMcq.currentType;
        let totalSaved = 0;
        for (const t of Object.keys(byType)) {
            if (!byType[t].length) continue;
            if (t === originalType) {
                mbMcq.pageQuestions = mbMcq.pageQuestions.concat(byType[t]);
                await mbSavePageQuestionsToDb();
            } else {
                // Fetch this type's existing questions for the same page, append, save, without
                // touching mbMcq.currentType/pageQuestions (which belong to the type being viewed).
                let existing = [];
                try {
                    const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_page_mcqs?pdf_id=eq.${mbMcq.pdfId}&page_number=eq.${mbMcq.currentPage}&mcq_type=eq.${t}&select=questions_json`);
                    if (rows?.length) existing = JSON.parse(rows[0].questions_json) || [];
                } catch (_) {}
                const merged = existing.concat(byType[t]);
                await fetch(`${SUPABASE_URL}/rest/v1/book_page_mcqs`, {
                    method: 'POST',
                    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({ pdf_id: mbMcq.pdfId, page_number: mbMcq.currentPage, mcq_type: t, questions_json: JSON.stringify(merged) })
                });
            }
            totalSaved += byType[t].length;
        }
        mbToast('✓ ' + totalSaved + ' টি প্রশ্ন সংরক্ষিত হয়েছে (Mixed: Standard/সত্য-মিথ্যা/Hard)');
    } else {
        mbMcq.pageQuestions = mbMcq.pageQuestions.concat(finalQs.map(({ _mbType, ...clean }) => clean));
        await mbSavePageQuestionsToDb();
        mbToast('✓ ' + finalQs.length + ' টি প্রশ্ন সংরক্ষিত হয়েছে');
    }

    mbDiscardAi();
    mbRenderManualList();
    mbUpdatePageCountLabel();
    if (mbMcq.gridOpen) mbLoadPageGrid();
}

/* ══════════════════════════════════════════════════════════
   AtlasPro-style CASCADE SELECT — PDF & MCQ Management  v2
   All IDs use mb2 prefix. No existing function is modified.
   These are purely additive — appended to preserve existing code.
══════════════════════════════════════════════════════════ */

/* ── state ── */
let mb2State = { subjectId: null, chapterId: null, pdfFile: null, uploadMode: 'file' };

/* ═══ Subjects ═══ */
async function mb2LoadSubjects() {
    const sel = document.getElementById('mb2SelSubject');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- বিষয় বেছে নিন --</option>';
    try {
        const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_subjects?select=id,name,icon&order=sort_order.asc,created_at.asc`);
        (rows || []).forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = (s.icon || '') + ' ' + s.name;
            sel.appendChild(o);
        });
        if (prev) sel.value = prev;
    } catch { mbToast('বিষয় লোড ব্যর্থ'); }
}

function mb2ToggleNewSubject() {
    const box = document.getElementById('mb2NewSubjectBox');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') document.getElementById('mb2NewSubjectName')?.focus();
}

async function mb2CreateSubject() {
    const name = (document.getElementById('mb2NewSubjectName')?.value || '').trim();
    const icon = (document.getElementById('mb2NewSubjectIcon')?.value || '').trim() || '📚';
    if (!name) return mbToast('বিষয়ের নাম লিখুন');
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/book_subjects`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ name, icon, description: '', color_idx: 0 })
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        mbToast('✓ বিষয় যোগ হয়েছে');
        document.getElementById('mb2NewSubjectName').value = '';
        document.getElementById('mb2NewSubjectIcon').value = '';
        document.getElementById('mb2NewSubjectBox').style.display = 'none';
        await mb2LoadSubjects();
        const id = (Array.isArray(created) ? created[0] : created)?.id;
        if (id) { document.getElementById('mb2SelSubject').value = String(id); mb2State.subjectId = String(id); await mb2OnSubjectChange(); }
        if (typeof loadMulboiSubjects === 'function') loadMulboiSubjects();
    } catch (e) { mbToast('সমস্যা: ' + e.message.slice(0, 80)); }
}

/* ═══ Chapters ═══ */
async function mb2OnSubjectChange() {
    const sid = document.getElementById('mb2SelSubject').value;
    mb2State.subjectId = sid || null;
    mb2State.chapterId = null;
    const chSel = document.getElementById('mb2SelChapter');
    chSel.innerHTML = '<option value="">-- অধ্যায় বেছে নিন --</option>';
    chSel.disabled = true;
    const btn = document.getElementById('mb2NewChapterBtn');
    if (btn) btn.style.display = 'none';
    mb2Hide();
    if (!sid) return;
    try {
        const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/book_chapters?subject_id=eq.${sid}&select=id,name&order=sort_order.asc,created_at.asc`);
        (rows || []).forEach(ch => {
            const o = document.createElement('option');
            o.value = ch.id; o.textContent = ch.name;
            chSel.appendChild(o);
        });
        chSel.disabled = false;
        if (btn) btn.style.display = 'inline-block';
    } catch { mbToast('অধ্যায় লোড ব্যর্থ'); }
}

function mb2OnChapterChange() {
    const cid = document.getElementById('mb2SelChapter').value;
    mb2State.chapterId = cid || null;
    if (!cid) { mb2Hide(); return; }
    mb2Show();
    mb2LoadChapterPdfs();
}

function mb2Hide() {
    const uf = document.getElementById('mb2UploadForm');
    const lc = document.getElementById('mb2PdfListCard');
    if (uf) uf.style.display = 'none';
    if (lc) lc.style.display = 'none';
}
function mb2Show() {
    const uf = document.getElementById('mb2UploadForm');
    const lc = document.getElementById('mb2PdfListCard');
    if (uf) uf.style.display = 'block';
    if (lc) lc.style.display = 'block';
}

function mb2ToggleNewChapter() {
    const box = document.getElementById('mb2NewChapterBox');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') document.getElementById('mb2NewChapterName')?.focus();
}

async function mb2CreateChapter() {
    if (!mb2State.subjectId) return mbToast('আগে বিষয় নির্বাচন করুন');
    const name = (document.getElementById('mb2NewChapterName')?.value || '').trim();
    if (!name) return mbToast('অধ্যায়ের নাম লিখুন');
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/book_chapters`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ subject_id: parseInt(mb2State.subjectId), name })
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        mbToast('✓ অধ্যায় যোগ হয়েছে');
        document.getElementById('mb2NewChapterName').value = '';
        document.getElementById('mb2NewChapterBox').style.display = 'none';
        const savedSub = mb2State.subjectId;
        await mb2OnSubjectChange();
        document.getElementById('mb2SelSubject').value = savedSub;
        const id = (Array.isArray(created) ? created[0] : created)?.id;
        if (id) {
            document.getElementById('mb2SelChapter').value = String(id);
            mb2State.chapterId = String(id);
            mb2Show(); mb2LoadChapterPdfs();
        }
    } catch (e) { mbToast('ত্রুটি: ' + e.message.slice(0, 80)); }
}

/* ═══ Drop-zone ═══ */
function mb2DzOver(e) {
    e.preventDefault();
    const dz = document.getElementById('mb2DropZone');
    if (dz) { dz.style.borderColor = 'var(--green)'; dz.style.background = 'rgba(16,185,129,.07)'; }
}
function mb2DzLeave() {
    const dz = document.getElementById('mb2DropZone');
    if (dz) { dz.style.borderColor = 'var(--border)'; dz.style.background = 'var(--hover)'; }
}
function mb2DzDrop(e) {
    e.preventDefault(); mb2DzLeave();
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') mb2SetFile(f);
    else mbToast('শুধু PDF ফাইল গ্রহণযোগ্য');
}
function mb2OnFileSelect(e) { if (e.target.files[0]) mb2SetFile(e.target.files[0]); }
function mb2SetFile(f) {
    mb2State.pdfFile = f;
    const fc = document.getElementById('mb2FileChosen');
    if (fc) { fc.textContent = '✓ ' + f.name; fc.style.display = 'block'; }
    const titleEl = document.getElementById('mb2PdfTitle');
    if (titleEl && !titleEl.value) titleEl.value = f.name.replace(/\.pdf$/i, '');
}

/* ═══ Mode toggle (file / url) ═══ */
function mb2SetMode(mode) {
    mb2State.uploadMode = mode;
    const urlBox = document.getElementById('mb2UrlBox');
    const dz    = document.getElementById('mb2DropZone');
    const fc    = document.getElementById('mb2FileChosen');
    const tFile = document.getElementById('mb2TabFile');
    const tUrl  = document.getElementById('mb2TabUrl');
    if (urlBox) urlBox.style.display = mode === 'url' ? 'block' : 'none';
    if (dz) dz.style.display = mode === 'file' ? 'block' : 'none';
    if (fc) fc.style.display = (mode === 'file' && mb2State.pdfFile) ? 'block' : 'none';
    if (tFile) tFile.className = 'btn btn-sm' + (mode === 'file' ? '' : ' btn-outline');
    if (tUrl)  tUrl.className  = 'btn btn-sm' + (mode === 'url'  ? '' : ' btn-outline');
}

/* ═══ Upload PDF ═══ */
async function mb2UploadPdf() {
    if (!mb2State.chapterId) return mbToast('অধ্যায় নির্বাচন করুন');
    const title = (document.getElementById('mb2PdfTitle')?.value || '').trim();
    if (!title) return mbToast('PDF শিরোনাম দিন');
    const isPremium = document.getElementById('mb2PdfPremium')?.checked || false;
    const btn       = document.getElementById('mb2UploadBtn');
    const progEl    = document.getElementById('mb2UploadProgress');
    const barEl     = document.getElementById('mb2UploadBar');
    const labelEl   = document.getElementById('mb2UploadLabel');
    const errEl     = document.getElementById('mb2UploadError');

    if (btn) { btn.disabled = true; btn.textContent = '⏳ সংরক্ষণ হচ্ছে...'; }
    if (progEl) progEl.style.display = 'block';
    if (errEl) errEl.style.display = 'none';

    let publicUrl = null, pageCount = null;

    try {
        if (mb2State.uploadMode === 'url') {
            publicUrl = (document.getElementById('mb2PdfUrl')?.value || '').trim();
            if (!publicUrl) throw new Error('PDF URL দিন');
            if (barEl) barEl.style.width = '100%';
        } else {
            const f = mb2State.pdfFile;
            if (!f) throw new Error('PDF ফাইল নির্বাচন করুন');
            if (f.size > 500 * 1024 * 1024) throw new Error('ফাইল ৫০০ MB এর বেশি হতে পারবে না');

            if (typeof detectMbPageCount === 'function') {
                if (labelEl) labelEl.textContent = 'পেইজ সংখ্যা শনাক্ত হচ্ছে...';
                pageCount = await detectMbPageCount(f);
            }

            if (labelEl) labelEl.textContent = 'আপলোড হচ্ছে...';
            const safeName    = Date.now() + '_' + f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const storagePath = 'chapter_' + mb2State.chapterId + '/' + safeName;

            publicUrl = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/pdfs/${storagePath}`);
                xhr.setRequestHeader('apikey', SUPABASE_KEY);
                xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
                xhr.setRequestHeader('Content-Type', 'application/pdf');
                xhr.upload.onprogress = ev => {
                    if (ev.lengthComputable && barEl) {
                        const pct = Math.round(ev.loaded / ev.total * 100);
                        barEl.style.width = pct + '%';
                        if (labelEl) labelEl.textContent = pct + '% আপলোড হয়েছে';
                    }
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(`${SUPABASE_URL}/storage/v1/object/public/pdfs/${storagePath}`);
                    } else {
                        let msg = xhr.responseText || '';
                        try { const j = JSON.parse(msg); msg = j.message || j.error || msg; } catch (_) {}
                        if (xhr.status === 400 || xhr.status === 403 || xhr.status === 404) {
                            reject(new Error('STORAGE_BUCKET_MISSING:' + msg));
                        } else {
                            reject(new Error('Storage ' + xhr.status + ': ' + msg.slice(0, 120)));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('নেটওয়ার্ক ত্রুটি'));
                xhr.send(f);
            });
        }

        /* DB insert */
        const ins = await fetch(`${SUPABASE_URL}/rest/v1/book_pdfs`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ chapter_id: parseInt(mb2State.chapterId), title, file_url: publicUrl, page_count: pageCount || null, is_premium: isPremium })
        });
        if (!ins.ok) {
            const t = await ins.text().catch(() => '');
            throw new Error('ডেটা সংরক্ষণ ব্যর্থ (' + ins.status + '): ' + t.slice(0, 80));
        }

        if (barEl) barEl.style.width = '100%';
        mbToast('✅ PDF সংরক্ষণ সম্পন্ন');

        /* reset form */
        mb2State.pdfFile = null;
        ['mb2PdfTitle','mb2PdfUrl'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['mb2FileChosen','mb2UploadProgress'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        const fi = document.getElementById('mb2PdfFileInput'); if (fi) fi.value = '';
        const pp = document.getElementById('mb2PdfPremium'); if (pp) pp.checked = false;

        mb2LoadChapterPdfs();
        if (typeof mbLoadAllPdfs === 'function') mbLoadAllPdfs();

    } catch (e) {
        const isBucketMissing = e.message.startsWith('STORAGE_BUCKET_MISSING');
        const display = isBucketMissing
            ? '⚠️ Supabase Storage bucket "pdfs" নেই।\n\nসমাধান:\n1. Supabase Dashboard → Storage → New Bucket\n2. Name: pdfs | Public: ON\n3. আবার চেষ্টা করুন — অথবা 🔗 URL মোড ব্যবহার করুন।'
            : '❌ ' + e.message;
        if (errEl) {
            errEl.style.display = 'block';
            errEl.style.whiteSpace = 'pre-line';
            errEl.textContent = display;
        } else {
            mbToast(isBucketMissing ? '⚠️ Storage bucket নেই — URL মোড ব্যবহার করুন' : e.message);
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💾 সংরক্ষণ করো'; }
        setTimeout(() => { if (progEl && progEl.style.display !== 'none') progEl.style.display = 'none'; }, 2000);
    }
}

/* ═══ Chapter PDF list ═══ */
async function mb2LoadChapterPdfs() {
    if (!mb2State.chapterId) return;
    const listEl = document.getElementById('mb2ChapterPdfList');
    if (!listEl) return;
    const ctxEl = document.getElementById('mb2PdfListContext');

    /* context label */
    if (ctxEl) {
        const subSel = document.getElementById('mb2SelSubject');
        const chSel  = document.getElementById('mb2SelChapter');
        const subTxt = subSel?.options[subSel.selectedIndex]?.text || '';
        const chTxt  = chSel?.options[chSel.selectedIndex]?.text  || '';
        ctxEl.textContent = subTxt && chTxt ? subTxt + ' › ' + chTxt : '';
    }

    listEl.innerHTML = '<p style="text-align:center;padding:14px;font-size:12px;color:var(--text2);">লোড হচ্ছে...</p>';
    try {
        const pdfs = await safeFetch(`${SUPABASE_URL}/rest/v1/book_pdfs?chapter_id=eq.${mb2State.chapterId}&select=*&order=sort_order.asc,created_at.asc`);
        if (!pdfs?.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;"><div style="font-size:28px;margin-bottom:8px;">📄</div><div style="font-size:12px;color:var(--text2);">কোনো PDF নেই — উপরে যোগ করুন</div></div>';
            return;
        }
        listEl.innerHTML = pdfs.map(p => {
            const st = escMb(p.title).replace(/'/g, "\\'");
            const su = (p.file_url || '').replace(/'/g, "\\'");
            return `<div class="pdf-card">
                <div class="pdf-card-top">
                    <div class="pdf-card-icon">📕</div>
                    <div class="pdf-card-info">
                        <div class="pdf-card-title">${escMb(p.title)}</div>
                        <div class="pdf-card-meta">
                            ${p.page_count ? p.page_count + ' পৃষ্ঠা · ' : ''}${p.is_premium ? '⭐ Premium' : '🆓 Free'}
                        </div>
                    </div>
                    <div class="pdf-card-actions">
                        <button class="act-btn act-edit" onclick="openMbMcqPanel('${p.id}','${st}',${p.page_count||0},'${su}')" title="MCQ ব্যবস্থাপনা">❓</button>
                        <button class="act-btn" onclick="mb2TogglePremium('${p.id}',${!p.is_premium})" title="${p.is_premium ? 'ফ্রি করুন' : 'প্রিমিয়াম করুন'}">${p.is_premium ? '⭐' : '🆓'}</button>
                        <button class="act-btn act-delete" onclick="mb2DeletePdf('${p.id}','${st}')" title="মুছে ফেলুন">🗑️</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch {
        listEl.innerHTML = '<p style="color:var(--red);text-align:center;padding:12px;font-size:12px;">লোড এরর</p>';
    }
}

async function mb2TogglePremium(id, val) {
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/book_pdfs?id=eq.${id}`, {
            method: 'PATCH',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ is_premium: val })
        });
        if (!r.ok) throw new Error();
        mbToast(val ? '⭐ Premium করা হয়েছে' : '🆓 Free করা হয়েছে');
        mb2LoadChapterPdfs();
        if (typeof mbLoadAllPdfs === 'function') mbLoadAllPdfs();
    } catch { mbToast('পরিবর্তন ব্যর্থ'); }
}

async function mb2DeletePdf(id, title) {
    if (!confirm('"' + title + '" মুছবে?\nএর সব MCQ ডেটাও মুছে যাবে।')) return;
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/book_pdfs?id=eq.${id}`, {
            method: 'DELETE',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
        });
        if (!r.ok) throw new Error();
        mbToast('🗑️ PDF মুছে গেছে');
        mb2LoadChapterPdfs();
        if (typeof mbLoadAllPdfs === 'function') mbLoadAllPdfs();
    } catch { mbToast('মুছতে ব্যর্থ'); }
}

/* ═══ Management section toggle ═══ */
function mb2ToggleMgmt() {
    const body    = document.getElementById('mb2MgmtBody');
    const chevron = document.getElementById('mb2MgmtChevron');
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (chevron) chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
    if (!open && typeof loadMulboiSubjects === 'function') loadMulboiSubjects();
}

/* ═══ Auto-init: wrap loadMulboiSubjects to also call mb2LoadSubjects ═══ */
(function mb2PatchLoader() {
    const orig = window.loadMulboiSubjects;
    if (typeof orig !== 'function') { setTimeout(mb2PatchLoader, 200); return; }
    window.loadMulboiSubjects = async function () {
        const r = orig.apply(this, arguments);
        mb2LoadSubjects();
        return r;
    };
})();

