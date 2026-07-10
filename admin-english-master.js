/* ══════════════════════════════════════
   ENGLISH MASTER ADMIN (Synonym / Antonym)
   One-step form: pick category + CSV -> save together.
   Below: two saved lists (Synonym, Antonym) with delete.
   ══════════════════════════════════════ */

let emFormCSVData = null;

function emEscHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadEmCategories() {
    emRefreshMcqList('synonym');
    emRefreshMcqList('antonym');
}

function emHandleFormCSV(input) {
    const file = input.files[0]; if (!file) return;
    document.getElementById('emFormCSVName').textContent = '📄 ' + file.name;
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
        emFormCSVData = data;
        showToast(`<svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#22C55E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M21.801 10A10 10 0 1 1 17 3.335' /> <path d='m9 11 3 3L22 4' /></svg> ${data.length} প্রশ্ন লোড হয়েছে`);
    };
    reader.readAsText(file);
}

async function emSaveAll() {
    const category = document.getElementById('emFormCategory').value;
    if (!emFormCSVData?.length) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /></svg>️ CSV আপলোড করুন'); return; }
    const rows = emFormCSVData.map(d => ({ category, ...d }));
    try {
        showToast('⏳ সেইভ হচ্ছে...');
        await safeFetch(`${SUPABASE_URL}/rest/v1/em_mcqs`, { method: 'POST', body: JSON.stringify(rows) });
        showToast(`<svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#22C55E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M21.801 10A10 10 0 1 1 17 3.335' /> <path d='m9 11 3 3L22 4' /></svg> ${rows.length}টি MCQ সেইভ হয়েছে`, 4000);
        emClearForm();
        emRefreshMcqList(category);
    } catch (e) { showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><circle cx="12" cy="12" r="10" /> <path d="m15 9-6 6" /> <path d="m9 9 6 6" /></svg> এরর: ' + e.message, 5000); }
}

function emClearForm() {
    document.getElementById('emFormCSVName').textContent = '';
    document.getElementById('emFormCSV').value = '';
    emFormCSVData = null;
}

async function emRefreshMcqList(category) {
    const wrap = document.getElementById(`emMcqListInner_${category}`);
    if (!wrap) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/em_mcqs?category=eq.${category}&order=created_at.desc&select=id,question`) || [];
    document.getElementById(`emCount_${category}`).textContent = data.length ? `(${data.length}টি MCQ)` : '';
    if (!data.length) { wrap.innerHTML = '<div style="color:var(--text2);font-size:11px">এখনো কোনো MCQ সেইভ হয়নি।</div>'; return; }
    wrap.innerHTML = data.map(m => `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11.5px">
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${emEscHtml(m.question)}</div>
            <button class="btn btn-sm" onclick="emDelMcq(${m.id},'${category}')" style="padding:2px 6px;font-size:9.5px;color:var(--error);border-color:var(--error)"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#EF4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M10 11v6' /> <path d='M14 11v6' /> <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' /> <path d='M3 6h18' /> <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' /></svg></button>
        </div>
    `).join('');
}

async function emDelMcq(id, category) {
    if (!confirm('এই MCQ মুছে ফেলবেন?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/em_mcqs?id=eq.${id}`, { method: 'DELETE' });
    showToast('<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> মুছে গেছে');
    emRefreshMcqList(category);
}
