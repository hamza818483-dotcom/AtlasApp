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
        emFormCSVData = data;
        showToast(`✅ ${data.length} প্রশ্ন লোড হয়েছে`);
    };
    reader.readAsText(file);
}

async function emSaveAll() {
    const category = document.getElementById('emFormCategory').value;
    if (!emFormCSVData?.length) { showToast('⚠️ CSV আপলোড করুন'); return; }
    const rows = emFormCSVData.map(d => ({ category, ...d }));
    try {
        showToast('⏳ সেইভ হচ্ছে...');
        await safeFetch(`${SUPABASE_URL}/rest/v1/em_mcqs`, { method: 'POST', body: JSON.stringify(rows) });
        showToast(`✅ ${rows.length}টি MCQ সেইভ হয়েছে`, 4000);
        emClearForm();
        emRefreshMcqList(category);
    } catch (e) { showToast('❌ এরর: ' + e.message, 5000); }
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
            <button class="btn btn-sm" onclick="emDelMcq(${m.id},'${category}')" style="padding:2px 6px;font-size:9.5px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>
    `).join('');
}

async function emDelMcq(id, category) {
    if (!confirm('এই MCQ মুছে ফেলবেন?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/em_mcqs?id=eq.${id}`, { method: 'DELETE' });
    showToast('🗑 মুছে গেছে');
    emRefreshMcqList(category);
}
