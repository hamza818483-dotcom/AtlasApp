// ============================================================
// গ্লোবাল ন্যাভিগেশন স্ট্যাক
// সম্পূর্ণ আলাদা ফাইল — কোনো এক্সিস্টিং ফাংশন এডিট করা হয়নি।
// সমস্যা যা সমাধান করছে: browser এর window.history.length
// নির্ভরযোগ্য না (পুরো ট্যাবের সব history count করে, app এর
// internal navigation ঠিকমতো বোঝে না)। তাই আমরা sessionStorage-এ
// নিজেদের একটা স্ট্যাক রাখছি — যেখানে App এর ভেতরের প্রতিটা
// page-change push হয়, আর "ফিরে যান" বাটনে ক্লিক করলে ঠিক
// আগের App page-এ (real browser back না করেই) নিয়ে যাওয়া হয়।
//
// ব্যবহার: এই ফাইলটা প্রতিটা page-এ অন্য সব <script> এর ঠিক
// আগে (বা ai.html-এর প্যাটার্ন মেনে head/body শুরুর কাছাকাছি)
// লোড করতে হবে, যাতে এটা সবার আগে রান হয় এবং stack-এ entry বসায়।
//
// FLUTTER_READY: Convert to Dart Navigator stack (Navigator.pop)
// ============================================================

(function () {
    const STACK_KEY = 'atlas_nav_stack_v1';
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const currentFull = currentPage + location.search; // query param সহ ভিন্ন state আলাদা গণনা

    function loadStack() {
        try {
            const raw = sessionStorage.getItem(STACK_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveStack(stack) {
        try {
            sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
        } catch (e) { /* sessionStorage ব্যর্থ হলে চুপচাপ স্কিপ — back button fallback এ চলে যাবে */ }
    }

    let stack = loadStack();

    // ---------- পেজ লোড হওয়ার সাথে সাথে স্ট্যাকে এন্ট্রি যোগ করা ----------
    // "back" চাপার ফলে এই পেজে আসা হলে আগের push টা ডুপ্লিকেট করার
    // দরকার নেই — sessionStorage flag দিয়ে এটা detect করি। এই চেক ও
    // flag-ক্লিয়ারিং সবসময় আগে হওয়া দরকার, তা নাহলে স্ট্যাকের শেষ
    // এন্ট্রি ইতিমধ্যে বর্তমান পেজের সমান থাকলে (যেমন back-navigation
    // টার্গেট পেজেই) flag কখনো ক্লিয়ার হয় না এবং পরবর্তী নতুন
    // navigation-ও ভুলভাবে "back" হিসেবে গণ্য হয়ে push স্কিপ করে।
    const isBackNavigation = sessionStorage.getItem('atlas_nav_going_back') === '1';
    sessionStorage.removeItem('atlas_nav_going_back');

    if (!isBackNavigation) {
        // একই page-এর মধ্যে বারবার ঢোকা (যেমন HSC বাটনে কয়েকবার ক্লিক) হলে
        // স্ট্যাকে ডুপ্লিকেট এন্ট্রি জমতে দেওয়া হবে না — শুধু query বদলালে নতুন এন্ট্রি।
        const currentBase = currentPage;
        const lastFull = stack.length ? stack[stack.length - 1] : null;
        const lastBase = lastFull ? lastFull.split('?')[0] : null;
        if (stack.length === 0 || lastFull !== currentFull) {
            // আগের এন্ট্রি যদি একই পেজ হয় (query ভিন্ন হলেও), সেটাকে replace করো —
            // যাতে exam.html-এর ভেতরের একাধিক ভিজিট স্ট্যাকে একগাদা এন্ট্রি না বানায়
            // এবং back চাপলে সরাসরি exam.html-এর *আগের* আসল পেজে চলে যায়।
            if (lastBase === currentBase) {
                stack[stack.length - 1] = currentFull;
            } else {
                stack.push(currentFull);
            }
            if (stack.length > 30) stack = stack.slice(stack.length - 30);
            saveStack(stack);
        }
    }

    // ---------- গ্লোবাল ব্যাক ফাংশন (window.goBackGlobal ওভাররাইড) ----------
    // প্রতিটা পেজের নিজস্ব goBackGlobal (history.back() ভিত্তিক) এর বদলে
    // এটা ব্যবহার হবে — যেহেতু এই ফাইল সেই ইনলাইন ফাংশনের *পরে* লোড হয়
    // (body শেষে script include), তাই এই সংজ্ঞাটাই শেষ পর্যন্ত থাকবে।
    window.goBackGlobal = function () {
        const currentStack = loadStack();

        if (currentStack.length > 1) {
            currentStack.pop(); // বর্তমান পেজ বাদ
            const target = currentStack[currentStack.length - 1];
            saveStack(currentStack);
            sessionStorage.setItem('atlas_nav_going_back', '1');
            location.href = target;
        } else {
            // স্ট্যাকে আগের কোনো App পেজ না থাকলে (যেমন সরাসরি লিংক/নোটিফিকেশন
            // থেকে প্রবেশ করেছে), নিরাপদ ডিফল্ট হিসেবে হোম পেজে পাঠানো হয়
            location.href = 'index.html';
        }
    };

    // ---------- goTo / navigateTo এর সাথে সামঞ্জস্য ----------
    // প্রতিটা পেজের বিদ্যমান goTo(url) ফাংশন already location.href পরিবর্তন
    // করে, যেটা স্বয়ংক্রিয়ভাবে নতুন পেজ লোডের সময় উপরের push লজিক চালাবে।
    // তাই goTo/navigateTo এ আলাদা কোনো পরিবর্তনের দরকার নেই — এই ফাইলটা
    // pure-ভাবে "পেজ লোড হলে push করো, back চাপলে pop করে আগের পেজে যাও"
    // এই behavior-টুকুই যোগ করে, বাকি সব navigation যেমন ছিল তেমনই থাকে।
})();

// ============================================================
// GLOBAL STUCK-PAGE WATCHDOG
// সমস্যা: কোনো page-এ ডাটা লোড হতে দেরি হলে (স্লো নেট/সার্ভার ডাউন)
// loading spinner অনন্তকাল ধরে ঘুরতে থাকে, page effectively stuck
// দেখায়। এটা কোনো existing fetch/logic touch করে না — শুধু ১২
// সেকেন্ড পরও যদি স্ক্রিনে "লোড হচ্ছে/Loading" টাইপ টেক্সট visible
// থাকে, একটা非-blocking "রিলোড করো" hint দেখায় যাতে user আটকে না
// থাকে। Reload করলে page fresh state-এ শুরু হবে, স্টাক থাকবে না।
// ============================================================
(function () {
    const HINT_ID = 'atlas-stuck-hint';
    const CHECK_AFTER_MS = 12000;

    function looksLikeLoadingText(el) {
        const t = (el.textContent || '').trim();
        if (!t || t.length > 60) return false;
        return /লোড হচ্ছে|Loading\.\.\.|লোডিং|⏳/i.test(t);
    }

    function isVisible(el) {
        if (!el || !el.getClientRects().length) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }

    function showStuckHint() {
        if (document.getElementById(HINT_ID)) return;
        const bar = document.createElement('div');
        bar.id = HINT_ID;
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
            'background:#1a1a2e;color:#fff;padding:12px 16px;display:flex;' +
            'align-items:center;justify-content:space-between;gap:10px;' +
            'font-family:inherit;font-size:13px;box-shadow:0 -2px 12px rgba(0,0,0,.3);';
        bar.innerHTML = '<span>⏳ লোড হতে দেরি হচ্ছে, নেট চেক করো</span>' +
            '<button style="background:#7C83FF;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-weight:700;font-family:inherit;cursor:pointer;" onclick="location.reload()">রিলোড</button>';
        document.body.appendChild(bar);
    }

    window.addEventListener('load', function () {
        setTimeout(function () {
            try {
                const candidates = document.querySelectorAll('body *');
                for (let i = 0; i < candidates.length; i++) {
                    const el = candidates[i];
                    if (el.children.length === 0 && isVisible(el) && looksLikeLoadingText(el)) {
                        showStuckHint();
                        return;
                    }
                }
            } catch (_) { /* কোনো কারণে fail করলে চুপচাপ স্কিপ — মূল page-এ কোনো প্রভাব পড়বে না */ }
        }, CHECK_AFTER_MS);
    });
})();
