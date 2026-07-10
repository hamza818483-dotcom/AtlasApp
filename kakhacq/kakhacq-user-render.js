// ============================================================
// ক, খ, CQ — প্রিমিয়াম ইউজার-সাইড রেন্ডারার (v2)
// সম্পূর্ণ আলাদা ফাইল। exam.html-এর বিদ্যমান loadKaKhaContent
// ফাংশনকে override করা হয়েছে (পুরোপুরি নতুন সংজ্ঞা দিয়ে), কিন্তু
// বাকি কোনো ফাংশন/ভ্যারিয়েবল স্পর্শ করা হয়নি।
//
// নতুন ৩-স্তর নেভিগেশন:
//   ১. Subject List   (ka_kha_cq টেবিলের distinct subject, লম্বা বক্স)
//   ২. Chapter List    (সিলেক্ট করা subject-এর সব chapter)
//   ৩. Questions       (সব প্রশ্ন একসাথে — page-by-page না, "সব উত্তর
//                        দেখাও/বন্ধ করো" টগল বাটন সহ)
//
// লিংক-বেইজড পুরনো এন্ট্রি (parsed_content নেই) Chapter List-এ ক্লিক
// করলে আগের মতোই নতুন ট্যাবে লিংক ওপেন হবে।
//
// FLUTTER_READY: Convert to Dart KaKhaCQ screen widgets
//   (KaKhaSubjectListScreen → KaKhaChapterListScreen → KaKhaQuestionsScreen)
// ============================================================

(function () {

    function injectStyles() {
        if (document.getElementById('kakhacq-premium-style')) return;
        const style = document.createElement('style');
        style.id = 'kakhacq-premium-style';
        style.textContent = `
.kcq-wrap{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;}

.kcq-box-list{display:flex;flex-direction:column;gap:10px;}
.kcq-box{
    background:var(--card-bg);border:1px solid var(--border);
    border-radius:var(--radius-md);padding:16px 18px;
    cursor:pointer;transition:all .2s ease;
    display:flex;justify-content:space-between;align-items:center;gap:10px;
}
.kcq-box:hover{border-color:var(--accent);background:var(--card-hover);transform:translateY(-1px);}
.kcq-box:active{transform:scale(0.99);}
.kcq-box-main{flex:1;min-width:0;}
.kcq-box-title{font-weight:700;font-size:15px;color:var(--text);font-family:'Noto Sans Bengali','Inter',sans-serif;}
.kcq-box-sub{font-size:11.5px;color:var(--text-secondary);margin-top:3px;}
.kcq-box-count{
    font-size:11px;font-weight:700;color:var(--accent);
    background:var(--accent-light);padding:4px 10px;border-radius:20px;
    white-space:nowrap;flex-shrink:0;
}
.kcq-box-arrow{color:var(--accent);font-size:18px;flex-shrink:0;}
.kcq-box.kcq-box-file{border-color:var(--accent);}

.kcq-header-info{
    font-size:12px;color:var(--text-secondary);margin:-4px 0 12px;
    display:flex;align-items:center;gap:6px;
}
.kcq-header-info b{color:var(--accent);}

.kcq-toggle-all-wrap{display:flex;justify-content:flex-end;margin-bottom:10px;}
.kcq-toggle-all-btn{
    display:inline-flex;align-items:center;gap:6px;
    padding:8px 16px;border-radius:var(--radius-full);
    background:var(--accent);color:#fff;border:none;
    font-size:12.5px;font-weight:700;cursor:pointer;
    box-shadow:var(--shadow-sm);transition:all .2s ease;
    font-family:'Noto Sans Bengali','Inter',sans-serif;
}
.kcq-toggle-all-btn:hover{box-shadow:var(--shadow-md);transform:translateY(-1px);}
.kcq-toggle-all-btn.kcq-toggle-all-active{background:var(--text-secondary);}

.kcq-card{
    background:var(--card-bg);
    border:1px solid var(--border);
    border-radius:var(--radius-md);
    padding:16px;
    box-shadow:var(--shadow-sm);
    animation:kcqFadeIn 0.35s ease both;
    transition:box-shadow .2s ease;
}
@keyframes kcqFadeIn{
    from{opacity:0;transform:translateY(8px);}
    to{opacity:1;transform:translateY(0);}
}
.kcq-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;}
.kcq-qnum{
    display:inline-flex;align-items:center;justify-content:center;
    min-width:26px;height:26px;border-radius:8px;
    background:var(--accent);
    color:#fff;font-size:12px;font-weight:700;flex-shrink:0;
}
.kcq-source-tag{
    font-size:10.5px;font-weight:600;color:var(--accent);
    background:var(--accent-light);padding:3px 9px;border-radius:20px;
    white-space:nowrap;
}
.kcq-qtext{font-size:15px;line-height:1.75;font-weight:500;color:var(--text);margin:6px 0 0;font-family:'Noto Sans Bengali','Inter',sans-serif;}
.kcq-img{max-width:100%;border-radius:10px;margin:10px 0;display:block;box-shadow:var(--shadow-sm);}

.kcq-accordion{margin-top:12px;border-radius:12px;overflow:hidden;border:1px solid var(--border);}
.kcq-acc-btn{
    width:100%;display:flex;align-items:center;gap:8px;
    background:var(--accent-light);border:none;padding:11px 14px;
    font-size:13.5px;font-weight:700;color:var(--accent);cursor:pointer;
    text-align:left;font-family:'Noto Sans Bengali','Inter',sans-serif;
}
.kcq-acc-btn .kcq-chevron{margin-left:auto;transition:transform .25s ease;font-size:12px;}
.kcq-acc-btn.open .kcq-chevron{transform:rotate(180deg);}
.kcq-acc-body{
    max-height:0;overflow:hidden;
    transition:max-height .3s ease, padding .3s ease;
    background:var(--bg-tertiary);
    padding:0 14px;
}
.kcq-acc-body.open{max-height:none;padding:14px;}
.kcq-acc-text{font-size:14.5px;line-height:1.85;color:var(--text);font-family:'Noto Sans Bengali','Inter',sans-serif;}

.kcq-sub-block{
    padding:10px 0;border-top:1px dashed var(--border);
}
.kcq-sub-block:first-child{border-top:none;}
.kcq-sub-label{
    display:inline-flex;align-items:center;justify-content:center;
    min-width:22px;height:22px;border-radius:50%;
    background:var(--accent-light);color:var(--accent);
    font-size:12px;font-weight:700;margin-right:8px;
}

.kcq-empty{text-align:center;color:var(--text-secondary);padding:30px 10px;font-size:14px;}
.kcq-file-badge{font-size:9px;background:var(--accent-light);color:var(--accent);padding:2px 6px;border-radius:8px;white-space:nowrap;}
`;
        document.head.appendChild(style);
    }

    function renderTextWithImages(text) {
        if (!text) return '';
        const escaped = escapeHtml(text);
        const urlPattern = /(https?:\/\/[^\s"<]+\.(?:png|jpe?g|gif|webp))/gi;
        return escaped.replace(urlPattern, (url) => `<img class="kcq-img" src="${url}" loading="lazy" alt="প্রশ্নের ছবি">`);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function buildSolutionAccordion(answerText, idAttr) {
        if (!answerText || !answerText.trim()) return '';
        return `
            <div class="kcq-accordion">
                <button type="button" class="kcq-acc-btn" data-kcq-acc onclick="window.__kcqToggleAccordion(this)">
                    <svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#FBBF24' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' /> <path d='M9 18h6' /> <path d='M10 22h4' /></svg> সল্যুশন
                    <span class="kcq-chevron">▼</span>
                </button>
                <div class="kcq-acc-body" id="${idAttr}">
                    <div class="kcq-acc-text">${renderTextWithImages(answerText)}</div>
                </div>
            </div>`;
    }

    window.__kcqToggleAccordion = function (btnEl) {
        const body = btnEl.nextElementSibling;
        const isOpen = btnEl.classList.toggle('open');
        body.classList.toggle('open', isOpen);
    };

    let kcqAllOpen = false;
    window.__kcqToggleAllAccordions = function (btnEl) {
        kcqAllOpen = !kcqAllOpen;
        document.querySelectorAll('[data-kcq-acc]').forEach(btn => {
            btn.classList.toggle('open', kcqAllOpen);
            const body = btn.nextElementSibling;
            if (body) body.classList.toggle('open', kcqAllOpen);
        });
        btnEl.classList.toggle('kcq-toggle-all-active', kcqAllOpen);
        btnEl.innerHTML = kcqAllOpen ? '<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> সব বন্ধ করো' : '<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg> সব উত্তর দেখাও';
    };

    function renderKaKhaCard(item, index) {
        const accId = 'kcqAcc_' + Math.random().toString(36).slice(2, 9);
        return `
            <div class="kcq-card">
                <div class="kcq-card-head">
                    <span class="kcq-qnum">${index + 1}</span>
                    ${item.source ? `<span class="kcq-source-tag">${escapeHtml(item.source)}</span>` : ''}
                </div>
                <div class="kcq-qtext">${renderTextWithImages(item.question)}</div>
                ${buildSolutionAccordion(item.answer, accId)}
            </div>`;
    }

    function renderCQCard(item, index) {
        const subsHtml = (item.sub_questions || []).map(sq => {
            const accId = 'kcqAcc_' + Math.random().toString(36).slice(2, 9);
            return `
                <div class="kcq-sub-block">
                    <div class="kcq-qtext"><span class="kcq-sub-label">${escapeHtml(sq.label)}</span>${renderTextWithImages(sq.question)}</div>
                    ${buildSolutionAccordion(sq.answer, accId)}
                </div>`;
        }).join('');

        return `
            <div class="kcq-card">
                <div class="kcq-card-head">
                    <span class="kcq-qnum">${index + 1}</span>
                    ${item.source ? `<span class="kcq-source-tag">${escapeHtml(item.source)}</span>` : ''}
                </div>
                ${item.stem ? `<div class="kcq-qtext">${renderTextWithImages(item.stem)}</div>` : ''}
                ${subsHtml}
            </div>`;
    }

    window.__kcqState = { type: null, subject: null, entries: [] };

    const LABELS = { ka: 'ক ভান্ডার', kha: 'খ ভান্ডার', cq: 'টাইপ CQ' };

    window.loadKaKhaContent = async function (type) {
        injectStyles();
        const container = document.getElementById('categoryContent');
        const label = LABELS[type] || type;
        try {
            const data = await window.safeFetch(`${window.SUPABASE_URL}/rest/v1/ka_kha_cq?select=*&order=sort_order.asc,created_at.desc&limit=200`);
            const filtered = data.filter(d => d.cq_type === type || (!d.cq_type && type === 'ka'));

            window.__kcqState = { type, subject: null, entries: filtered };

            if (!filtered.length) {
                container.innerHTML = `<div class="section-header"><div class="section-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#64748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' /> <path d='M12 22V12' /> <polyline points='3.29 7 12 12 20.71 7' /> <path d='m7.5 4.27 9 5.15' /></svg> ${label}</div></div><p class="kcq-empty">কোনো কন্টেন্ট নেই</p>`;
                window.switchMode('Category');
                return;
            }

            renderSubjectList();
            window.switchMode('Category');

        } catch (e) {
            console.error('loadKaKhaContent error:', e);
            container.innerHTML = `<div class="section-header"><div class="section-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#64748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' /> <path d='M12 22V12' /> <polyline points='3.29 7 12 12 20.71 7' /> <path d='m7.5 4.27 9 5.15' /></svg> ${label}</div></div><p class="kcq-empty" style="color:var(--error);">লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।</p>`;
            window.switchMode('Category');
        }
    };

    function renderSubjectList() {
        const { type, entries } = window.__kcqState;
        const label = LABELS[type] || type;
        const container = document.getElementById('categoryContent');

        const bySubject = {};
        entries.forEach(d => {
            const s = d.subject || 'সাধারণ';
            if (!bySubject[s]) bySubject[s] = [];
            bySubject[s].push(d);
        });
        const subjects = Object.keys(bySubject);

        let html = `
            <div class="section-header"><div class="section-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#64748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' /> <path d='M12 22V12' /> <polyline points='3.29 7 12 12 20.71 7' /> <path d='m7.5 4.27 9 5.15' /></svg> ${label}</div></div>
            <div class="kcq-header-info"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#6366F1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M12 7v14' /> <path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' /></svg> মোট সাবজেক্ট: <b>${subjects.length}</b></div>
            <div class="kcq-box-list">`;

        subjects.forEach(s => {
            const chapterCount = bySubject[s].length;
            html += `
                <div class="kcq-box" onclick="window.__kcqOpenSubject('${escapeJs(s)}')">
                    <div class="kcq-box-main">
                        <div class="kcq-box-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#3B82F6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' /></svg> ${escapeHtml(s)}</div>
                        <div class="kcq-box-sub">${chapterCount}টি চ্যাপ্টার</div>
                    </div>
                    <span class="kcq-box-count">${chapterCount}</span>
                    <span class="kcq-box-arrow"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#64748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M5 12h14' /> <path d='m12 5 7 7-7 7' /></svg></span>
                </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    function escapeJs(str) {
        return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    window.__kcqOpenSubject = function (subject) {
        window.__kcqState.subject = subject;
        renderChapterList();
    };

    function renderChapterList() {
        const { type, subject, entries } = window.__kcqState;
        const label = LABELS[type] || type;
        const container = document.getElementById('categoryContent');
        const chapters = entries.filter(d => (d.subject || 'সাধারণ') === subject);

        let html = `
            <div class="section-header"><div class="section-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#3B82F6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' /></svg> ${escapeHtml(subject)}</div></div>
            <button class="back-btn" onclick="window.__kcqBackToSubjects()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> সাবজেক্ট তালিকায় ফিরুন</button>
            <div class="kcq-header-info"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#6366F1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M12 7v14' /> <path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' /></svg> মোট চ্যাপ্টার: <b>${chapters.length}</b></div>
            <div class="kcq-box-list">`;

        chapters.forEach(d => {
            const isFile = !!d.parsed_content;
            const meta = [d.year, d.topic].filter(Boolean).join(' | ');
            const clickAction = isFile
                ? `window.__kcqOpenChapter('${d.id}')`
                : `window.open('${escapeJs(d.link_or_file || '#')}','_blank')`;
            html += `
                <div class="kcq-box ${isFile ? 'kcq-box-file' : ''}" onclick="${clickAction}">
                    <div class="kcq-box-main">
                        <div class="kcq-box-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#6366F1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M12 7v14' /> <path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' /></svg> ${escapeHtml(d.chapter || 'সাধারণ')} ${isFile ? '<span class="kcq-file-badge"><svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /> <path d="M14 2v5a1 1 0 0 0 1 1h5" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" /></svg> ফাইল</span>' : ''}</div>
                        ${meta ? `<div class="kcq-box-sub">${escapeHtml(meta)}</div>` : ''}
                    </div>
                    <span class="kcq-box-arrow">${isFile ? '<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#A78BFA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /> <path d="M20 2v4" /> <path d="M22 4h-4" /> <circle cx="4" cy="20" r="2" /></svg>' : '<svg class="emoji-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-0.125em"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /> <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>'}</span>
                </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    window.__kcqBackToSubjects = function () {
        window.__kcqState.subject = null;
        renderSubjectList();
    };

    window.__kcqOpenChapter = function (id) {
        const entry = window.__kcqState.entries.find(d => String(d.id) === String(id));
        const container = document.getElementById('categoryContent');
        if (!entry || !container) return;

        let parsed;
        try {
            parsed = typeof entry.parsed_content === 'string'
                ? JSON.parse(entry.parsed_content)
                : entry.parsed_content;
        } catch (e) {
            container.innerHTML = `<div class="kcq-empty"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#F59E0B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' /> <path d='M12 9v4' /> <path d='M12 17h.01' /></svg>️ কনটেন্ট লোড করতে সমস্যা হয়েছে।</div>`;
            return;
        }

        const items = parsed.items || [];
        const type = parsed.type || window.__kcqState.type || 'ka';

        const cardsHtml = items.map((item, i) =>
            type === 'cq' ? renderCQCard(item, i) : renderKaKhaCard(item, i)
        ).join('');

        kcqAllOpen = false;

        container.innerHTML = `
            <div class="section-header"><div class="section-title"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#6366F1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><path d='M12 7v14' /> <path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' /></svg> ${escapeHtml(entry.chapter || 'সাধারণ')}</div></div>
            <button class="back-btn" onclick="window.__kcqBackToChapters()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> চ্যাপ্টার তালিকায় ফিরুন</button>
            <div class="kcq-toggle-all-wrap">
                <button class="kcq-toggle-all-btn" onclick="window.__kcqToggleAllAccordions(this)"><svg class='emoji-icon' viewBox='0 0 24 24' width='1em' height='1em' fill='none' stroke='#22C55E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline;vertical-align:-0.125em'><rect width='18' height='11' x='3' y='11' rx='2' ry='2' /> <path d='M7 11V7a5 5 0 0 1 9.9-1' /></svg> সব উত্তর দেখাও</button>
            </div>
            <div class="kcq-wrap">${cardsHtml || '<div class="kcq-empty">কোনো প্রশ্ন নেই</div>'}</div>
        `;
        window.scrollTo(0, 0);
    };

    window.__kcqBackToChapters = function () {
        renderChapterList();
    };

    // স্ক্রিপ্ট লোড হওয়ার সাথেই CSS ইনজেক্ট করা হচ্ছে (loadKaKhaContent কল
    // হওয়ার অপেক্ষায় না থেকে), কারণ exam.html-এর অন্য অংশ (যেমন Exam
    // Subject List) এই একই kcq-box/kcq-header-info ক্লাসগুলো reuse করে।
    injectStyles();

})();
