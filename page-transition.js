/* Instant-feel page transitions (MPA-wide).
   - Fades page in on load (removes white-flash jump cut).
   - Fades page out the instant a nav link/button is clicked, before navigation fires,
     so the click feels immediate instead of "frozen" while the browser loads the next page.
   - Prefetches same-origin .html links on hover/touchstart so the next page is often
     already cached by the time the click happens.
*/
(function () {
    var style = document.createElement('style');
    style.textContent =
        'html.pt-ready body{animation:pt-fade-in .15s ease both}' +
        '@keyframes pt-fade-in{from{opacity:0}to{opacity:1}}' +
        'body.pt-leaving{opacity:0!important;transition:opacity .12s ease;pointer-events:none}';
    document.head.appendChild(style);
    document.documentElement.classList.add('pt-ready');

    var prefetched = Object.create(null);
    function prefetch(href) {
        if (!href || prefetched[href]) return;
        prefetched[href] = true;
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
    }

    function isSameOriginHtml(a) {
        try {
            var url = new URL(a.href, location.href);
            return url.origin === location.origin && /\.html($|[?#])/.test(url.pathname + (url.search || ''));
        } catch (e) { return false; }
    }

    document.addEventListener('mouseover', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (a && isSameOriginHtml(a)) prefetch(a.href);
    }, { passive: true });

    document.addEventListener('touchstart', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (a && isSameOriginHtml(a)) prefetch(a.href);
    }, { passive: true });

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || e.defaultPrevented) return;
        if (a.target === '_blank' || a.hasAttribute('download')) return;
        if (!isSameOriginHtml(a)) return;
        document.body.classList.add('pt-leaving');
    }, true);

    // Expose a helper so inline onclick="location.href=...' navigations
    // can also get the instant fade-out feel: goTo('page.html')
    // (skip if the page already defines its own goTo — don't override page-specific logic)
    if (typeof window.goTo !== 'function') {
        window.goTo = function (href) {
            document.body.classList.add('pt-leaving');
            setTimeout(function () { location.href = href; }, 90);
        };
    }
})();
