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
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
                <span style="font-size:20px;">📕</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escMb(p.title)}</div>
                    <div style="font-size:9.5px;color:var(--text2);">${subjectName ? '📚 '+escMb(subjectName) : ''}${chapterName ? ' › 📖 '+escMb(chapterName) : ''}${p.page_count ? ' · '+p.page_count+' পেইজ' : ''}</div>
                </div>
                <button class="btn btn-sm" style="font-size:9px;padding:4px 7px;background:rgba(124,131,255,0.12);color:var(--accent);border:1px solid var(--accent);" onclick="openMbMcqPanel('${p.id}','${escMb(p.title).replace(/'/g,"\\'")}',${p.page_count||0},'${(p.file_url||'').replace(/'/g,"\\'")}')">❓ MCQ</button>
                <button class="btn btn-sm btn-danger" style="font-size:9px;padding:4px 7px;" onclick="mbDeletePdfFromFlatList('${p.id}')">🗑️</button>
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
    csvRows: []
};

function mbToast(msg) {
    if (typeof showToast === 'function') { showToast(msg); return; }
    console.log(msg);
}

/* ---------- OPEN / CLOSE PANEL ---------- */
function openMbMcqPanel(pdfId, pdfTitle, pageCount, fileUrl) {
    mbMcq.pdfId = pdfId;
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

    let overlay = document.getElementById('mbMcqOverlay');
    if (!overlay) { mbBuildMcqPanelDom(); overlay = document.getElementById('mbMcqOverlay'); }
    document.getElementById('mbMcqTitle').textContent = '❓ ' + pdfTitle + ' — MCQ ব্যবস্থাপনা';
    document.getElementById('mbMcqPageInput').value = 1;
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
    <div class="modal-overlay" id="mbMcqOverlay" style="z-index:600;align-items:flex-start;">
        <div class="modal-box" style="max-width:680px;margin:14px auto;max-height:94vh;">
            <button class="modal-close" onclick="closeMbMcqPanel()">✕</button>
            <h3 id="mbMcqTitle" style="font-size:13px;text-align:left;">❓ MCQ ব্যবস্থাপনা</h3>

            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
                <span style="font-size:11px;color:var(--text2);">পেইজ:</span>
                <button class="btn btn-sm btn-outline" onclick="mbPageStep(-1)" style="padding:4px 10px;">‹</button>
                <input type="number" id="mbMcqPageInput" value="1" min="1" onchange="mbOnPageChange()" style="width:60px;text-align:center;padding:5px;">
                <button class="btn btn-sm btn-outline" onclick="mbPageStep(1)" style="padding:4px 10px;">›</button>
                <span id="mbMcqPageCount" style="font-size:10.5px;color:var(--text2);margin-left:auto;">০ MCQ (standard)</span>
            </div>

            <div id="mbMcqPagePreviewWrap" style="text-align:center;margin-bottom:10px;background:var(--hover);border-radius:8px;padding:6px;min-height:60px;position:relative;">
                <canvas id="mbMcqPreviewCanvas" style="max-width:100%;border-radius:6px;"></canvas>
                <div id="mbMcqPreviewLoading" style="font-size:11px;color:var(--text2);padding:14px;">পেইজ লোড হচ্ছে...</div>
            </div>

            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <button class="btn btn-sm" id="mbTypeBtn_standard" onclick="mbSwitchType('standard')" style="flex:1;">📚 Standard</button>
                <button class="btn btn-sm btn-outline" id="mbTypeBtn_true_false" onclick="mbSwitchType('true_false')" style="flex:1;">✅ সত্য/মিথ্যা</button>
                <button class="btn btn-sm btn-outline" id="mbTypeBtn_hard" onclick="mbSwitchType('hard')" style="flex:1;">🔥 Hard</button>
            </div>

            <div style="display:flex;gap:6px;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px;">
                <button class="btn btn-sm" id="mbTabBtn_manual" onclick="mbSwitchTab('manual')" style="flex:1;">📝 ম্যানুয়াল</button>
                <button class="btn btn-sm btn-outline" id="mbTabBtn_csv" onclick="mbSwitchTab('csv')" style="flex:1;">📊 CSV</button>
                <button class="btn btn-sm btn-outline" id="mbTabBtn_ai" onclick="mbSwitchTab('ai')" style="flex:1;">🤖 AI</button>
            </div>

            <!-- MANUAL TAB -->
            <div id="mbTabPanel_manual">
                <div style="background:var(--hover);border-radius:8px;padding:10px;margin-bottom:10px;">
                    <div style="font-size:11px;font-weight:700;margin-bottom:8px;" id="mbManualFormTitle">➕ নতুন প্রশ্ন যোগ</div>
                    <textarea id="mbMcqQuestion" placeholder="প্রশ্ন লিখুন..." rows="2" style="margin-bottom:8px;"></textarea>
                    <div id="mbMcqOptionsWrap" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
                    <textarea id="mbMcqExplanation" placeholder="ব্যাখ্যা (ঐচ্ছিক)" rows="2" style="margin-bottom:8px;"></textarea>
                    <label style="display:block;font-size:10.5px;font-weight:600;color:var(--text2);margin-bottom:4px;">ছবি (ঐচ্ছিক — ডায়াগ্রাম/চিত্র যুক্ত প্রশ্নের জন্য)</label>
                    <input type="file" id="mbMcqImage" accept="image/*" onchange="mbMcqImageSelect(event)" style="margin-bottom:6px;">
                    <div id="mbMcqImagePreviewWrap" style="display:none;margin-bottom:8px;position:relative;">
                        <img id="mbMcqImagePreview" style="max-width:100%;max-height:120px;border-radius:6px;display:block;">
                        <button type="button" onclick="mbRemoveMcqImage()" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;">✕</button>
                    </div>
                    <div id="mbMcqImageUploading" style="display:none;font-size:10.5px;color:var(--accent);margin-bottom:6px;">⏳ ছবি আপলোড হচ্ছে...</div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-sm btn-outline" id="mbMcqCancelBtn" style="display:none;flex:1;" onclick="mbCancelEdit()">বাতিল</button>
                        <button class="btn btn-sm btn-primary" id="mbMcqSaveBtn" style="flex:1;" onclick="mbSaveManualMcq()">✓ সংরক্ষণ করো</button>
                    </div>
                </div>
                <div id="mbManualMcqList"></div>
            </div>

            <!-- CSV TAB -->
            <div id="mbTabPanel_csv" style="display:none;">
                <div style="background:var(--hover);border-radius:8px;padding:10px;margin-bottom:10px;font-size:10.5px;color:var(--text2);line-height:1.6;">
                    <b style="color:var(--green);">ফরম্যাট:</b><br>
                    <code style="font-size:9.5px;">question,option1,option2,option3,option4,answer,explanation</code><br>
                    answer: 1/2/3/4 (যেটা সঠিক অপশনের নম্বর)
                </div>
                <input type="file" id="mbCsvFileInput" accept=".csv,text/csv" onchange="mbCsvFileSelect(event)" style="margin-bottom:8px;">
                <div id="mbCsvPreviewInfo" style="display:none;font-size:11px;color:var(--text2);margin-bottom:8px;"></div>
                <button class="btn btn-sm btn-primary" id="mbCsvImportBtn" style="display:none;width:100%;" onclick="mbImportCsv()">📥 আমদানি করো</button>
                <div id="mbCsvImportResult" style="display:none;margin-top:8px;padding:8px 10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:11.5px;color:var(--green);font-weight:600;"></div>
            </div>

            <!-- AI TAB -->
            <div id="mbTabPanel_ai" style="display:none;">
                <div style="background:var(--hover);border-radius:8px;padding:10px;margin-bottom:10px;font-size:10.5px;color:var(--text2);line-height:1.6;">
                    🤖 AI (Gemini) দিয়ে এই পেইজের ছবি থেকে স্বয়ংক্রিয় MCQ তৈরি হবে। বর্তমান নির্বাচিত পেইজ ও টাইপ ব্যবহার হবে।
                </div>
                <div style="margin-bottom:10px;">
                    <label style="display:block;font-size:10.5px;font-weight:600;color:var(--text2);margin-bottom:4px;">কাস্টম প্রম্পট (ঐচ্ছিক)</label>
                    <textarea id="mbAiPrompt" rows="3" placeholder="ফাঁকা রাখলে ডিফল্ট প্রম্পট ব্যবহার হবে"></textarea>
                    <div style="display:flex;gap:6px;margin-top:6px;">
                        <button class="btn btn-sm btn-outline" style="flex:1;" id="mbSavePromptBtn" onclick="mbSaveAiPrompt()">💾 প্রম্পট সেভ করো</button>
                        <button class="btn btn-sm btn-outline" style="flex:1;" id="mbLoadPromptBtn" onclick="mbLoadAiPrompt()">📂 সেভ করা প্রম্পট</button>
                    </div>
                    <div id="mbPromptSaveStatus" style="display:none;font-size:10px;margin-top:4px;color:var(--green);font-weight:600;"></div>
                </div>
                <button class="btn btn-sm" style="width:100%;background:rgba(251,191,36,0.12);color:#FBBF24;border:1px solid #FBBF24;" id="mbAiGenBtn" onclick="mbAiGenerate()">🤖 AI দিয়ে MCQ তৈরি করো</button>
                <div id="mbAiSpinner" style="display:none;text-align:center;padding:14px;font-size:11.5px;color:var(--accent);">⏳ AI প্রশ্ন তৈরি করছে...</div>
                <div id="mbAiPreviewWrap" style="display:none;margin-top:10px;">
                    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;" id="mbAiResultHeader"></div>
                    <div id="mbAiPreviewList"></div>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <button class="btn btn-sm btn-outline" style="flex:1;" onclick="mbDiscardAi()">✕ বাতিল</button>
                        <button class="btn btn-sm" style="flex:1;background:var(--green);color:#fff;" onclick="mbSaveAiMcqs()">✓ সব সংরক্ষণ করো</button>
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
        <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="mb-ans-badge" id="mbAnsBadge_${i}" onclick="mbSelectAnswer(${i})"
                style="width:28px;height:28px;border-radius:6px;border:1.5px solid var(--border);background:var(--card);font-size:11px;font-weight:700;flex-shrink:0;cursor:pointer;">${lbl[0]}</button>
            <input class="mb-opt-input" id="mbOpt_${i}" placeholder="${isTF ? lbl : 'বিকল্প ' + lbl}" value="${isTF ? lbl : ''}" ${isTF ? 'readonly' : ''} style="flex:1;">
        </div>`).join('');
    mbMcq._selectedAnswer = null;
}

function mbSelectAnswer(i) {
    mbMcq._selectedAnswer = i;
    const count = mbMcq.currentType === 'true_false' ? 2 : 4;
    for (let k = 0; k < count; k++) {
        const b = document.getElementById('mbAnsBadge_' + k);
        if (!b) continue;
        b.style.background = (k === i) ? 'var(--green)' : 'var(--card)';
        b.style.color = (k === i) ? '#fff' : 'var(--text)';
        b.style.borderColor = (k === i) ? 'var(--green)' : 'var(--border)';
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
}
function mbOnPageChange() {
    const v = parseInt(document.getElementById('mbMcqPageInput').value);
    mbMcq.currentPage = (isNaN(v) || v < 1) ? 1 : v;
    document.getElementById('mbMcqPageInput').value = mbMcq.currentPage;
    mbCancelEdit();
    mbLoadPagePreview();
    mbLoadPageQuestions();
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
        listEl.innerHTML = '<p style="font-size:11px;color:var(--text2);text-align:center;padding:10px;">এই পেইজে এখনো কোনো প্রশ্ন নেই</p>';
        return;
    }
    listEl.innerHTML = mbMcq.pageQuestions.map((q, i) => `
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px;">${i+1}. ${escMb(q.question)}</div>
            ${q.image_url ? `<img src="${q.image_url}" style="max-width:100%;max-height:100px;border-radius:6px;margin-bottom:8px;display:block;">` : ''}
            <div style="font-size:10.5px;color:var(--text2);margin-bottom:8px;">
                ${(q.options||[]).map((o,oi)=>`<div style="${oi===q.answer_index?'color:var(--green);font-weight:700;':''}">${oi===q.answer_index?'✅':'◽'} ${escMb(o)}</div>`).join('')}
            </div>
            <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-outline" style="flex:1;font-size:10px;padding:5px;" onclick="mbEditManualMcq(${i})">✏️ সম্পাদনা</button>
                <button class="btn btn-sm btn-danger" style="flex:1;font-size:10px;padding:5px;" onclick="mbDeleteManualMcq(${i})">🗑️ মুছো</button>
            </div>
        </div>`).join('');
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
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const rows = mbParseCsv(ev.target.result);
        if (!rows.length) { mbToast('❌ CSV ফাইলে কোনো ডেটা নেই'); return; }
        mbMcq.csvRows = rows;
        const info = document.getElementById('mbCsvPreviewInfo');
        info.style.display = 'block';
        info.textContent = 'মোট ' + rows.length + ' টি প্রশ্ন পাওয়া গেছে — বর্তমান পেইজ ' + mbMcq.currentPage + ', টাইপ "' + mbMcq.currentType + '"-এ যোগ হবে।';
        const btn = document.getElementById('mbCsvImportBtn');
        btn.style.display = 'block';
        btn.textContent = '📥 ' + rows.length + ' টি প্রশ্ন আমদানি করো';
    };
    reader.readAsText(file, 'UTF-8');
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

function mbMcqPrompt(type, customPrompt) {
    const typeInstructions = {
        standard: 'সাধারণ মানের ৩-৫টি বহুনির্বাচনী (৪টি অপশন) প্রশ্ন তৈরি করো।',
        true_false: '৩-৫টি সত্য/মিথ্যা ধরনের প্রশ্ন তৈরি করো (অপশন: "সত্য", "মিথ্যা" — ২টি অপশন)।',
        hard: 'বিশ্লেষণমূলক ও কঠিন মানের ৩-৫টি বহুনির্বাচনী (৪টি অপশন) প্রশ্ন তৈরি করো — সরাসরি তথ্য নয়, প্রয়োগ/বিশ্লেষণ ভিত্তিক।'
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

async function mbCallGoogleVision(model, imageData, type, customPrompt) {
    const key = model.key();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [
                { inline_data: { mime_type: imageData.mimeType, data: imageData.base64 } },
                { text: mbMcqPrompt(type, customPrompt) }
            ] }],
            generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
        })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}
async function mbCallGroqVision(model, imageData, type, customPrompt) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + model.key(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model.model,
            messages: [{ role: 'user', content: [
                { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
                { type: 'text', text: mbMcqPrompt(type, customPrompt) }
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
async function mbGenerateMCQsFromImage(imageData, type, customPrompt) {
    const group1 = [
        mbCallGoogleVision(MB_VISION_MODELS[0], imageData, type, customPrompt).catch(() => null),
        mbCallGoogleVision(MB_VISION_MODELS[1], imageData, type, customPrompt).catch(() => null)
    ];
    let result = await mbRaceForValidQuestions(group1);
    if (result?.length) return result;
    const group2 = [mbCallGroqVision(MB_VISION_MODELS[2], imageData, type, customPrompt).catch(() => null)];
    result = await mbRaceForValidQuestions(group2);
    return result || [];
}

let mbAiPreviewData = [];
async function mbAiGenerate() {
    const spin = document.getElementById('mbAiSpinner');
    const genBtn = document.getElementById('mbAiGenBtn');
    const resultWrap = document.getElementById('mbAiPreviewWrap');
    spin.style.display = 'block'; genBtn.disabled = true; resultWrap.style.display = 'none'; mbAiPreviewData = [];

    try {
        const imageData = await mbGetPageImageBase64();
        if (!imageData) throw new Error('পেইজের ছবি পাওয়া যায়নি');
        const customPrompt = document.getElementById('mbAiPrompt')?.value.trim() || '';
        const questions = await mbGenerateMCQsFromImage(imageData, mbMcq.currentType, customPrompt);
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

function mbRenderAiPreview(qs) {
    document.getElementById('mbAiResultHeader').textContent = 'AI তৈরি করেছে ' + qs.length + ' টি প্রশ্ন (সম্পাদনা করতে পারবেন)';
    document.getElementById('mbAiPreviewList').innerHTML = qs.map((q, idx) => `
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:6px;">
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
            explanation: q.explanation || ''
        };
    });
    mbMcq.pageQuestions = mbMcq.pageQuestions.concat(finalQs);
    await mbSavePageQuestionsToDb();
    mbToast('✓ ' + finalQs.length + ' টি প্রশ্ন সংরক্ষিত হয়েছে');
    mbDiscardAi();
    mbRenderManualList();
    mbUpdatePageCountLabel();
}
