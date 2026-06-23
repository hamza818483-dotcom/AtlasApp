// ============================================================
// ATLAS APP — গ্লোবাল UI কন্ট্রোল
// একটা আলাদা ফাইল, সব পেজে include হবে। এই ফাইল কোনো existing
// HTML/CSS ফাইল মোডিফাই করে না — শুধু রানটাইমে DOM/CSS এ ছোট
// adjustments করে, তাই বিদ্যমান কোনো ফাংশন/স্টাইল ভাঙে না।
//
// এই ফাইল ৩টা কাজ করে:
//   ১. Home page (index.html) ছাড়া অন্য কোনো পেজে সাইডবার/হ্যামবার্গার
//      দেখাবে না (DOM থেকে remove করা হয় না — শুধু CSS দিয়ে hide,
//      যাতে কোনো পেজের JS যদি sidebar element reference করে, সেটা
//      এরর না দেয়)
//   ২. "ATLAS APP" টেক্সটে subtle shimmer/color-shift অ্যানিমেশন
//   ৩. মোবাইলে zoom বন্ধ + টেক্সট কপি বন্ধ (ডেস্কটপে zoom স্বাভাবিক থাকে)
// FLUTTER_READY: Convert to Dart AppBar/Drawer conditional rendering
// ============================================================

(function () {
    const HOME_PAGE = 'index.html';

    function currentPage() {
        const p = location.pathname.split('/').pop();
        return p === '' ? HOME_PAGE : p;
    }

    const isHome = currentPage() === HOME_PAGE;

    // ---------- ১. সাইডবার/হ্যামবার্গার শুধু Home এ ----------
    function injectVisibilityStyle() {
        if (isHome) return; // হোম পেজে কিছু লুকানোর দরকার নেই
        const style = document.createElement('style');
        style.id = 'atlas-sidebar-restrict';
        style.textContent = `
            .sidebar, .sidebar-overlay, .hamburger { display: none !important; }
        `;
        document.head.appendChild(style);

        // toggleSidebar() কল হলে যেন এরর না দেয় (অনেক পেজের কোডে এখনো
        // onclick="toggleSidebar()" বাটন থাকতে পারে অন্য জায়গায়) —
        // safe no-op override
        window.toggleSidebar = function () { /* non-home পেজে সাইডবার নিষ্ক্রিয় */ };
        window.closeSidebar = function () { /* non-home পেজে সাইডবার নিষ্ক্রিয় */ };
    }

    // ---------- ১ক. Home পেজে "ফিরে যান" বাটন দেখাবে না ----------
    // হোম পেজ অ্যাপের শুরুর পয়েন্ট — এখান থেকে আর "ফিরে" যাওয়ার কিছু নেই,
    // তাই এই বাটনটা এখানে অপ্রয়োজনীয়। বাকি সব পেজে এটা স্বাভাবিকভাবে থাকবে।
    function hideBackButtonOnHome() {
        if (!isHome) return;
        const style = document.createElement('style');
        style.id = 'atlas-home-backbtn-hide';
        style.textContent = `
            .global-back-btn { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    // ---------- ২. ATLAS APP টেক্সট শিমার অ্যানিমেশন ----------
    function injectShimmerStyle() {
        if (document.getElementById('atlas-shimmer-style')) return;
        const style = document.createElement('style');
        style.id = 'atlas-shimmer-style';
        style.textContent = `
            .atlas-brand-text, .sidebar-logo, .logo-text {
                background: linear-gradient(90deg,
                    var(--text, #E5F2EC) 0%,
                    var(--accent, #0E7A56) 25%,
                    var(--text, #E5F2EC) 50%,
                    var(--accent, #0E7A56) 75%,
                    var(--text, #E5F2EC) 100%);
                background-size: 200% auto;
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
                color: transparent;
                animation: atlasShimmer 3.5s linear infinite;
                font-weight: 800;
                letter-spacing: 0.3px;
            }
            @keyframes atlasShimmer {
                0%   { background-position: 200% center; }
                100% { background-position: -200% center; }
            }
        `;
        document.head.appendChild(style);
    }

    // ---------- ৩. Zoom লক (মোবাইল) + টেক্সট কপি বন্ধ ----------
    function applyZoomAndCopyLock() {
        // viewport meta ট্যাগ আপডেট — মোবাইলে pinch-zoom বন্ধ, ডেস্কটপে
        // ব্রাউজার নিজের zoom (Ctrl+/Ctrl-) ব্যবহার করতে পারবে কারণ সেটা
        // viewport-নির্ভর না, OS/ব্রাউজার লেভেলের zoom।
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        let viewportTag = document.querySelector('meta[name="viewport"]');
        if (viewportTag && isMobile) {
            viewportTag.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover');
        }
        // ডেস্কটপে viewport tag স্পর্শ করা হচ্ছে না — zoom স্বাভাবিক থাকবে

        // টেক্সট কপি/সিলেক্ট বন্ধ (ডেস্কটপ ও মোবাইল উভয়ে — শুধু পড়া যাবে, কপি না)
        const style = document.createElement('style');
        style.id = 'atlas-copy-lock';
        style.textContent = `
            * {
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
            /* ইনপুট/টেক্সটএরিয়াতে সিলেক্ট/টাইপ স্বাভাবিক থাকবে — না হলে ইউজার কিছু লিখতে পারবে না */
            input, textarea, [contenteditable="true"] {
                -webkit-user-select: text;
                -moz-user-select: text;
                -ms-user-select: text;
                user-select: text;
            }
            ${isMobile ? `
            /* মোবাইলে pinch-zoom/gesture দিয়ে স্কেল করা বন্ধ — শুধু স্বাভাবিক স্ক্রল চলবে।
               viewport meta ট্যাগ একা যথেষ্ট না (Android-এর "Force enable zoom"
               accessibility সেটিং সেটা override করতে পারে), তাই CSS touch-action
               দিয়েও আটকানো হচ্ছে — এটা accessibility সেটিং দ্বারা override হয় না। */
            html, body {
                touch-action: pan-x pan-y;
            }
            ` : ''}
        `;
        document.head.appendChild(style);

        if (isMobile) {
            // ডাবল-ট্যাপ জুম বন্ধ — কিছু Android ব্রাউজারে viewport meta এটা পুরোপুরি
            // আটকায় না, তাই দ্রুত পরপর দুইটা ট্যাপ হলে দ্বিতীয়টার ডিফল্ট আচরণ বাতিল করা হয়
            let lastTouchEnd = 0;
            document.addEventListener('touchend', function (e) {
                const now = Date.now();
                if (now - lastTouchEnd <= 350) {
                    e.preventDefault();
                }
                lastTouchEnd = now;
            }, { passive: false });

            // দুই আঙুলের পিঞ্চ-জেসচার (gesturestart/gesturechange — iOS Safari) সরাসরি বন্ধ
            document.addEventListener('gesturestart', e => e.preventDefault());
            document.addEventListener('gesturechange', e => e.preventDefault());

            // মাল্টি-টাচ পিঞ্চ-জুম (Android Chrome সহ সব মোবাইল ব্রাউজার) — দুই বা
            // তার বেশি আঙুল দিয়ে স্পর্শ করলে ডিফল্ট pinch-zoom আচরণ আটকানো হয়
            document.addEventListener('touchmove', function (e) {
                if (e.touches && e.touches.length > 1) {
                    e.preventDefault();
                }
            }, { passive: false });
        }
    }

    // ---------- ৪. মিসিং "ফিরে যান" বাটন যোগ করা (যেসব পেজে নেই) ----------
    function ensureBackButton() {
        if (isHome) return; // হোম পেজে ব্যাক বাটনের দরকার নেই
        const headerLeft = document.querySelector('.header-left');
        if (!headerLeft) return; // এই পেজে স্ট্যান্ডার্ড header কাঠামো নেই, স্কিপ
        if (headerLeft.querySelector('.global-back-btn')) return; // ইতিমধ্যে আছে

        // CSS না থাকলে ইনজেক্ট করা (যেসব পেজে এই ক্লাস কখনো ডিফাইন করা হয়নি)
        if (!document.getElementById('atlas-backbtn-style')) {
            const style = document.createElement('style');
            style.id = 'atlas-backbtn-style';
            style.textContent = `
                .global-back-btn {
                    background: none; border: none; color: var(--text, #E5F2EC);
                    font-size: 20px; cursor: pointer; padding: 6px 4px 6px 2px; line-height:1;
                }
                .global-back-btn:active { opacity: 0.6; }
            `;
            document.head.appendChild(style);
        }

        const btn = document.createElement('button');
        btn.className = 'global-back-btn';
        btn.setAttribute('onclick', 'goBackGlobal()');
        btn.setAttribute('title', 'ফিরে যান');
        btn.setAttribute('aria-label', 'ফিরে যান');
        btn.textContent = '←';
        headerLeft.insertBefore(btn, headerLeft.firstChild);
    }

    // ---------- ইনিশিয়ালাইজ ----------
    function init() {
        injectVisibilityStyle();
        hideBackButtonOnHome();
        injectShimmerStyle();
        applyZoomAndCopyLock();
        ensureBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
