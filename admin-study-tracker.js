/* admin-study-tracker.js — Study Tracker Admin CRUD
   Loaded by admin.html via <script src="admin-study-tracker.js">
   Uses: SUPABASE_URL, SUPABASE_KEY, safeFetch, showToast (from admin.html)

   v2: Subject → Chapter → Topic এখন একটাই nested accordion/dropdown
   সিস্টেম — Subject-এর নিচে ক্লিক করলে Chapter list inline expand
   হয়, প্রতিটা Chapter-এর নিচে আবার ক্লিক করলে Topic list inline
   expand হয়। আগে আলাদা card/panel খুলত (stChapCard/stTopicCard) —
   এখন সবকিছু একই বিষয়-তালিকার ভিতরেই হয়।
*/

let stMode = 'hsc';
let stExpandedSubj = null;   // কোন subject-এর chapter dropdown খোলা আছে
let stExpandedChap = null;   // কোন chapter-এর topic dropdown খোলা আছে
let stSubjectsCache = [];    // বর্তমান mode-এর subject list (re-render এর জন্য)

// ══════════════════════════════════════
// DASHBOARD BOX NAV
// ══════════════════════════════════════
function stOpenBox(box) {
    document.getElementById('stDash').style.display = 'none';
    ['syllabus','routine','progress','revision'].forEach(b =>
        document.getElementById('stBox'+b.charAt(0).toUpperCase()+b.slice(1)).style.display = 'none'
    );
    const el = document.getElementById('stBox'+box.charAt(0).toUpperCase()+box.slice(1));
    if (el) el.style.display = 'block';
    if (box === 'syllabus') { stMode='hsc'; stExpandedSubj=null; stExpandedChap=null; stLoadSubjects(); stUpdateModeBtns(); }
    if (box === 'progress') stAdminLoadProgress();
    if (box === 'revision') { stRevMode='hsc'; stAdminLoadRevision(); stUpdateRevBtns(); }
}
function stCloseBox() {
    ['syllabus','routine','progress','revision'].forEach(b =>
        document.getElementById('stBox'+b.charAt(0).toUpperCase()+b.slice(1)).style.display = 'none'
    );
    document.getElementById('stDash').style.display = 'grid';
    stLoadDashCounts();
}

// ══════════════════════════════════════
// DASH COUNTS
// ══════════════════════════════════════
async function stLoadDashCounts() {
    const hsc = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.hsc&select=id`) || [];
    const med = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.medical&select=id`) || [];
    const syl = document.getElementById('stBoxCountSyl');
    const rev = document.getElementById('stBoxCountRev');
    if(syl) syl.textContent = `HSC: ${hsc.length} বিষয় · Medical: ${med.length} বিষয়`;
    if(rev) rev.textContent = `HSC: ${hsc.length} বিষয় · Medical: ${med.length} বিষয়`;
}

// ══════════════════════════════════════
// SYLLABUS — MODE SWITCH
// ══════════════════════════════════════
function stSwitchMode(mode) {
    stMode = mode;
    stExpandedSubj = null; stExpandedChap = null;
    stUpdateModeBtns();
    stLoadSubjects();
}
function stUpdateModeBtns() {
    document.getElementById('stTabHsc').className = stMode==='hsc' ? 'btn btn-primary' : 'btn btn-outline';
    document.getElementById('stTabMed').className = stMode==='medical' ? 'btn btn-primary' : 'btn btn-outline';
    document.getElementById('stTabHsc').style = 'font-size:12px;padding:6px 16px';
    document.getElementById('stTabMed').style = 'font-size:12px;padding:6px 16px';
}

function escAttr(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function escHtmlSt(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ══════════════════════════════════════
// SUBJECTS  (+ inline chapter accordion রেন্ডার)
// ══════════════════════════════════════
async function stLoadSubjects() {
    const list = document.getElementById('stSubjList');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>';
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stMode}&order=sort_order.asc&select=id,name,short_name`) || [];
    stSubjectsCache = data;
    const cnt = document.getElementById('stSubjCount');
    if(cnt) cnt.textContent = `(${data.length}টি)`;
    if (!data.length) { list.innerHTML = '<div style="color:var(--text2);font-size:12px">কোনো বিষয় নেই। উপরে যোগ করুন।</div>'; return; }
    renderSubjList(data);
}

function renderSubjList(data){
    const list = document.getElementById('stSubjList');
    list.innerHTML = data.map(s => {
        const isOpen = stExpandedSubj === s.id;
        return `
        <div style="border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:6px;padding:8px 4px;cursor:pointer" onclick="stToggleSubj(${s.id})">
                <span style="font-size:11px;color:var(--accent);transition:transform .2s;display:inline-block;transform:rotate(${isOpen?90:0}deg)">▶</span>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:13px">📘 ${escHtmlSt(s.name)}</div>
                    <div style="font-size:10px;color:var(--text2)">${escHtmlSt(s.short_name||'')}</div>
                </div>
                <button class="btn btn-sm" onclick="stEditSubjPrompt(${s.id},'${escAttr(s.name)}','${escAttr(s.short_name||'')}');event.stopPropagation()" style="padding:3px 8px;font-size:10px">✏️</button>
                <button class="btn btn-sm" onclick="stDelSubject(${s.id});event.stopPropagation()" style="padding:3px 8px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
            </div>
            <div id="stChapDrop_${s.id}" style="display:${isOpen?'block':'none'};padding:6px 4px 12px 22px;background:var(--bg)">
                ${isOpen ? '<div style="color:var(--text2);font-size:12px">লোড হচ্ছে...</div>' : ''}
            </div>
        </div>`;
    }).join('');
    if (stExpandedSubj) stLoadChapters(stExpandedSubj);
}

async function stToggleSubj(id){
    if (stExpandedSubj === id) {
        stExpandedSubj = null; stExpandedChap = null;
    } else {
        stExpandedSubj = id; stExpandedChap = null;
    }
    renderSubjList(stSubjectsCache);
}

async function stAddSubject() {
    const name = document.getElementById('stSubjName').value.trim();
    const short = document.getElementById('stSubjShort').value.trim();
    if (!name) { showToast('⚠️ বিষয়ের নাম দিন'); return; }
    try {
        const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stMode}&order=sort_order.desc&select=sort_order&limit=1`) || [];
        const sort = existing.length ? existing[0].sort_order + 1 : 1;
        await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects`, {method:'POST', body:JSON.stringify({name, short_name:short||name, mode:stMode, sort_order:sort})});
        document.getElementById('stSubjName').value = '';
        document.getElementById('stSubjShort').value = '';
        showToast('✅ বিষয় যোগ হয়েছে');
        stLoadSubjects();
        stLoadDashCounts();
    } catch(e) { showToast('❌ Error: ' + e.message); }
}
async function stEditSubjPrompt(id, name, short) {
    const newName = prompt('বিষয়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    const newShort = prompt('সংক্ষিপ্ত নাম:', short) || short;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim(), short_name:newShort.trim()})});
    showToast('✅ আপডেট হয়েছে'); stLoadSubjects();
}
async function stDelSubject(id) {
    if (!confirm('এই বিষয় এবং সব অধ্যায়+টপিক মুছে যাবে। নিশ্চিত?')) return;
    const chaps = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${id}&select=id`) || [];
    for (const ch of chaps) await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${ch.id}`, {method:'DELETE'});
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${id}`, {method:'DELETE'});
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 বিষয় মুছে গেছে');
    if (stExpandedSubj === id) { stExpandedSubj = null; stExpandedChap = null; }
    stLoadSubjects(); stLoadDashCounts();
}

// ══════════════════════════════════════
// CHAPTERS  (Subject dropdown এর ভেতরে inline রেন্ডার + topic accordion)
// ══════════════════════════════════════
async function stLoadChapters(subjId) {
    const wrap = document.getElementById('stChapDrop_'+subjId);
    if (!wrap) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${subjId}&order=sort_order.asc&select=id,name`) || [];
    renderChapDrop(subjId, data);
}

function renderChapDrop(subjId, data){
    const wrap = document.getElementById('stChapDrop_'+subjId);
    if (!wrap) return;

    const addRowHtml = `
        <div style="display:flex;gap:6px;margin-bottom:8px">
            <input id="stChapName_${subjId}" class="form-input" placeholder="নতুন অধ্যায়ের নাম" style="flex:1;font-size:12px;padding:6px 8px">
            <button class="btn btn-sm btn-primary" onclick="stAddChapter(${subjId})" style="white-space:nowrap;padding:0 12px">+ যোগ</button>
        </div>`;

    if (!data.length) {
        wrap.innerHTML = addRowHtml + '<div style="color:var(--text2);font-size:11px">কোনো অধ্যায় নেই। উপরে যোগ করুন।</div>';
        return;
    }

    const chaptersHtml = data.map((ch,i) => {
        const isOpen = stExpandedChap === ch.id;
        return `
        <div style="border-bottom:1px dashed var(--border)">
            <div style="display:flex;align-items:center;gap:5px;padding:6px 2px;cursor:pointer" onclick="stToggleChap(${subjId},${ch.id})">
                <span style="font-size:10px;color:var(--accent);transition:transform .2s;display:inline-block;transform:rotate(${isOpen?90:0}deg)">▶</span>
                <span style="font-size:11px;color:var(--text2);min-width:16px">${i+1}.</span>
                <span style="flex:1;font-size:12.5px">📂 ${escHtmlSt(ch.name)}</span>
                <button class="btn btn-sm" onclick="stEditChapPrompt(${ch.id},'${escAttr(ch.name)}',${subjId});event.stopPropagation()" style="padding:2px 7px;font-size:10px">✏️</button>
                <button class="btn btn-sm" onclick="stDelChapter(${ch.id},${subjId});event.stopPropagation()" style="padding:2px 7px;font-size:10px;color:var(--error);border-color:var(--error)">🗑</button>
            </div>
            <div id="stTopicDrop_${ch.id}" style="display:${isOpen?'block':'none'};padding:6px 4px 10px 20px;background:var(--card-bg)">
                ${isOpen ? '<div style="color:var(--text2);font-size:11px">লোড হচ্ছে...</div>' : ''}
            </div>
        </div>`;
    }).join('');

    wrap.innerHTML = addRowHtml + chaptersHtml;
    if (stExpandedChap) stLoadTopics(stExpandedChap);
}

async function stToggleChap(subjId, chapId){
    stExpandedChap = (stExpandedChap === chapId) ? null : chapId;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${subjId}&order=sort_order.asc&select=id,name`) || [];
    renderChapDrop(subjId, data);
}

async function stAddChapter(subjId) {
    const input = document.getElementById('stChapName_'+subjId);
    const name = input.value.trim();
    if (!name) { showToast('⚠️ অধ্যায়ের নাম দিন'); return; }
    try {
        const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${subjId}&order=sort_order.desc&select=sort_order&limit=1`) || [];
        const sort = existing.length ? existing[0].sort_order + 1 : 1;
        await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters`, {method:'POST', body:JSON.stringify({name, subject_id:subjId, sort_order:sort})});
        showToast('✅ অধ্যায় যোগ হয়েছে');
        stLoadChapters(subjId);
    } catch(e) { showToast('❌ Error: ' + e.message); }
}
async function stEditChapPrompt(id, name, subjId) {
    const newName = prompt('অধ্যায়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim()})});
    showToast('✅ আপডেট হয়েছে'); stLoadChapters(subjId);
}
async function stDelChapter(id, subjId) {
    if (!confirm('অধ্যায় ও সব টপিক মুছে যাবে?')) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${id}`, {method:'DELETE'});
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 অধ্যায় মুছে গেছে');
    if (stExpandedChap === id) stExpandedChap = null;
    stLoadChapters(subjId);
}

// ══════════════════════════════════════
// TOPICS  (Chapter dropdown এর ভেতরে inline রেন্ডার — dropdown system)
// ══════════════════════════════════════
async function stLoadTopics(chapId) {
    const wrap = document.getElementById('stTopicDrop_'+chapId);
    if (!wrap) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${chapId}&order=sort_order.asc&select=id,name,weight`) || [];
    renderTopicDrop(chapId, data);
}

function renderTopicDrop(chapId, data){
    const wrap = document.getElementById('stTopicDrop_'+chapId);
    if (!wrap) return;

    const addRowHtml = `
        <p style="font-size:10px;color:var(--text2);margin:0 0 6px">Weight বাড়ালে ওই টপিকের % বেশি হবে। সব সমান রাখলে auto equal %।</p>
        <div style="display:flex;gap:5px;margin-bottom:8px">
            <input id="stTopicName_${chapId}" class="form-input" placeholder="নতুন টপিকের নাম" style="flex:1;font-size:11.5px;padding:5px 7px">
            <input id="stTopicWeight_${chapId}" class="form-input" placeholder="Weight" style="width:60px;font-size:11.5px;padding:5px 7px">
            <button class="btn btn-sm btn-primary" onclick="stAddTopic(${chapId})" style="white-space:nowrap;padding:0 10px">+ যোগ</button>
        </div>`;

    if (!data.length) {
        wrap.innerHTML = addRowHtml + '<div style="color:var(--text2);font-size:11px">কোনো টপিক নেই। উপরে যোগ করুন।</div>';
        return;
    }

    const totalW = data.reduce((s,t) => s + (t.weight||1), 0);
    const topicsHtml = data.map((t,i) => {
        const pct = Math.round((t.weight||1)/totalW*100);
        return `<div style="display:flex;align-items:center;gap:4px;padding:5px 2px;border-bottom:1px dotted var(--border)">
            <span style="font-size:10px;color:var(--text2);min-width:16px">${i+1}.</span>
            <span style="flex:1;font-size:11.5px">${escHtmlSt(t.name)}</span>
            <span style="font-size:9.5px;color:var(--accent);min-width:28px;text-align:right;font-weight:700">${pct}%</span>
            <input type="number" value="${t.weight||1}" min="1" max="20" title="Weight"
                style="width:36px;padding:2px 3px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:10px;text-align:center"
                onchange="stUpdateWeight(${t.id},this.value,${chapId})">
            <button class="btn btn-sm" onclick="stEditTopicPrompt(${t.id},'${escAttr(t.name)}',${t.weight||1},${chapId})" style="padding:2px 6px;font-size:9.5px">✏️</button>
            <button class="btn btn-sm" onclick="stDelTopic(${t.id},${chapId})" style="padding:2px 6px;font-size:9.5px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>`;
    }).join('');

    wrap.innerHTML = addRowHtml + topicsHtml;
}

async function stAddTopic(chapId) {
    const nameInput = document.getElementById('stTopicName_'+chapId);
    const weightInput = document.getElementById('stTopicWeight_'+chapId);
    const name = nameInput.value.trim();
    const weight = parseInt(weightInput.value)||1;
    if (!name) { showToast('⚠️ টপিকের নাম দিন'); return; }
    try {
        const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${chapId}&order=sort_order.desc&select=sort_order&limit=1`) || [];
        const sort = existing.length ? existing[0].sort_order + 1 : 1;
        await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics`, {method:'POST', body:JSON.stringify({name, chapter_id:chapId, weight, sort_order:sort})});
        showToast('✅ টপিক যোগ হয়েছে');
        stLoadTopics(chapId);
    } catch(e) { showToast('❌ Error: ' + e.message); }
}
async function stEditTopicPrompt(id, name, weight, chapId) {
    const newName = prompt('টপিকের নতুন নাম:', name);
    if (!newName) return;
    const newW = parseInt(prompt('Weight (১ = সমান):', weight))||1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim(), weight:newW})});
    showToast('✅ আপডেট হয়েছে'); stLoadTopics(chapId);
}
async function stUpdateWeight(id, val, chapId) {
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({weight:parseInt(val)||1})});
    showToast('✅ Weight আপডেট'); stLoadTopics(chapId);
}
async function stDelTopic(id, chapId) {
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 টপিক মুছে গেছে'); stLoadTopics(chapId);
}

// ══════════════════════════════════════
// WEAK & PROGRESS BOX — Admin View
// ══════════════════════════════════════
let stProgMode = 'hsc';
async function stAdminLoadProgress() {
    const wrap = document.getElementById('stAdminProgWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div style="color:var(--text2);font-size:12px;text-align:center;padding:24px">লোড হচ্ছে...</div>';

    const rows = await safeFetch(`${SUPABASE_URL}/rest/v1/st_user_progress?mode=eq.${stProgMode}&order=pct.desc&limit=100&select=user_phone,pct,done_topics,total_topics`) || [];

    let userMap = {};
    if (rows.length) {
        const phones = rows.map(r => `"${r.user_phone}"`).join(',');
        try {
            const users = await safeFetch(`${SUPABASE_URL}/rest/v1/users?phone=in.(${phones})&select=phone,name,batch`) || [];
            users.forEach(u => userMap[u.phone] = u);
        } catch(e) {}
    }

    if (!rows.length) {
        wrap.innerHTML = '<div style="color:var(--text2);font-size:12px;text-align:center;padding:32px">কোনো Student এখনো Progress sync করেনি।</div>';
        return;
    }

    const rankColors = ['','#F5B800','#94A3B8','#CD7C3A'];
    const html = rows.map((r, i) => {
        const rank = i + 1;
        const u = userMap[r.user_phone] || {};
        const name = u.name || r.user_phone;
        const batch = u.batch || '';
        const initial = (name[0] || '?').toUpperCase();
        const rc = rank <= 3 ? rankColors[rank] : 'rgba(255,255,255,.3)';
        const medal = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank;
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)">
            <span style="width:24px;font-size:12px;font-weight:700;color:${rc};flex-shrink:0;text-align:center">${medal}</span>
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#7C83FF,#38BDF8);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${initial}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
                <div style="font-size:10px;color:var(--text2)">${batch} · ${r.done_topics||0}/${r.total_topics||0} টপিক</div>
                <div style="margin-top:4px;height:3px;background:var(--bg);border-radius:999px;overflow:hidden">
                    <div style="width:${r.pct||0}%;height:100%;background:linear-gradient(90deg,#7C83FF,#38BDF8);border-radius:999px"></div>
                </div>
            </div>
            <span style="font-size:13px;font-weight:800;flex-shrink:0;color:${rank===1?'#F5B800':rank===2?'#94A3B8':rank===3?'#CD7C3A':'var(--text)'}">${(+r.pct).toFixed(1)}%</span>
        </div>`;
    }).join('');

    wrap.innerHTML = `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">${html}</div>`;
}

function stProgSwitchMode(mode, btn) {
    stProgMode = mode;
    document.querySelectorAll('#stBoxProgress .st-prog-tab').forEach(b => {
        b.className = 'btn btn-outline st-prog-tab';
        b.style = 'font-size:11px;padding:5px 14px';
    });
    btn.className = 'btn btn-primary st-prog-tab';
    btn.style = 'font-size:11px;padding:5px 14px';
    stAdminLoadProgress();
}

// ══════════════════════════════════════
// REVISION BOX — Admin Preview
// ══════════════════════════════════════
let stRevMode = 'hsc';
async function stAdminLoadRevision() {
    const grid = document.getElementById('stRevSubjGrid');
    if (!grid) return;
    grid.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:16px">লোড হচ্ছে...</div>';

    const subjects = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stRevMode}&order=sort_order.asc&select=id,name,short_name`) || [];
    if (!subjects.length) {
        grid.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:16px">কোনো বিষয় নেই। Syllabus Tracker এ বিষয় যোগ করুন।</div>';
        return;
    }

    const cards = await Promise.all(subjects.map(async s => {
        const chaps = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${s.id}&select=id,name`) || [];
        let topicCount = 0;
        for (const c of chaps) {
            const topics = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${c.id}&select=id`) || [];
            topicCount += topics.length;
        }
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;border-top:2px solid #A855F7">
            <div style="font-size:12px;font-weight:700;margin-bottom:6px">${s.name}</div>
            <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:4px;background:var(--bg);border-radius:999px"><div style="width:0%;height:100%;background:linear-gradient(90deg,#A855F7,#F43F5E);border-radius:999px"></div></div>
                <span style="font-size:10px;color:var(--text2)">${chaps.length} অধ্যায় · ${topicCount} টপিক</span>
            </div>
        </div>`;
    }));
    grid.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${cards.join('')}</div>
        <div style="margin-top:12px;padding:12px;background:var(--card);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:12px;color:var(--text2);text-align:center">Revision Tracker, User এর Syllabus Progress এর উপর ভিত্তি করে কাজ করে।<br>আলাদা content ম্যানেজমেন্ট শীঘ্রই আসছে।</div>
        </div>`;
}

function stUpdateRevBtns() {
    const hBtn = document.getElementById('stRevTabHsc');
    const mBtn = document.getElementById('stRevTabMed');
    if(hBtn) hBtn.className = stRevMode==='hsc' ? 'btn btn-primary' : 'btn btn-outline';
    if(mBtn) mBtn.className = stRevMode==='medical' ? 'btn btn-primary' : 'btn btn-outline';
    if(hBtn) hBtn.style = 'font-size:11px;padding:5px 14px';
    if(mBtn) mBtn.style = 'font-size:11px;padding:5px 14px';
}
function stRevSwitchMode(mode, btn) {
    stRevMode = mode; stUpdateRevBtns(); stAdminLoadRevision();
}
