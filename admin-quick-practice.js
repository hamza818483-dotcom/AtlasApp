/* admin-quick-practice.js — Quick Practice Admin CRUD
   One-step form (Subject + Chapter + CSV) -> saves subject (find-or-create),
   chapter (find-or-create), and all MCQs together.
   Below: saved list grouped by Subject -> Chapter (accordion), edit/delete.
*/

let qpExpandedSubj = null;
let qpExpandedChap = null;
let qpSubjectsCache = [];
let qpFormCSVData = null;

function qpEsc(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function qpEscHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function qpHandleFormCSV(input) {
    const file = input.files[0]; if (!file) return;
    document.getElementById('qpFormCSVName').textContent = '📄 ' + file.name;
    const reader = new FileReader();
    reader.onload = e => {
        let text = e.target.result.replace(/\t/g, ',');
        const lines = parseCSV(text);
        if (lines.length < 2) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /></svg>️ CSV-এ ডাটা নেই'); return; }
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
        qpFormCSVData = data;
        showToast(`<svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#22C55E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M21.801 10A10 10 0 1 1 17 3.335' /> <path d='m9 11 3 3L22 4' /></svg> ${data.length} প্রশ্ন লোড হয়েছে`);
    };
    reader.readAsText(file);
}

async function qpSaveAll() {
    const subjName = document.getElementById('qpFormSubject').value.trim();
    const chapName = document.getElementById('qpFormChapter').value.trim();
    const editChapId = document.getElementById('qpEditChapId').value;
    if (!subjName || !chapName) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /></svg>️ বিষয় ও অধ্যায়ের নাম দিন'); return; }
    if (!editChapId && !qpFormCSVData?.length) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /></svg>️ CSV আপলোড করুন'); return; }
    try {
        let chapId = editChapId;
        if (!chapId) {
            let subj = (await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?name=eq.${encodeURIComponent(subjName)}&select=id`) || [])[0];
            let subjId;
            if (subj) { subjId = subj.id; }
            else {
                const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?order=sort_order.desc&select=sort_order&limit=1`) || [];
                const sort = existing.length ? existing[0].sort_order + 1 : 1;
                const res = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects`, { method: 'POST', body: JSON.stringify({ name: subjName, sort_order: sort }) });
                subjId = Array.isArray(res) ? res[0]?.id : res?.id;
            }
            let chap = (await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${subjId}&name=eq.${encodeURIComponent(chapName)}&select=id`) || [])[0];
            if (chap) { chapId = chap.id; }
            else {
                const existingC = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${subjId}&order=sort_order.desc&select=sort_order&limit=1`) || [];
                const sortC = existingC.length ? existingC[0].sort_order + 1 : 1;
                const resC = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters`, { method: 'POST', body: JSON.stringify({ subject_id: subjId, name: chapName, sort_order: sortC }) });
                chapId = Array.isArray(resC) ? resC[0]?.id : resC?.id;
            }
        } else {
            await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${chapId}`, { method: 'PATCH', body: JSON.stringify({ name: chapName }) });
        }
        if (!chapId) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><circle cx="12" cy="12" r="10" /> <path d="m15 9-6 6" /> <path d="m9 9 6 6" /></svg> Chapter ID পাওয়া যায়নি'); return; }
        if (qpFormCSVData?.length) {
            const chapRow = (await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${chapId}&select=subject_id`) || [])[0];
            const subjId = chapRow?.subject_id;
            const rows = qpFormCSVData.map(d => ({ subject_id: subjId, chapter_id: chapId, ...d }));
            showToast('⏳ সেইভ হচ্ছে...');
            await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs`, { method: 'POST', body: JSON.stringify(rows) });
            showToast(`<svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#22C55E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M21.801 10A10 10 0 1 1 17 3.335' /> <path d='m9 11 3 3L22 4' /></svg> ${rows.length}টি MCQ সেইভ হয়েছে`, 4000);
        } else {
            showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M21.801 10A10 10 0 1 1 17 3.335" /> <path d="m9 11 3 3L22 4" /></svg> আপডেট হয়েছে', 3000);
        }
        qpClearForm();
        loadQpSubjects();
    } catch (e) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><circle cx="12" cy="12" r="10" /> <path d="m15 9-6 6" /> <path d="m9 9 6 6" /></svg> এরর: ' + e.message, 5000); }
}

function qpClearForm() {
    document.getElementById('qpFormSubject').value = '';
    document.getElementById('qpFormChapter').value = '';
    document.getElementById('qpEditChapId').value = '';
    document.getElementById('qpFormCSVName').textContent = '';
    document.getElementById('qpFormCSV').value = '';
    qpFormCSVData = null;
}

async function loadQpSubjects() {
    const list = document.getElementById('qpSubjList');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>';
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?order=sort_order.asc&select=id,name`) || [];
    qpSubjectsCache = data;
    const cnt = document.getElementById('qpSubjCount');
    if (cnt) cnt.textContent = `(${data.length}টি)`;
    const dl = document.getElementById('qpSubjectList');
    if (dl) dl.innerHTML = data.map(s => `<option value="${qpEscHtml(s.name)}">`).join('');
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
                <div style="flex:1"><div style="font-weight:700;font-size:13px"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#3B82F6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' /></svg> ${qpEscHtml(s.name)}</div></div>
                <button class="btn btn-sm" onclick="qpEditSubjPrompt(${s.id},'${qpEsc(s.name)}');event.stopPropagation()" style="padding:3px 8px;font-size:10px"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#F59E0B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' /> <path d='m15 5 4 4' /></svg>️</button>
                <button class="btn btn-sm" onclick="qpDelSubject(${s.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#EF4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M10 11v6' /> <path d='M14 11v6' /> <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' /> <path d='M3 6h18' /> <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' /></svg></button>
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

async function qpEditSubjPrompt(id, name) {
    const newName = prompt('বিষয়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ name: newName.trim() }) });
    showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M21.801 10A10 10 0 1 1 17 3.335" /> <path d="m9 11 3 3L22 4" /></svg> আপডেট হয়েছে');
    loadQpSubjects();
}

async function qpDelSubject(id) {
    if (!confirm('এই বিষয় এবং এর সব অধ্যায়/MCQ মুছে যাবে। নিশ্চিত?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?subject_id=eq.${id}`, { method: 'DELETE' });
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${id}`, { method: 'DELETE' });
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_subjects?id=eq.${id}`, { method: 'DELETE' });
    showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> বিষয় মুছে গেছে');
    if (qpExpandedSubj === id) qpExpandedSubj = null;
    loadQpSubjects();
}

async function qpLoadChapters(subjId) {
    const drop = document.getElementById(`qpChapDrop_${subjId}`);
    if (!drop) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?subject_id=eq.${subjId}&order=sort_order.asc&select=id,name`) || [];
    const counts = {};
    for (const ch of data) {
        const c = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?chapter_id=eq.${ch.id}&select=id`) || [];
        counts[ch.id] = c.length;
    }
    drop.innerHTML = data.length ? data.map(ch => qpRenderChapterRow(ch, counts[ch.id] || 0)).join('') : '<div style="color:var(--text2);font-size:12px;padding:8px 0">কোনো অধ্যায় নেই।</div>';
    if (qpExpandedChap) qpRefreshMcqList(qpExpandedChap);
}

function qpRenderChapterRow(ch, mcqCount) {
    const isOpen = qpExpandedChap === ch.id;
    return `
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer" onclick="qpToggleChap(${ch.id})">
            <span style="font-size:11px;color:var(--accent);transition:transform .2s;display:inline-block;transform:rotate(${isOpen?90:0}deg)">▶</span>
            <div style="flex:1;font-size:12.5px;font-weight:600"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#64748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' /> <path d='M14 2v5a1 1 0 0 0 1 1h5' /> <path d='M10 9H8' /> <path d='M16 13H8' /> <path d='M16 17H8' /></svg> ${qpEscHtml(ch.name)} <span style="color:var(--text2);font-weight:400;font-size:10.5px">(${mcqCount}টি MCQ)</span></div>
            <button class="btn btn-sm" onclick="qpEditChapToForm(${ch.id},'${qpEsc(ch.name)}');event.stopPropagation()" style="padding:3px 8px;font-size:10px"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#F59E0B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' /> <path d='m15 5 4 4' /></svg>️</button>
            <button class="btn btn-sm" onclick="qpDelChapter(${ch.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#EF4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M10 11v6' /> <path d='M14 11v6' /> <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' /> <path d='M3 6h18' /> <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' /></svg></button>
        </div>
        <div id="qpMcqDrop_${ch.id}" style="display:${isOpen?'block':'none'};padding:10px;background:var(--bg);border-top:1px solid var(--border)">
            ${isOpen ? '<div id="qpMcqListInner_'+ch.id+'"><div style="color:var(--text2);font-size:11px">লোড হচ্ছে...</div></div>' : ''}
        </div>
    </div>`;
}

async function qpToggleChap(id) {
    qpExpandedChap = (qpExpandedChap === id) ? null : id;
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}

async function qpEditChapToForm(chapId, chapName) {
    const chapRow = (await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${chapId}&select=subject_id`) || [])[0];
    const subj = qpSubjectsCache.find(s => s.id === chapRow?.subject_id);
    document.getElementById('qpFormSubject').value = subj ? subj.name : '';
    document.getElementById('qpFormChapter').value = chapName;
    document.getElementById('qpEditChapId').value = chapId;
    document.getElementById('qpFormCSVName').textContent = '(নতুন CSV আপলোড করলে অতিরিক্ত MCQ যোগ হবে)';
    qpFormCSVData = null;
    window.scrollTo({top:0,behavior:'smooth'});
}

async function qpDelChapter(id) {
    if (!confirm('এই অধ্যায় এবং এর সব MCQ মুছে যাবে। নিশ্চিত?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?chapter_id=eq.${id}`, { method: 'DELETE' });
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_chapters?id=eq.${id}`, { method: 'DELETE' });
    showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> অধ্যায় মুছে গেছে');
    if (qpExpandedChap === id) qpExpandedChap = null;
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}

async function qpRefreshMcqList(chapId) {
    const wrap = document.getElementById(`qpMcqListInner_${chapId}`);
    if (!wrap) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?chapter_id=eq.${chapId}&order=created_at.desc&select=id,question`) || [];
    if (!data.length) { wrap.innerHTML = '<div style="color:var(--text2);font-size:11px">এখনো কোনো MCQ সেইভ হয়নি।</div>'; return; }
    wrap.innerHTML = data.map(m => `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11.5px">
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${qpEscHtml(m.question)}</div>
            <button class="btn btn-sm" onclick="qpDelMcq(${m.id},${chapId})" style="padding:2px 6px;font-size:9.5px;color:var(--error);border-color:var(--error)"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#EF4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M10 11v6' /> <path d='M14 11v6' /> <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' /> <path d='M3 6h18' /> <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' /></svg></button>
        </div>
    `).join('');
}

async function qpDelMcq(id, chapId) {
    if (!confirm('এই MCQ মুছে ফেলবেন?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/qp_mcqs?id=eq.${id}`, { method: 'DELETE' });
    showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> মুছে গেছে');
    qpRefreshMcqList(chapId);
    if (qpExpandedSubj) qpLoadChapters(qpExpandedSubj);
}
