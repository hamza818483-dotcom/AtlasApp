// ============================================================
// ImgBB Multi-Key Upload Manager
// সম্পূর্ণ আলাদা ফাইল — কোনো এক্সিস্টিং কোড স্পর্শ করা হয়নি।
// কাজ: একাধিক ImgBB API key থেকে স্বয়ংক্রিয়ভাবে একটা সচল key
// বেছে আপলোড করা, quota শেষ হলে পরের key-তে fallback করা,
// এবং সমস্যা হলে admin-কে notification পাঠানো।
//
// ⚠️ গুরুত্বপূর্ণ: এই ফাইলে কোনো real API key হার্ডকোড করা নেই।
// আসল key গুলো নিচের IMGBB_KEYS অ্যারেতে অ্যাডমিন নিজে বসাবে,
// অথবা আরও ভালো — একটা আলাদা config ফাইল থেকে লোড করবে যেটা
// .gitignore-এ থাকবে, যাতে key কখনো GitHub-এ পাবলিকলি না যায়।
// FLUTTER_READY: Convert to Dart ImgBB service class
// ============================================================

const ImgBBManager = (function () {

    // ---------- KEY SOURCE ----------
    // এই অ্যারে খালি রাখা হয়েছে ইচ্ছাকৃতভাবে। অ্যাডমিন প্যানেল থেকে
    // অথবা window.IMGBB_CONFIG_KEYS (config.js, gitignored) থেকে key লোড হবে।
    // চাইলে সরাসরি নিচে বসাতে পারো — কিন্তু তাহলে .gitignore নিশ্চিত করো।
    let KEYS = (window.IMGBB_CONFIG_KEYS && Array.isArray(window.IMGBB_CONFIG_KEYS))
        ? window.IMGBB_CONFIG_KEYS.slice()
        : [];

    const STORAGE_KEY = 'imgbb_key_status_v1'; // localStorage-এ key-ভিত্তিক স্ট্যাটাস ক্যাশ
    const UPLOAD_ENDPOINT = 'https://api.imgbb.com/1/upload';

    function loadStatus() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function saveStatus(status) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
        } catch (e) { /* ignore quota errors on localStorage itself */ }
    }

    // একটা key-কে "exhausted" (quota শেষ) চিহ্নিত করা
    function markExhausted(key) {
        const status = loadStatus();
        status[key] = { exhausted: true, markedAt: Date.now() };
        saveStatus(status);
    }

    function isExhausted(key) {
        const status = loadStatus();
        const entry = status[key];
        if (!entry || !entry.exhausted) return false;
        // ImgBB-র quota সাধারণত প্রতিদিন রিসেট হয় — তাই ২৪ ঘণ্টা পর আবার ট্রাই করা হবে
        const dayMs = 24 * 60 * 60 * 1000;
        if (Date.now() - entry.markedAt > dayMs) {
            delete status[key];
            saveStatus(status);
            return false;
        }
        return true;
    }

    function getHealthyKeys() {
        return KEYS.filter(k => !isExhausted(k));
    }

    function setKeys(keysArray) {
        KEYS = Array.isArray(keysArray) ? keysArray.slice() : [];
    }

    // ---------- আসল আপলোড লজিক (multi-key fallback সহ) ----------
    // imageUrl: যে ছবিটা re-host করতে হবে (mhtml ফাইল থেকে পাওয়া external লিংক)
    // রিটার্ন করে নতুন ImgBB ডিসপ্লে URL, অথবা সব key ব্যর্থ হলে throw করে
    async function uploadFromUrl(imageUrl) {
        const healthyKeys = getHealthyKeys();
        if (healthyKeys.length === 0) {
            await notifyAdmin(
                '🔴 ImgBB: সব Key শেষ',
                'সব ImgBB API key-এর quota শেষ হয়ে গেছে। নতুন key যোগ করুন অ্যাডমিন প্যানেল থেকে।'
            );
            throw new Error('NO_HEALTHY_IMGBB_KEYS');
        }

        let lastError = null;
        for (const key of healthyKeys) {
            try {
                const formData = new FormData();
                formData.append('key', key);
                formData.append('image', imageUrl); // ImgBB সরাসরি external URL-ও নেয়

                const res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: formData });
                const data = await res.json();

                if (data && data.success && data.data && data.data.url) {
                    return data.data.url;
                }

                // ImgBB quota/rate-limit হলে এরর মেসেজে বোঝা যায়
                const errMsg = (data && data.error && data.error.message) || 'Unknown ImgBB error';
                if (/limit|quota|exceed/i.test(errMsg)) {
                    markExhausted(key);
                    lastError = errMsg;
                    continue; // পরের key দিয়ে আবার চেষ্টা
                }
                lastError = errMsg;
            } catch (e) {
                lastError = e.message;
                // নেটওয়ার্ক এরর হলে এই key বাদ না দিয়ে পরের key ট্রাই করি
                continue;
            }
        }

        // সব healthy key ট্রাই করেও ব্যর্থ হলে admin-কে জানানো
        await notifyAdmin(
            '🔴 ImgBB Upload ব্যর্থ',
            `ছবি আপলোড ব্যর্থ হয়েছে। শেষ এরর: ${lastError || 'unknown'}`
        );
        throw new Error('IMGBB_UPLOAD_FAILED: ' + (lastError || 'unknown'));
    }

    // ---------- Admin Notification (বিদ্যমান notifications টেবিল ব্যবহার করে) ----------
    // অ্যাডমিনের ড্যাশবোর্ডে ইতিমধ্যে থাকা নোটিফিকেশন সিস্টেমের মাধ্যমেই
    // এই এরর পৌঁছাবে — কোনো নতুন টেবিল তৈরি করা হয়নি।
    async function notifyAdmin(title, message) {
        if (!window.SUPABASE_URL || !window.ADMIN_PHONE) return; // নির্ভরতা না থাকলে চুপচাপ স্কিপ
        try {
            await fetch(`${window.SUPABASE_URL}/rest/v1/notifications`, {
                method: 'POST',
                headers: {
                    'apikey': window.SUPABASE_KEY,
                    'Authorization': `Bearer ${window.SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: window.ADMIN_PHONE,
                    title,
                    message,
                    type: 'system_error',
                    is_read: false
                })
            });
        } catch (e) {
            console.error('Admin notify failed:', e.message);
        }
    }

    return {
        setKeys,
        uploadFromUrl,
        getHealthyKeys,
        notifyAdmin,
        _debug: { loadStatus, markExhausted, isExhausted }
    };
})();

window.ImgBBManager = ImgBBManager;
