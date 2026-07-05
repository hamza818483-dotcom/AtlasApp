/* admin-quick-practice.js — Quick Practice Admin CRUD
   Loaded by admin.html via <script src="admin-quick-practice.js">
   Uses: SUPABASE_URL, SUPABASE_KEY, safeFetch, showToast, parseCSV (from admin.html)

   Structure: Subject -> Chapter (name-only save) -> CSV MCQ upload (additive,
   re-upload adds more without deleting existing) -> saved MCQ list w/ delete.
*/

let qpExpandedSubj = null;
let qpExpandedChap = null;
let qpSubjectsCache = [];
let qpChapCSVData = {};   // chapterId -> parsed CSV rows waiting to be saved

function qpEsc(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function qpEscHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ══════════════════════════════════════
// SUBJECTS
// ══════════════════════════════════════
async function loadQpSubjects() {
    const list = document.getElementById('qpSubjList');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>';
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?order=sort_order.asc&select=id,name`) || [];
    qpSubjectsCache = data;
    const cnt = document.getElementById('qpSubjCount');
    if (cnt) cnt.textContent = `(${data.length}টি)`;
    if (!data.length) { list.innerHTML = '<div style="color:var(--text2);font-size:12px">কোনো বিষয় নেই। উপরে যোগ করুন।</div>'; return; }
    qpRenderSubjList(data);
}

function qpRenderSubjList(data) {
    const list = document.getElementById('qpSubjList');
    list.innerHTML = data.map(s => {
        const isOpen = qpExpandedSubj === s.id;
        return `
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;overflow:hidden">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer" onclick="qpToggleSubj(${s.id})">
                <span style="font-size:11px;color:var(--accent);transition:transform .2s;display:inline-block;transform:rotate(${isOpen?90:0}deg)">▶</span>
                <div style="flex:1"><div style="font-weight:700;font-size:13px">📘 ${qpEscHtml(s.name)}</div></div>
                <button class="btn btn-sm" onclick="qpEditSubjPrompt(${s.id},'${qpEsc(s.name)}');event.stopPropagation()" style="padding:3px 8px;font-size:10px">✏️</button>
                <button class="btn btn-sm" onclick="qpDelSubject(${s.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
            </div>
            <div id="qpChapDrop_${s.id}" style="display:${isOpen?'block':'none'};padding:10px 12px;background:var(--bg);border-top:1px solid var(--border)">
                ${isOpen ? '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>' : ''}
            </div>
        </div>`;
    }).join('');
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}

async function qpToggleSubj(id) {
    qpExpandedSubj = (qpExpandedSubj === id) ? null : id;
    qpExpandedChap = null;
    qpRenderSubjList(qpSubjectsCache);
}

async function qpSaveSubject() {
    const nameEl = document.getElementById('qpSubjectName');
    const name = nameEl.value.trim();
    if (!name) { showToast('⚠️ বিষয়ের নাম দিন'); return; }
    try {
        const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?order=sort_order.desc&select=sort_order&limit=1`) || [];
        const sort = existing.length ? existing[0].sort_order + 1 : 1;
        await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects`, { method: 'POST', body: JSON.stringify({ name, sort_order: sort }) });
        nameEl.value = '';
        showToast('✅ বিষয় যোগ হয়েছে');
        loadQpSubjects();
    } catch (e) { showToast('❌ Error: ' + e.message); }
}

async function qpEditSubjPrompt(id, name) {
    const newName = prompt('বিষয়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ name: newName.trim() }) });
    showToast('✅ আপডেট হয়েছে'); loadQpSubjects();
}

async function qpDelSubject(id) {
    if (!confirm('এই বিষয় এবং সব অধ্যায়+MCQ মুছে যাবে। নিশ্চিত?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?subject_id=eq.${id}`, { method: 'DELETE' });
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${id}`, { method: 'DELETE' });
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?id=eq.${id}`, { method: 'DELETE' });
    showToast('🗑 বিষয় মুছে গেছে');
    if (qpExpandedSubj === id) { qpExpandedSubj = null; qpExpandedChap = null; }
    loadQpSubjects();
}

// ══════════════════════════════════════
// CHAPTERS  (Subject-এর ভেতরে inline; name-only save প্রথমে)
// ══════════════════════════════════════
async function qpLoadChapters(subjId) {
    const drop = document.getElementById(`qpChapDrop_${subjId}`);
    if (!drop) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${subjId}&order=sort_order.asc&select=id,name`) || [];

    // প্রতিটা chapter-এর MCQ count আলাদাভাবে আনা হচ্ছে (ছোট, তাই cost কম)
    const counts = {};
    for (const ch of data) {
        const c = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?chapter_id=eq.${ch.id}&select=id`) || [];
        counts[ch.id] = c.length;
    }

    drop.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:10px">
            <input type="text" id="qpNewChapName_${subjId}" placeholder="+ নতুন অধ্যায়ের নাম" style="flex:1;padding:9px 12px;font-size:12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--card-bg);color:var(--text)">
            <button class="btn btn-sm btn-primary" onclick="qpAddChapter(${subjId})" style="padding:8px 14px;font-size:12px;white-space:nowrap">+ যোগ</button>
        </div>
        <div id="qpChapList_${subjId}">
            ${data.length ? data.map(ch => qpRenderChapterRow(ch, counts[ch.id] || 0)).join('') : '<div style="color:var(--text2);font-size:12px;padding:8px 0">কোনো অধ্যায় নেই।</div>'}
        </div>
    `;
}

function qpRenderChapterRow(ch, mcqCount) {
    const isOpen = qpExpandedChap === ch.id;
    return `
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer" onclick="qpToggleChap(${ch.id})">
            <span style="font-size:11px;color:var(--accent);transition:transform .2s;display:inline-block;transform:rotate(${isOpen?90:0}deg)">▶</span>
            <div style="flex:1;font-size:12.5px;font-weight:600">📄 ${qpEscHtml(ch.name)} <span style="color:var(--text2);font-weight:400;font-size:10.5px">(${mcqCount}টি MCQ)</span></div>
            <button class="btn btn-sm" onclick="qpEditChapPrompt(${ch.id},'${qpEsc(ch.name)}');event.stopPropagation()" style="padding:3px 8px;font-size:10px">✏️</button>
            <button class="btn btn-sm" onclick="qpDelChapter(${ch.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>
        <div id="qpMcqDrop_${ch.id}" style="display:${isOpen?'block':'none'};padding:10px;background:var(--bg);border-top:1px solid var(--border)">
            ${isOpen ? qpRenderMcqManager(ch.id) : ''}
        </div>
    </div>`;
}

async function qpToggleChap(id) {
    qpExpandedChap = (qpExpandedChap === id) ? null : id;
    qpRenderSubjList(qpSubjectsCache);
    if (qpExpandedChap) await qpRefreshMcqList(qpExpandedChap);
}

async function qpAddChapter(subjId) {
    const inp = document.getElementById(`qpNewChapName_${subjId}`);
    const name = inp.value.trim();
    if (!name) { showToast('⚠️ অধ্যায়ের নাম দিন'); return; }
    const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${subjId}&order=sort_order.desc&select=sort_order&limit=1`) || [];
    const sort = existing.length ? existing[0].sort_order + 1 : 1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters`, { method: 'POST', body: JSON.stringify({ subject_id: subjId, name, sort_order: sort }) });
    showToast('✅ অধ্যায় যোগ হয়েছে (এখন CSV আপলোড করে MCQ যোগ করুন)');
    qpLoadChapters(subjId);
}

async function qpEditChapPrompt(id, name) {
    const newName = prompt('অধ্যায়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ name: newName.trim() }) });
    showToast('✅ আপডেট হয়েছে');
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}

async function qpDelChapter(id) {
    if (!confirm('এই অধ্যায় এবং এর সব MCQ মুছে যাবে। নিশ্চিত?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?chapter_id=eq.${id}`, { method: 'DELETE' });
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${id}`, { method: 'DELETE' });
    showToast('🗑 অধ্যায় মুছে গেছে');
    if (qpExpandedChap === id) qpExpandedChap = null;
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}

// ══════════════════════════════════════
// MCQ MANAGER  (CSV upload -> preview -> save; additive; saved list + delete)
// ══════════════════════════════════════
function qpRenderMcqManager(chapId) {
    return `
        <div class="csv-upload" onclick="document.getElementById('qpCsvInput_${chapId}').click()">
            <p>📄 CSV আপলোড করুন</p>
            <input type="file" accept=".csv" id="qpCsvInput_${chapId}" onchange="qpHandleCSV(${chapId}, this)">
            <p id="qpCsvLabel_${chapId}" style="color:var(--accent);font-size:11px;margin-top:4px;"></p>
        </div>
        <button class="btn btn-primary" onclick="qpSaveCSV(${chapId})" style="width:100%;padding:8px 12px;font-size:12px;margin-bottom:12px" id="qpSaveBtn_${chapId}" disabled>💾 CSV সেইভ করুন</button>
        <div style="font-weight:700;font-size:11.5px;margin:8px 0 6px;color:var(--text2)">📋 সেইভ করা MCQ তালিকা</div>
        <div id="qpMcqListInner_${chapId}"><div style="color:var(--text2);font-size:11px">লোড হচ্ছে...</div></div>
    `;
}

function qpHandleCSV(chapId, input) {
    const file = input.files[0]; if (!file) return;
    document.getElementById(`qpCsvLabel_${chapId}`).textContent = '📄 ' + file.name;
    const reader = new FileReader();
    reader.onload = e => {
        let text = e.target.result.replace(/\t/g, ',');
        const lines = parseCSV(text);
        if (lines.length < 2) { showToast('⚠️ CSV-এ ডাটা নেই'); return; }
        const cleanHeader = lines[0].map(h => h.replace(/^\uFEFF/, '').trim().toLowerCase());
        const idx = (names) => { for (const n of names) { const i = cleanHeader.indexOf(n); if (i >= 0) return i; } return -1; };
        const qIdx = idx(['question', 'questions']);
        const o1 = idx(['option1', 'option 1']); const o2 = idx(['option2', 'option 2']);
        const o3 = idx(['option3', 'option 3']); const o4 = idx(['option4', 'option 4']);
        const o5 = idx(['option5', 'option 5']); const aIdx = idx(['answer', 'answers']);
        const eIdx = idx(['explanation', 'explanations']);
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i];
            if (cols.length < 6) continue;
            data.push({
                question: cols[qIdx] || '', option1: cols[o1] || '', option2: cols[o2] || '',
                option3: cols[o3] || '', option4: cols[o4] || '',
                option5: o5 >= 0 ? (cols[o5] || null) : null,
                answer: parseInt(cols[aIdx]) || 1,
                explanation: eIdx >= 0 ? (cols[eIdx] || '') : ''
            });
        }
        qpChapCSVData[chapId] = data;
        document.getElementById(`qpSaveBtn_${chapId}`).disabled = false;
        showToast(`✅ ${data.length} প্রশ্ন লোড হয়েছে — এখন সেইভ করুন`);
    };
    reader.readAsText(file);
}

async function qpSaveCSV(chapId) {
    const data = qpChapCSVData[chapId];
    if (!data || !data.length) { showToast('⚠️ আগে CSV আপলোড করুন'); return; }
    // parent subject_id বের করা হচ্ছে cache থেকে
    let subjId = null;
    for (const s of qpSubjectsCache) {
        const chaps = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${chapId}&select=subject_id`) || [];
        if (chaps.length) { subjId = chaps[0].subject_id; break; }
    }
    if (!subjId) { showToast('❌ Subject খুঁজে পাওয়া যায়নি'); return; }
    const rows = data.map(d => ({ subject_id: subjId, chapter_id: chapId, ...d }));
    try {
        await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs`, { method: 'POST', body: JSON.stringify(rows) });
        showToast(`✅ ${rows.length}টি MCQ যোগ হয়েছে (আগেরগুলোর সাথে)`);
        delete qpChapCSVData[chapId];
        document.getElementById(`qpSaveBtn_${chapId}`).disabled = true;
        document.getElementById(`qpCsvLabel_${chapId}`).textContent = '';
        qpRefreshMcqList(chapId);
        if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj); // count আপডেট
    } catch (e) { showToast('❌ Error: ' + e.message); }
}

async function qpRefreshMcqList(chapId) {
    const wrap = document.getElementById(`qpMcqListInner_${chapId}`);
    if (!wrap) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?chapter_id=eq.${chapId}&order=created_at.desc&select=id,question`) || [];
    if (!data.length) { wrap.innerHTML = '<div style="color:var(--text2);font-size:11px">এখনো কোনো MCQ সেইভ হয়নি।</div>'; return; }
    wrap.innerHTML = data.map(m => `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11.5px">
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${qpEscHtml(m.question)}</div>
            <button class="btn btn-sm" onclick="qpDelMcq(${m.id},${chapId})" style="padding:2px 6px;font-size:9.5px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>
    `).join('');
}

async function qpDelMcq(id, chapId) {
    if (!confirm('এই MCQ মুছে ফেলবেন?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?id=eq.${id}`, { method: 'DELETE' });
    showToast('🗑 মুছে গেছে');
    qpRefreshMcqList(chapId);
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}
