/* admin-study-tracker.js — Study Tracker Admin CRUD
   Loaded by admin.html via <script src="admin-study-tracker.js">
   Uses: SUPABASE_URL, SUPABASE_KEY, safeFetch, showToast (from admin.html)

   v3: short_name ফিল্ড UI থেকে সরানো হয়েছে (save করার সময় name-ই
   fallback হিসেবে পাঠানো হয়, কলাম খালি না থাকার জন্য)। Chapter/Topic
   input box বড় করা হয়েছে, পাশে compact "+" আইকন বাটন। প্রতিটা
   Chapter-এ "Apply to all" বাটন — একটাতে যত Topic আছে, একই Subject-এর
   বাকি সব Chapter-এও কপি করে দেয় (existing topic থাকলে duplicate
   skip করবে, নাম মিলিয়ে)।
*/

let stMode = 'hsc';
let stExpandedSubj = null;
let stExpandedChap = null;
let stSubjectsCache = [];

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
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stMode}&order=sort_order.asc&select=id,name`) || [];
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
                </div>
                <button class="btn btn-sm" onclick="stEditSubjPrompt(${s.id},'${escAttr(s.name)}');event.stopPropagation()" style="padding:3px 8px;font-size:10px">✏️</button>
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
    if (!name) { showToast('⚠️ বিষয়ের নাম দিন'); return; }
    try {
        const existing = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stMode}&order=sort_order.desc&select=sort_order&limit=1`) || [];
        const sort = existing.length ? existing[0].sort_order + 1 : 1;
        // short_name কলাম DB-তে এখনো আছে — UI-তে আলাদা ফিল্ড না রেখে name-কেই fallback হিসেবে পাঠানো হচ্ছে, যাতে কলাম খালি না থাকে।
        await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects`, {method:'POST', body:JSON.stringify({name, short_name:name, mode:stMode, sort_order:sort})});
        document.getElementById('stSubjName').value = '';
        showToast('✅ বিষয় যোগ হয়েছে');
        stLoadSubjects();
        stLoadDashCounts();
    } catch(e) { showToast('❌ Error: ' + e.message); }
}
async function stEditSubjPrompt(id, name) {
    const newName = prompt('বিষয়ের নতুন নাম:', name);
    if (!newName || newName === name) return;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim(), short_name:newName.trim()})});
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

    // ইনপুট বক্স বড় (flex:1, বেশি padding), পাশে compact circular "+" আইকন বাটন
    const addRowHtml = `
        <div style="display:flex;gap:8px;margin-bottom:10px;align-items:stretch">
            <input id="stChapName_${subjId}" class="form-input" placeholder="নতুন অধ্যায়ের নাম লিখুন..."
                style="flex:1;font-size:13.5px;padding:10px 12px;min-width:0">
            <button class="btn btn-primary" onclick="stAddChapter(${subjId})" title="অধ্যায় যোগ করুন"
                style="width:40px;height:40px;flex-shrink:0;padding:0;font-size:18px;font-weight:900;border-radius:8px;display:flex;align-items:center;justify-content:center">+</button>
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
    if (stExpandedChap) stLoadTopics(stExpandedChap, subjId);
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
async function stLoadTopics(chapId, subjId) {
    const wrap = document.getElementById('stTopicDrop_'+chapId);
    if (!wrap) return;
    const data = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${chapId}&order=sort_order.asc&select=id,name,weight`) || [];
    renderTopicDrop(chapId, subjId, data);
}

function renderTopicDrop(chapId, subjId, data){
    const wrap = document.getElementById('stTopicDrop_'+chapId);
    if (!wrap) return;

    const addRowHtml = `
        <p style="font-size:10px;color:var(--text2);margin:0 0 6px">Weight বাড়ালে ওই টপিকের % বেশি হবে। সব সমান রাখলে auto equal %।</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch">
            <input id="stTopicName_${chapId}" class="form-input" placeholder="নতুন টপিকের নাম লিখুন..."
                style="flex:1;font-size:13px;padding:9px 11px;min-width:0">
            <input id="stTopicWeight_${chapId}" class="form-input" placeholder="Wt" title="Weight"
                style="width:48px;font-size:12px;padding:9px 4px;text-align:center;flex-shrink:0">
            <button class="btn btn-primary" onclick="stAddTopic(${chapId},${subjId})" title="টপিক যোগ করুন"
                style="width:38px;height:38px;flex-shrink:0;padding:0;font-size:17px;font-weight:900;border-radius:8px;display:flex;align-items:center;justify-content:center">+</button>
        </div>`;

    // একই subject-এর অন্য chapter-গুলোতেও এই chapter-এর সব topic একসাথে
    // কপি করার বাটন — যেহেতু একই subject-এর বিভিন্ন chapter-এ অনেক সময়
    // একই রকম topic structure লাগে (যেমন প্রতি chapter-এ "সংক্ষিপ্ত প্রশ্ন",
    // "সৃজনশীল" ইত্যাদি কমন টপিক)।
    const applyAllHtml = data.length ? `
        <button class="btn btn-sm" onclick="stApplyTopicsToAllChapters(${chapId},${subjId})"
            style="width:100%;margin-bottom:8px;font-size:10.5px;padding:6px;background:rgba(124,131,255,.1);border-color:var(--accent);color:var(--accent);font-weight:700">
            📋 এই ${data.length}টি টপিক একই বিষয়ের বাকি সব অধ্যায়ে Apply করুন
        </button>` : '';

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
                onchange="stUpdateWeight(${t.id},this.value,${chapId},${subjId})">
            <button class="btn btn-sm" onclick="stEditTopicPrompt(${t.id},'${escAttr(t.name)}',${t.weight||1},${chapId},${subjId})" style="padding:2px 6px;font-size:9.5px">✏️</button>
            <button class="btn btn-sm" onclick="stDelTopic(${t.id},${chapId},${subjId})" style="padding:2px 6px;font-size:9.5px;color:var(--error);border-color:var(--error)">🗑</button>
        </div>`;
    }).join('');

    wrap.innerHTML = addRowHtml + applyAllHtml + topicsHtml;
}

async function stAddTopic(chapId, subjId) {
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
        stLoadTopics(chapId, subjId);
    } catch(e) { showToast('❌ Error: ' + e.message); }
}
async function stEditTopicPrompt(id, name, weight, chapId, subjId) {
    const newName = prompt('টপিকের নতুন নাম:', name);
    if (!newName) return;
    const newW = parseInt(prompt('Weight (১ = সমান):', weight))||1;
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({name:newName.trim(), weight:newW})});
    showToast('✅ আপডেট হয়েছে'); stLoadTopics(chapId, subjId);
}
async function stUpdateWeight(id, val, chapId, subjId) {
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({weight:parseInt(val)||1})});
    showToast('✅ Weight আপডেট'); stLoadTopics(chapId, subjId);
}
async function stDelTopic(id, chapId, subjId) {
    await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?id=eq.${id}`, {method:'DELETE'});
    showToast('🗑 টপিক মুছে গেছে'); stLoadTopics(chapId, subjId);
}

// একই subject-এর সব chapter-এ এই chapter-এর topic গুলো কপি করে দেয়।
// নাম মিলে গেলে (case-insensitive) সেই chapter-এ আর duplicate বানাবে না।
async function stApplyTopicsToAllChapters(sourceChapId, subjId) {
    if (!confirm('এই অধ্যায়ের সব টপিক কি একই বিষয়ের বাকি সব অধ্যায়ে যোগ করতে চান?')) return;
    try {
        const sourceTopics = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${sourceChapId}&select=name,weight`) || [];
        if (!sourceTopics.length) { showToast('⚠️ এই অধ্যায়ে কোনো টপিক নেই'); return; }

        const allChapters = await safeFetch(`${SUPABASE_URL}/rest/v1/st_chapters?subject_id=eq.${subjId}&select=id`) || [];
        const targetChapters = allChapters.filter(c => c.id !== sourceChapId);
        if (!targetChapters.length) { showToast('⚠️ এই বিষয়ে আর কোনো অধ্যায় নেই'); return; }

        let addedCount = 0;
        for (const ch of targetChapters) {
            const existingTopics = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${ch.id}&select=name`) || [];
            const existingNames = new Set(existingTopics.map(t => t.name.trim().toLowerCase()));
            const existingSort = await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics?chapter_id=eq.${ch.id}&order=sort_order.desc&select=sort_order&limit=1`) || [];
            let nextSort = existingSort.length ? existingSort[0].sort_order + 1 : 1;

            for (const t of sourceTopics) {
                if (existingNames.has(t.name.trim().toLowerCase())) continue; // ইতিমধ্যে আছে — skip
                await safeFetch(`${SUPABASE_URL}/rest/v1/st_topics`, {
                    method:'POST',
                    body:JSON.stringify({name:t.name, chapter_id:ch.id, weight:t.weight||1, sort_order:nextSort})
                });
                nextSort++; addedCount++;
            }
        }
        showToast(`✅ ${targetChapters.length}টি অধ্যায়ে ${addedCount}টি টপিক যোগ হয়েছে`);
        stLoadTopics(sourceChapId, subjId);
    } catch(e) { showToast('❌ Error: ' + e.message); }
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

    const subjects = await safeFetch(`${SUPABASE_URL}/rest/v1/st_subjects?mode=eq.${stRevMode}&order=sort_order.asc&select=id,name`) || [];
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
