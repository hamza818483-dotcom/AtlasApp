// ============================================================
// ক, খ, CQ — প্রিমিয়াম ইউজার-সাইড রেন্ডারার
// সম্পূর্ণ আলাদা ফাইল। exam.html-এর বিদ্যমান loadKaKhaContent
// ফাংশনকে override করা হয়েছে (পুরোপুরি নতুন সংজ্ঞা দিয়ে), কিন্তু
// বাকি কোনো ফাংশন/ভ্যারিয়েবল স্পর্শ করা হয়নি। এই override শুধু
// তখনই কাজ করে যখন কোনো এন্ট্রিতে parsed_content (নতুন ফাইল-আপলোড
// সিস্টেমের ডেটা) থাকে — লিংক-বেইজড পুরনো এন্ট্রি অপরিবর্তিত আগের
// মতোই (নতুন ট্যাবে লিংক ওপেন) কাজ করবে।
// FLUTTER_READY: Convert to Dart KaKhaCQ screen widgets
// ============================================================

(function () {

    // ---------- পেজিনেশন লিমিট (প্রতি স্ক্রিনে কয়টা প্রশ্ন) ----------
    const PAGE_SIZE = { ka: 8, kha: 4, cq: 2 };

    // ---------- CSS ইনজেকশন (একবারই) ----------
    function injectStyles() {
        if (document.getElementById('kakhacq-premium-style')) return;
        const style = document.createElement('style');
        style.id = 'kakhacq-premium-style';
        style.textContent = `
.kcq-wrap{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;}
.kcq-card{
    background:linear-gradient(180deg, rgba(14,122,86,0.06), rgba(14,122,86,0.02));
    border:1px solid rgba(14,122,86,0.18);
    border-radius:16px;
    padding:16px;
    box-shadow:0 2px 10px rgba(0,0,0,0.06);
    animation:kcqFadeIn 0.35s ease both;
    transition:box-shadow .2s ease, transform .15s ease;
}
.kcq-card:active{transform:scale(0.997);}
@keyframes kcqFadeIn{
    from{opacity:0;transform:translateY(8px);}
    to{opacity:1;transform:translateY(0);}
}
.kcq-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;}
.kcq-qnum{
    display:inline-flex;align-items:center;justify-content:center;
    min-width:26px;height:26px;border-radius:8px;
    background:linear-gradient(135deg,#0E7A56,#0B8A5A);
    color:#fff;font-size:12px;font-weight:700;flex-shrink:0;
}
.kcq-source-tag{
    font-size:10.5px;font-weight:600;color:#0E7A56;
    background:rgba(14,122,86,0.1);padding:3px 9px;border-radius:20px;
    white-space:nowrap;
}
.kcq-qtext{font-size:15px;line-height:1.75;font-weight:500;color:var(--text-primary,#0F172A);margin:6px 0 0;}
.kcq-img{max-width:100%;border-radius:10px;margin:10px 0;display:block;box-shadow:0 1px 6px rgba(0,0,0,0.1);}

.kcq-accordion{margin-top:12px;border-radius:12px;overflow:hidden;border:1px solid rgba(14,122,86,0.25);}
.kcq-acc-btn{
    width:100%;display:flex;align-items:center;gap:8px;
    background:rgba(14,122,86,0.1);border:none;padding:11px 14px;
    font-size:13.5px;font-weight:700;color:#0E7A56;cursor:pointer;
    text-align:left;
}
.kcq-acc-btn .kcq-chevron{margin-left:auto;transition:transform .25s ease;font-size:12px;}
.kcq-acc-btn.open .kcq-chevron{transform:rotate(180deg);}
.kcq-acc-body{
    max-height:0;overflow:hidden;
    transition:max-height .3s ease, padding .3s ease;
    background:rgba(255,255,255,0.5);
    padding:0 14px;
}
.kcq-acc-body.open{max-height:2000px;padding:14px;}
.kcq-acc-text{font-size:14.5px;line-height:1.85;color:var(--text-primary,#0F172A);}

.kcq-sub-block{
    padding:10px 0;border-top:1px dashed rgba(14,122,86,0.2);
}
.kcq-sub-block:first-child{border-top:none;}
.kcq-sub-label{
    display:inline-flex;align-items:center;justify-content:center;
    min-width:22px;height:22px;border-radius:50%;
    background:rgba(14,122,86,0.15);color:#0E7A56;
    font-size:12px;font-weight:700;margin-right:8px;
}

.kcq-pagination{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:18px;}
.kcq-page-btn{
    padding:8px 16px;border-radius:10px;border:1px solid rgba(14,122,86,0.3);
    background:transparent;color:#0E7A56;font-weight:600;font-size:13px;cursor:pointer;
}
.kcq-page-btn:disabled{opacity:0.35;cursor:not-allowed;}
.kcq-page-info{font-size:12.5px;color:var(--text-secondary,#888);}

.kcq-empty{text-align:center;color:var(--text-secondary,#888);padding:30px 10px;font-size:14px;}
`;
        document.head.appendChild(style);
    }

    // ---------- টেক্সটের মধ্যে {{IMG_n}} প্লেসহোল্ডার বা ডাইরেক্ট ইমেজ URL রেন্ডার ----------
    // parsed_content-এ ইমেজ লিংক ইতিমধ্যে টেক্সটে বসানো থাকে (resolveImages ধাপে),
    // তাই আমরা শুধু সেই লিংককে চিনে নিয়ে <img> ট্যাগে রূপান্তর করি।
    function renderTextWithImages(text) {
        if (!text) return '';
        const escaped = escapeHtml(text);
        // ImgBB/অন্য কোনো ইমেজ URL সরাসরি প্যারাগ্রাফে থাকলে তাকে <img> বানানো
        const urlPattern = /(https?:\/\/[^\s"<]+\.(?:png|jpe?g|gif|webp))/gi;
        return escaped.replace(urlPattern, (url) => `<img class="kcq-img" src="${url}" loading="lazy" alt="প্রশ্নের ছবি">`);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---------- একটা accordion সল্যুশন ব্লক বানানো ----------
    function buildSolutionAccordion(answerText, idAttr) {
        if (!answerText || !answerText.trim()) return '';
        return `
            <div class="kcq-accordion">
                <button type="button" class="kcq-acc-btn" onclick="window.__kcqToggleAccordion(this)">
                    💡 সল্যুশন
                    <span class="kcq-chevron">▼</span>
                </button>
                <div class="kcq-acc-body" id="${idAttr}">
                    <div class="kcq-acc-text">${renderTextWithImages(answerText)}</div>
                </div>
            </div>`;
    }

    // গ্লোবাল টগল হ্যান্ডলার (ইনলাইন onclick থেকে কল হয়)
    window.__kcqToggleAccordion = function (btnEl) {
        const body = btnEl.nextElementSibling;
        const isOpen = btnEl.classList.toggle('open');
        body.classList.toggle('open', isOpen);
    };

    // ---------- একটা single ক/খ কার্ড রেন্ডার ----------
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

    // ---------- একটা single CQ কার্ড রেন্ডার (stem + ৪টা সাব-প্রশ্ন) ----------
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

    // ---------- মূল রেন্ডারার: একটা entry-র parsed_content দেখিয়ে পেজিনেট করে ----------
    function renderParsedEntry(container, entry, label, showBackBtn) {
        injectStyles();
        let parsed;
        try {
            parsed = typeof entry.parsed_content === 'string'
                ? JSON.parse(entry.parsed_content)
                : entry.parsed_content;
        } catch (e) {
            container.innerHTML = `<div class="kcq-empty">⚠️ কনটেন্ট লোড করতে সমস্যা হয়েছে।</div>`;
            return;
        }

        const items = parsed.items || [];
        const type = parsed.type || 'ka';
        const pageSize = PAGE_SIZE[type] || 5;
        let currentPage = 0;
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

        const backBtnHtml = showBackBtn
            ? `<button class="kcq-page-btn" style="margin-bottom:10px;" onclick="window.loadKaKhaContent('${type}')">← চ্যাপ্টার তালিকায় ফিরুন</button>`
            : '';

        function renderPage() {
            const start = currentPage * pageSize;
            const pageItems = items.slice(start, start + pageSize);

            const cardsHtml = pageItems.map((item, i) => {
                const globalIndex = start + i;
                return type === 'cq' ? renderCQCard(item, globalIndex) : renderKaKhaCard(item, globalIndex);
            }).join('');

            const paginationHtml = totalPages > 1 ? `
                <div class="kcq-pagination">
                    <button class="kcq-page-btn" id="kcqPrevBtn" ${currentPage === 0 ? 'disabled' : ''}>← আগের</button>
                    <span class="kcq-page-info">${currentPage + 1} / ${totalPages}</span>
                    <button class="kcq-page-btn" id="kcqNextBtn" ${currentPage === totalPages - 1 ? 'disabled' : ''}>পরের →</button>
                </div>` : '';

            container.innerHTML = `
                <div class="section-header"><div class="section-title">📦 ${label} ${entry.chapter ? '— ' + escapeHtml(entry.chapter) : ''}</div></div>
                ${backBtnHtml}
                <div class="kcq-wrap">${cardsHtml || '<div class="kcq-empty">কোনো প্রশ্ন নেই</div>'}</div>
                ${paginationHtml}
            `;

            const prevBtn = document.getElementById('kcqPrevBtn');
            const nextBtn = document.getElementById('kcqNextBtn');
            if (prevBtn) prevBtn.onclick = () => { currentPage--; renderPage(); window.scrollTo(0, 0); };
            if (nextBtn) nextBtn.onclick = () => { currentPage++; renderPage(); window.scrollTo(0, 0); };
        }

        renderPage();
    }

    // ---------- exam.html-এর loadKaKhaContent ওভাররাইড ----------
    // বিদ্যমান ফাংশনের সিগনেচার অপরিবর্তিত (type প্যারামিটার নেয়)।
    // আগের ভার্সনে ভুল ছিল: parsed_content থাকা প্রথম এন্ট্রিকেই সরাসরি
    // পুরো-স্ক্রিন প্রিমিয়াম UI-তে দেখিয়ে দিত, ফলে একই টাইপের অন্য
    // সাবজেক্ট/চ্যাপ্টারগুলো (এমনকি অন্য ফাইল-আপলোড এন্ট্রিও) আর কখনো
    // দেখা যেত না। এখন সবসময় প্রথমে চ্যাপ্টার-তালিকা দেখানো হয়; ফাইল-
    // বেইজড এন্ট্রিতে ক্লিক করলে প্রিমিয়াম কার্ড UI খোলে, লিংক-বেইজড
    // এন্ট্রিতে ক্লিক করলে আগের মতোই লিংক নতুন ট্যাবে খোলে।
    window.loadKaKhaContent = async function (type) {
        const labels = { ka: 'ক ভান্ডার', kha: 'খ ভান্ডার', cq: 'টাইপ CQ' };
        const container = document.getElementById('categoryContent');
        try {
            const data = await window.safeFetch(`${window.SUPABASE_URL}/rest/v1/ka_kha_cq?select=*&order=sort_order.asc,created_at.desc&limit=100`);
            const filtered = data.filter(d => d.cq_type === type || (!d.cq_type && type === 'ka'));

            if (!filtered.length) {
                container.innerHTML = `<div class="section-header"><div class="section-title">📦 ${labels[type]}</div></div><p style="text-align:center;color:var(--text-secondary);padding:20px;">কোনো কন্টেন্ট নেই</p>`;
                window.switchMode('Category');
                return;
            }

            // একটাই এন্ট্রি থাকলে এবং সেটাতে parsed_content থাকলে — সরাসরি
            // প্রিমিয়াম কার্ড UI-তে দেখানো (অতিরিক্ত ক্লিক এড়াতে)
            if (filtered.length === 1 && filtered[0].parsed_content) {
                renderParsedEntry(container, filtered[0], labels[type]);
                window.switchMode('Category');
                return;
            }

            // একাধিক এন্ট্রি থাকলে — subject অনুযায়ী গ্রুপ করে চ্যাপ্টার-তালিকা
            // দেখানো হয়। ফাইল-বেইজড এন্ট্রিতে একটা "📄" ব্যাজ থাকবে এবং
            // ক্লিক করলে প্রিমিয়াম কার্ড UI খুলবে।
            window.__kcqEntries = window.__kcqEntries || {};
            const grouped = {};
            filtered.forEach(d => {
                const s = d.subject || 'সাধারণ';
                if (!grouped[s]) grouped[s] = [];
                grouped[s].push(d);
                window.__kcqEntries[d.id] = d;
            });

            let html = `<div class="section-header"><div class="section-title">📦 ${labels[type]}</div></div>`;
            Object.keys(grouped).forEach(s => {
                html += `<div style="font-size:12px;color:var(--accent);font-weight:700;margin:8px 0;">📘 ${s}</div>`;
                grouped[s].forEach(d => {
                    const isFile = !!d.parsed_content;
                    const clickAction = isFile
                        ? `window.__kcqOpenEntry('${d.id}','${labels[type]}')`
                        : `window.open('${(d.link_or_file || '#').replace(/'/g, "\\'")}','_blank')`;
                    html += `<div class="list-item" onclick="${clickAction}">
                        <div><div class="list-item-title">📖 ${d.chapter || 'সাধারণ'}${isFile ? ' <span style="font-size:9px;background:rgba(14,122,86,0.15);color:#0E7A56;padding:2px 6px;border-radius:8px;">📄 ফাইল</span>' : ''}</div>
                        <div class="list-item-sub">${[d.year, d.topic].filter(Boolean).join(' | ')} ${isFile ? '✨ প্রিমিয়াম ভিউ' : '🔗 লিংক'}</div></div>
                        <span class="list-item-arrow">→</span></div>`;
                });
            });
            container.innerHTML = html;
            window.switchMode('Category');

        } catch (e) {
            console.error('loadKaKhaContent (premium) error:', e);
            container.innerHTML = `<div class="section-header"><div class="section-title">📦 ${labels[type]}</div></div><p style="text-align:center;color:var(--red);padding:20px;">লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।</p>`;
            window.switchMode('Category');
        }
    };

    // চ্যাপ্টার-তালিকা থেকে কোনো ফাইল-বেইজড এন্ট্রিতে ক্লিক করলে এটা কল হয়
    window.__kcqOpenEntry = function (id, label) {
        const entry = window.__kcqEntries && window.__kcqEntries[id];
        const container = document.getElementById('categoryContent');
        if (!entry || !container) return;
        // ফিরে যাওয়ার বাটন যুক্ত করে প্রিমিয়াম কার্ড UI রেন্ডার করা হচ্ছে
        renderParsedEntry(container, entry, label, true);
    };

})();
