// ============================================================
// ATLAS ADMIN — Zoom Lock Only (no copy-lock, no sidebar-hide)
// admin.html-এর জন্য আলাদা, হালকা সংস্করণ। atlas-ui.js-এর মতো
// pinch-zoom/double-tap-zoom বন্ধ করে, কিন্তু টেক্সট
// সিলেক্ট/কপি বন্ধ করে না — কারণ অ্যাডমিন প্রায়ই ফোন নম্বর,
// ID, ইত্যাদি কপি করতে হয়।
// ============================================================

(function () {
    function applyZoomLock() {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        let viewportTag = document.querySelector('meta[name="viewport"]');
        if (viewportTag && isMobile) {
            viewportTag.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover');
        }

        if (!isMobile) return;

        const style = document.createElement('style');
        style.id = 'atlas-admin-zoom-lock';
        style.textContent = `html, body { touch-action: pan-x pan-y; }`;
        document.head.appendChild(style);

        let lastTouchEnd = 0;
        document.addEventListener('touchend', function (e) {
            const now = Date.now();
            if (now - lastTouchEnd <= 350) e.preventDefault();
            lastTouchEnd = now;
        }, { passive: false });

        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('gesturechange', e => e.preventDefault());

        document.addEventListener('touchmove', function (e) {
            if (e.touches && e.touches.length > 1) e.preventDefault();
        }, { passive: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyZoomLock);
    } else {
        applyZoomLock();
    }
})();
