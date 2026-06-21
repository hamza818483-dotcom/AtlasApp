// ============================================================
// ক, খ, CQ — ফাইল আপলোড ফিচার (অ্যাডমিন সাইড)
// সম্পূর্ণ আলাদা ফাইল। admin.html-এর কোনো এক্সিস্টিং ফাংশন/ভ্যারিয়েবল
// মোডিফাই করা হয়নি — শুধু window.safeFetch, window.showToast,
// window.SUPABASE_URL ইত্যাদি গ্লোবাল রেফারেন্স ব্যবহার করা হয়েছে,
// যেগুলো admin.html আগে থেকেই define করে।
//
// নির্ভরতা (এই ফাইলের আগে লোড হতে হবে):
//   1. admin.html নিজেই (safeFetch, showToast, SUPABASE_URL ইত্যাদির জন্য)
//   2. kakhacq/kakhacq-parser.js
//   3. kakhacq/imgbb-manager.js
//   4. kakhacq/imgbb-config.js (ঐচ্ছিক, না থাকলে ImgBB ফিচার স্কিপ হবে)
// FLUTTER_READY: Convert to Dart upload screen controller
// ============================================================

(function () {

    // ---------- UI ইনজেকশন ----------
    // admin.html-এর "ক,খ,CQ" সেকশনে বিদ্যমান "লিংক / ফাইল URL" ইনপুটের
    // ঠিক নিচে একটা নতুন ফাইল-আপলোড অপশন বসানো হচ্ছে। এক্সিস্টিং
    // লিংক ইনপুট অক্ষুণ্ণ থাকছে — অ্যাডমিন চাইলে লিংক বা ফাইল, যেকোনো
    // একটা ব্যবহার করতে পারবে।
    function injectUploadUI() {
        const linkGroup = document.getElementById('kaLink');
        if (!linkGroup) return; // admin.html এখনো লোড না হলে চুপচাপ স্কিপ
        if (document.getElementById('kaFileUploadBox')) return; // ডাবল-ইনজেকশন প্রতিরোধ

        const wrapper = document.createElement('div');
        wrapper.id = 'kaFileUploadBox';
        wrapper.style.cssText = 'margin-top:10px;padding:14px;border:2px dashed var(--accent,#0E7A56);border-radius:12px;background:rgba(14,122,86,0.06);';
        wrapper.innerHTML = `
            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">
                📤 অথবা mhtml/html ফাইল আপলোড করুন (অটো-পার্স হবে)
            </label>
            <input type="file" id="kaFileInput" accept=".mhtml,.html,.htm" style="width:100%;font-size:13px;">
            <div id="kaFileUploadStatus" style="margin-top:8px;font-size:12px;color:var(--text2,#888);"></div>
            <button type="button" id="kaFileUploadBtn" class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;" disabled>
                ⚡ পার্স করে সেইভ করুন
            </button>
        `;
        linkGroup.closest('.input-group').insertAdjacentElement('afterend', wrapper);

        document.getElementById('kaFileInput').addEventListener('change', onFileSelected);
        document.getElementById('kaFileUploadBtn').addEventListener('click', onUploadClick);
    }

    let selectedFile = null;

    function onFileSelected(e) {
        selectedFile = e.target.files[0] || null;
        const btn = document.getElementById('kaFileUploadBtn');
        const status = document.getElementById('kaFileUploadStatus');
        if (selectedFile) {
            btn.disabled = false;
            status.textContent = `নির্বাচিত: ${selectedFile.name}`;
        } else {
            btn.disabled = true;
            status.textContent = '';
        }
    }

    // ---------- মূল আপলোড + পার্স + সেইভ ফ্লো ----------
    async function onUploadClick() {
        if (!selectedFile) return;

        const subject = document.getElementById('kaSubject').value.trim();
        const chapter = document.getElementById('kaChapter').value.trim();
        const year = document.getElementById('kaYear').value.trim();
        const topic = document.getElementById('kaTopic').value.trim();
        const type = document.getElementById('kaType').value; // 'ka' | 'kha' | 'cq'

        if (!subject || !chapter) {
            window.showToast('⚠️ সাবজেক্ট ও চ্যাপ্টার আগে পূরণ করুন');
            return;
        }

        const status = document.getElementById('kaFileUploadStatus');
        const btn = document.getElementById('kaFileUploadBtn');
        btn.disabled = true;

        try {
            status.textContent = '⏳ ফাইল পার্স করা হচ্ছে...';
            const parsed = await window.KaKhaCQParser.parseFile(selectedFile, type);

            status.textContent = `🖼️ ছবি প্রসেস করা হচ্ছে (০/${countImages(parsed)})...`;
            await resolveImages(parsed, (done, total) => {
                status.textContent = `🖼️ ছবি প্রসেস করা হচ্ছে (${done}/${total})...`;
            });

            status.textContent = '💾 সেইভ করা হচ্ছে...';
            const saved = await saveToSupabase(parsed, { subject, chapter, year, topic, type });

            status.textContent = `✅ সম্পন্ন! ${parsed.items.length}টি প্রশ্ন যোগ হয়েছে।`;
            window.showToast(`✅ ${parsed.items.length}টি প্রশ্ন সফলভাবে যোগ হয়েছে`);

            // ইনপুট রিসেট
            selectedFile = null;
            document.getElementById('kaFileInput').value = '';

            // নিচের "তালিকা" সেকশনে নতুন এন্ট্রি যেন সাথে সাথে দেখা যায়,
            // তার জন্য ফিল্টার ড্রপডাউন এই টাইপে সেট করে দেওয়া হচ্ছে।
            // আগে ফিল্টার অন্য টাইপে সেট থাকলে নতুন এন্ট্রি লিস্টে দেখা যেত না।
            const filterEl = document.getElementById('kaFilterType');
            if (filterEl) filterEl.value = type;
            if (typeof window.loadKaKha === 'function') window.loadKaKha();

        } catch (err) {
            console.error('KaKhaCQ upload error:', err);
            status.textContent = '❌ এরর: ' + err.message;
            window.showToast('❌ ফাইল প্রসেস ব্যর্থ: ' + err.message, 5000);
            await notifyAdminOnError(err, selectedFile?.name, type);
        } finally {
            btn.disabled = false;
        }
    }

    function countImages(parsed) {
        let n = 0;
        parsed.items.forEach(item => {
            if (item.question_images) n += item.question_images.length;
            if (item.answer_images) n += item.answer_images.length;
            if (item.stem_images) n += item.stem_images.length;
            if (item.sub_questions) {
                item.sub_questions.forEach(sq => {
                    if (sq.question_images) n += sq.question_images.length;
                    if (sq.answer_images) n += sq.answer_images.length;
                });
            }
        });
        return n;
    }

    // প্রতিটা item-এর ছবি ImgBB-তে re-upload করে placeholder {{IMG_n}}
    // -গুলোকে আসল ImgBB লিংক দিয়ে রিপ্লেস করে। ImgBB কনফিগার করা না
    // থাকলে (key না থাকলে) মূল external লিংকই রেখে দেওয়া হয়, যাতে
    // পুরো আপলোড আটকে না যায়।
    async function resolveImages(parsed, onProgress) {
        const total = countImages(parsed);
        let done = 0;
        const hasImgBB = window.ImgBBManager && window.ImgBBManager.getHealthyKeys().length > 0;

        async function resolveList(urls) {
            const resolved = [];
            for (const url of urls) {
                if (hasImgBB) {
                    try {
                        const newUrl = await window.ImgBBManager.uploadFromUrl(url);
                        resolved.push(newUrl);
                    } catch (e) {
                        // আপলোড ব্যর্থ হলে অরিজিনাল লিংকেই ফলব্যাক — ফিচার যেন আটকে না যায়
                        resolved.push(url);
                    }
                } else {
                    resolved.push(url);
                }
                done++;
                onProgress(done, total || 1);
            }
            return resolved;
        }

        function applyPlaceholders(text, resolvedUrls) {
            if (!text) return text;
            let result = text;
            resolvedUrls.forEach((url, i) => {
                result = result.split(`{{IMG_${i}}}`).join(url);
            });
            return result;
        }

        for (const item of parsed.items) {
            if (item.question_images && item.question_images.length) {
                const resolved = await resolveList(item.question_images);
                item.question = applyPlaceholders(item.question, resolved);
                item.question_images_resolved = resolved;
            }
            if (item.answer_images && item.answer_images.length) {
                const resolved = await resolveList(item.answer_images);
                item.answer = applyPlaceholders(item.answer, resolved);
                item.answer_images_resolved = resolved;
            }
            if (item.stem_images && item.stem_images.length) {
                const resolved = await resolveList(item.stem_images);
                item.stem = applyPlaceholders(item.stem, resolved);
                item.stem_images_resolved = resolved;
            }
            if (item.sub_questions) {
                for (const sq of item.sub_questions) {
                    if (sq.question_images && sq.question_images.length) {
                        const resolved = await resolveList(sq.question_images);
                        sq.question = applyPlaceholders(sq.question, resolved);
                    }
                    if (sq.answer_images && sq.answer_images.length) {
                        const resolved = await resolveList(sq.answer_images);
                        sq.answer = applyPlaceholders(sq.answer, resolved);
                    }
                }
            }
        }
    }

    // ---------- Supabase-এ সেইভ ----------
    // বিদ্যমান ka_kha_cq টেবিলের স্ট্রাকচার অক্ষুণ্ণ রেখে একটা নতুন
    // কলাম 'parsed_content' (JSON/JSONB) ব্যবহার করা হচ্ছে যেখানে
    // পুরো স্ট্রাকচার্ড ডেটা (questions/answers/images) থাকবে।
    // এক্সিস্টিং লিংক-বেইজড এন্ট্রিগুলো অপরিবর্তিত থাকবে কারণ তাদের
    // এই কলাম খালি (NULL) থাকবে।
    async function saveToSupabase(parsed, meta) {
        const payload = {
            subject: meta.subject,
            chapter: meta.chapter,
            year: meta.year || null,
            topic: meta.topic || null,
            type: meta.type,
            cq_type: meta.type, // exam.html বিদ্যমান ফিল্টার (cq_type) এর সাথে compatible রাখার জন্য
            file_type: 'file',
            parsed_content: JSON.stringify(parsed),
            link_or_file: null // ফাইল-বেইজড এন্ট্রিতে আলাদা লিংকের দরকার নেই
        };

        const result = await window.safeFetch(`${window.SUPABASE_URL}/rest/v1/ka_kha_cq`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // safeFetch সাধারণত non-2xx রেসপন্সে throw করে, কিন্তু Supabase কখনো
        // কখনো 2xx দিয়ে খালি/ভিন্ন array রিটার্ন করতে পারে (যেমন RLS policy
        // insert-কে silently filter করলে)। তাই insert সত্যিই row তৈরি করেছে
        // কিনা সেটা এখানে নিশ্চিত করা হচ্ছে, নাহলে স্পষ্ট এরর দেখানো হবে।
        if (!Array.isArray(result) || !result.length) {
            throw new Error('Supabase থেকে কোনো সেইভড রো ফেরত আসেনি — RLS পলিসি বা parsed_content কলাম মিসিং হতে পারে। supabase-migration.sql রান করা হয়েছে কিনা যাচাই করুন।');
        }
        return result[0];
    }

    // ---------- এরর হলে এডমিনকে নোটিফাই ----------
    async function notifyAdminOnError(err, fileName, type) {
        if (window.ImgBBManager && typeof window.ImgBBManager.notifyAdmin === 'function') {
            await window.ImgBBManager.notifyAdmin(
                '🔴 ক/খ/CQ ফাইল প্রসেসিং এরর',
                `ফাইল: ${fileName || 'unknown'} | টাইপ: ${type} | এরর: ${err.message}`
            );
        }
    }

    // ---------- ইনিশিয়ালাইজ ----------
    // admin.html পুরোপুরি লোড হওয়ার পর UI ইনজেক্ট করা হয়, যাতে
    // kaLink ইনপুট DOM-এ থাকা নিশ্চিত হয়।
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectUploadUI);
    } else {
        injectUploadUI();
    }

    // যদি ট্যাব সুইচিং dynamically সেকশন রি-রেন্ডার করে, সেফটির জন্য
    // একটা ছোট observer — শুধু kakha সেকশনে নজর রাখে।
    const observer = new MutationObserver(() => {
        if (document.getElementById('secKakha') && !document.getElementById('kaFileUploadBox')) {
            injectUploadUI();
        }
    });
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

})();
