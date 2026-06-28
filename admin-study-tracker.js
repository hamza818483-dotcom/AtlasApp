/* admin-study-tracker.js — Study Tracker Admin CRUD
   Loaded by admin.html via <script src="admin-study-tracker.js">
   Uses: SUPABASE_URL, SUPABASE_KEY, safeFetch, showToast (from admin.html)
*/

/* ═══════════════════════════════════════════════
   STUDY TRACKER ADMIN  (Subject / Chapter / Topic CRUD)
═══════════════════════════════════════════════ */
let stMode = 'hsc';
let stSelSubjId = null, stSelChapId = null;
let stSelSubjName = '', stSelChapName = '';
let stEditSubjId = null, stEditChapId = null, stEditTopicId = null;

// ── Dashboard box nav ──
function stOpenBox(box) {
    document.getElementById('stDash').style.display = 'none';
    ['syllabus','routine','progress','revision'].forEach(b =>
        document.getElementById('stBox'+b.charAt(0).toUpperCase()+b.slice(1)).style.display = 'none'
    );
    const el = document.getElementById('stBox'+box.charAt(0).toUpperCase()+box.slice(1));
    if (el) el.style.display = 'block';
    if (box === 'syllabus') { stMode='hsc'; stLoadSubjects(); stUpdateModeBtns(); }
}
function stCloseBox() {
    ['syllabus','routine','progress','revision'].forEach(b =>
        document.getElementById('stBox'+b.charAt(0).toUpperCase()+b.slice(1)).style.display = 'none'
    );
    document.getElementById('stDash').style.display = 'grid';
    stLoadDashCounts();
}
function stCloseChap() {
    document.getElementById('stChapCard').style.display='none';
    document.getElementById('stTopicCard').style.display='none';
    stSelSubjId=null;
}
function stCloseTopic() {
    document.getElementById('stTopicCard').style.display='none';
    stSelChapId=null;
}
function stUpdateModeBtns() {
    document.getElementById('stTabHsc').className = stMode==='hsc' ? 'btn btn-primary' : 'btn btn-outline';
    document.getElementById('stTabMed').className = stMode==='medical' ? 'btn btn-primary' : 'btn btn-outline';
    document.getElementById('stTabHsc').style = 'font-size:12px;padding:6px 16px';
    document.getElementById('stTabMed').style = 'font-size:12px;padding:6px 16px';
}
async function stLoadDashCounts() {
    const hsc = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.hsc&select=id`) || [];
    const med = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.medical&select=id`) || [];
    const syl = document.getElementById('stBoxCountSyl');
    const rev = document.getElementById('stBoxCountRev');
    if(syl) syl.textContent = `HSC: ${hsc.length} বিষয় · Medical: ${med.length} বিষয়`;
    if(rev) rev.textContent = `HSC: ${hsc.length} বিষয় · Medical: ${med.length} বিষয়`;
}

function stSwitchMode(mode) {
    stMode = mode;
    stSelSubjId = null; stSelChapId = null;
    stUpdateModeBtns();
    document.getElementById('stChapCard').style.display='none';
    document.getElementById('stTopicCard').style.display='none';
    stLoadSubjects();
}

async function stLoadSubjects() {
    const list = document.getElementById('stSubjList');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>';
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stMode}&order=sort_order.asc&select=id,name,short_name`) || [];
    const cnt = document.getElementById('stSubjCount');
    if(cnt) cnt.textContent = `(${data.length}টি)`;
    if (!data.length) { list.innerHTML = '<div style="color:var(--text2);font-size:12px">কোনো বিষয় নেই। উপরে যোগ করুন।</div>'; return; }
    list.innerHTML = data.map(s => `
        <div style="display:flex;align-items:center;gap:6px;padding:8px 4px;border-bottom:1px solid var(--border)">
            <div style="flex:1;cursor:pointer" onclick="stSelectSubj(${s.id},'${s.name.replace(/'/g,"\'")}')">
                <div style="font-weight:600;font-size:13px">📘 ${s.name}</div>
                <div style="font-size:10px;color:var(--text2)">${s.short_name||''}</div>
            </div>
            <button class="btn btn-sm" onclick="stEditSubjPrompt(${s.id},'${s.name.replace(/'/g,"\'")}','${(s.short_name||'').replace(/'/g,"\'")}');event.stopPropagation()" style="padding:3px 8px;font-size:10px">✏️</button>
            <button class="btn btn-sm" onclick="stDelSubject(${s.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>`).join('');
}

async function stEditSubjPrompt(id, name, short) {
    const newName = prompt('বিষয়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    const newShort = prompt('সংক্ষিপ্ত নাম:', short) || short;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim(), short_name:newShort.trim()})});
    showToast('✅ আপডেট হয়েছে');
    stLoadSubjects();
}

async function stAddSubject() {
    const name = document.getElementById('stSubjName').value.trim();
    const short = document.getElementById('stSubjShort').value.trim();
    if (!name) { showToast('⚠️ বিষয়ের নাম দিন'); return; }
    const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stMode}&order=sort_order.desc&select=sort_order&limit=1`) || [];
    const sort = existing.length ? existing[0].sort_order + 1 : 1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects`, {method:'POST', body:JSON.stringify({name, short_name:short||name, mode:stMode, sort_order:sort})});
    document.getElementById('stSubjName').value = '';
    document.getElementById('stSubjShort').value = '';
    showToast('✅ বিষয় যোগ হয়েছে');
    stLoadSubjects();
}

async function stDelSubject(id) {
    if (!confirm('এই বিষয় এবং সব অধ্যায়+টপিক মুছে যাবে। নিশ্চিত?')) return;
    const chaps = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${id}&select=id`) || [];
    for (const ch of chaps) await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${ch.id}`, {method:'DELETE'});
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${id}`, {method:'DELETE'});
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 বিষয় মুছে গেছে');
    stLoadSubjects();
    document.getElementById('stChapCard').style.display='none';
    document.getElementById('stTopicCard').style.display='none';
}

function stSelectSubj(id, name) {
    stSelSubjId = id; stSelSubjName = name;
    stSelChapId = null;
    document.getElementById('stChapCardTitle').textContent = '📂 ' + name + ' — অধ্যায় সমূহ';
    document.getElementById('stChapCard').style.display='block';
    document.getElementById('stTopicCard').style.display='none';
    stLoadChapters();
}

async function stLoadChapters() {
    const list = document.getElementById('stChapList');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>';
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${stSelSubjId}&order=sort_order.asc&select=id,name`) || [];
    if (!data.length) { list.innerHTML = '<div style="color:var(--text2);font-size:12px">কোনো অধ্যায় নেই। উপরে যোগ করুন।</div>'; return; }
    list.innerHTML = data.map((ch,i) => `
        <div style="display:flex;align-items:center;gap:6px;padding:8px 4px;border-bottom:1px solid var(--border)">
            <span style="font-size:11px;color:var(--text2);min-width:20px">${i+1}.</span>
            <span style="flex:1;cursor:pointer;font-size:13px" onclick="stSelectChap(${ch.id},'${ch.name.replace(/'/g,"\'")}')">📂 ${ch.name}</span>
            <button class="btn btn-sm" onclick="stEditChapPrompt(${ch.id},'${ch.name.replace(/'/g,"\'")}');event.stopPropagation()" style="padding:3px 8px;font-size:10px">✏️</button>
            <button class="btn btn-sm" onclick="stDelChapter(${ch.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>`).join('');
}

async function stEditChapPrompt(id, name) {
    const newName = prompt('অধ্যায়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim()})});
    showToast('✅ আপডেট হয়েছে');
    stLoadChapters();
}

async function stAddChapter() {
    const name = document.getElementById('stChapName').value.trim();
    if (!name || !stSelSubjId) { showToast('⚠️ অধ্যায়ের নাম দিন'); return; }
    const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${stSelSubjId}&order=sort_order.desc&select=sort_order&limit=1`) || [];
    const sort = existing.length ? existing[0].sort_order + 1 : 1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters`, {method:'POST', body:JSON.stringify({name, subject_id:stSelSubjId, sort_order:sort})});
    document.getElementById('stChapName').value = '';
    showToast('✅ অধ্যায় যোগ হয়েছে');
    stLoadChapters();
}

async function stDelChapter(id) {
    if (!confirm('অধ্যায় ও সব টপিক মুছে যাবে?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${id}`, {method:'DELETE'});
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 অধ্যায় মুছে গেছে');
    stLoadChapters();
    document.getElementById('stTopicCard').style.display='none';
}

function stSelectChap(id, name) {
    stSelChapId = id; stSelChapName = name;
    document.getElementById('stTopicCardTitle').textContent = '📝 ' + name + ' — টপিক সমূহ';
    document.getElementById('stTopicCard').style.display='block';
    stLoadTopics();
}

async function stLoadTopics() {
    const list = document.getElementById('stTopicList');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>';
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${stSelChapId}&order=sort_order.asc&select=id,name,weight`) || [];
    if (!data.length) { list.innerHTML = '<div style="color:var(--text2);font-size:12px">কোনো টপিক নেই। উপরে যোগ করুন।</div>'; return; }
    const totalW = data.reduce((s,t) => s + (t.weight||1), 0);
    list.innerHTML = data.map((t,i) => {
        const pct = Math.round((t.weight||1)/totalW*100);
        return `<div style="display:flex;align-items:center;gap:5px;padding:7px 2px;border-bottom:1px solid var(--border)">
            <span style="font-size:11px;color:var(--text2);min-width:18px">${i+1}.</span>
            <span style="flex:1;font-size:12px">${t.name}</span>
            <span style="font-size:10px;color:var(--accent);min-width:30px;text-align:right;font-weight:700">${pct}%</span>
            <input type="number" value="${t.weight||1}" min="1" max="20" title="Weight"
                style="width:40px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px;text-align:center"
                onchange="stUpdateWeight(${t.id},this.value)">
            <button class="btn btn-sm" onclick="stEditTopicPrompt(${t.id},'${t.name.replace(/'/g,"\'")}',${t.weight||1})" style="padding:3px 7px;font-size:10px">✏️</button>
            <button class="btn btn-sm" onclick="stDelTopic(${t.id})" style="padding:3px 7px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>`;
    }).join('');
}

async function stEditTopicPrompt(id, name, weight) {
    const newName = prompt('টপিকের নতুন নাম:', name);
    if (!newName) return;
    const newW = parseInt(prompt('Weight (১ = সমান):', weight))||1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim(), weight:newW})});
    showToast('✅ আপডেট হয়েছে');
    stLoadTopics();
}

async function stAddTopic() {
    const name = document.getElementById('stTopicName').value.trim();
    const weight = parseInt(document.getElementById('stTopicWeight').value)||1;
    if (!name || !stSelChapId) { showToast('⚠️ টপিকের নাম দিন'); return; }
    const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${stSelChapId}&order=sort_order.desc&select=sort_order&limit=1`) || [];
    const sort = existing.length ? existing[0].sort_order + 1 : 1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics`, {method:'POST', body:JSON.stringify({name, chapter_id:stSelChapId, weight, sort_order:sort})});
    document.getElementById('stTopicName').value = '';
    document.getElementById('stTopicWeight').value = '';
    showToast('✅ টপিক যোগ হয়েছে');
    stLoadTopics();
}

async function stUpdateWeight(id, val) {
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({weight:parseInt(val)||1})});
    showToast('✅ Weight আপডেট');
    stLoadTopics();
}

async function stDelTopic(id) {
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 টপিক মুছে গেছে');
    stLoadTopics();
}
