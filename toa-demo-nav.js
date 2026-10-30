/* ─────────────────────────────────────────────────────────────────────────────
   [TOA DEMO] Noise dropdown for the demo_toa portal navbar
   ─────────────────────────────────────────────────────────────────────────────
   Every portal page keeps its normal navbar HTML. After sign-in, each page calls
       window.toaDemoNav(profile.airport)
   and only when the airport is 'demo_toa' this replaces the "Noise Abatement"
   link with a "Noise ▾" item that opens Abatement / Monitoring. A separate
   "Noise Monitoring" link, if a page has one, is folded into the same menu.
   Every other account (POU, PNS, OWD, admin) sees the navbar unchanged.

   Opens on hover (desktop), with click / tap as a fallback (iPad, phone).
   Styling is injected from here so style.css doesn't change.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
    const CSS = `
        .toa-nav-dd { position: relative; }
        .nav-links li a.toa-nav-dd-toggle { cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
        .toa-nav-dd-caret { font-size: 0.7em; transition: transform 0.15s ease; }
        .toa-nav-dd.open .toa-nav-dd-caret,
        .toa-nav-dd:hover .toa-nav-dd-caret { transform: rotate(180deg); }
        .toa-nav-dd-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            padding-top: 10px;          /* invisible bridge so the menu stays open while the mouse moves down to it */
            z-index: 5000;
            list-style: none;
            margin: 0;
        }
        .toa-nav-dd-panel {
            background: #fff;
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
            padding: 6px 0;
            min-width: 160px;
        }
        .toa-nav-dd:hover .toa-nav-dd-menu,
        .toa-nav-dd:focus-within .toa-nav-dd-menu,
        .toa-nav-dd.open .toa-nav-dd-menu { display: block; }
        .nav-links .toa-nav-dd-panel a {
            display: block;
            padding: 8px 18px;
            font-size: 1rem;
            color: #333;
        }
        .nav-links .toa-nav-dd-panel a:hover { background: #f5f7fb; color: #1867bc; }
        .nav-links .toa-nav-dd-panel a.toa-nav-dd-current { color: #1867bc; font-weight: 600; }
        @media (max-width: 768px) {
            .nav-links .toa-nav-dd-panel a { font-size: 0.9rem; }
        }
    `;

    let done = false;

    window.toaDemoNav = function (airport) {
        if (airport !== 'demo_toa' || done) return;
        const abatementLink = document.querySelector('.nav-links a[href="noiseabatement.html"]');
        if (!abatementLink) return;
        done = true;

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const here = (location.pathname.split('/').pop() || '').toLowerCase();
        const item = (href, label) =>
            `<a href="${href}"${here === href ? ' class="toa-nav-dd-current"' : ''}>${label}</a>`;

        const li = document.createElement('li');
        li.className = 'toa-nav-dd';
        li.innerHTML =
            `<a href="#" class="toa-nav-dd-toggle" aria-haspopup="true" aria-expanded="false">Noise <span class="toa-nav-dd-caret">\u25BE</span></a>` +
            `<div class="toa-nav-dd-menu"><div class="toa-nav-dd-panel">` +
                item('noiseabatement.html', 'Abatement') +
                item('noisemonitoring.html', 'Monitoring') +
            `</div></div>`;
        abatementLink.closest('li').replaceWith(li);

        // a page that also lists "Noise Monitoring" on its own: it now lives in the menu
        const monitoringLink = document.querySelector('.nav-links > li > a[href="noisemonitoring.html"]');
        if (monitoringLink) monitoringLink.closest('li').remove();

        // [REPORTS] Reports link at the end of the menu (demo account only, like the dropdown)
        if (!document.querySelector('.nav-links > li > a[href="reports.html"]')) {
            const rli = document.createElement('li');
            rli.innerHTML = `<a href="reports.html"${here === 'reports.html' ? ' style="color:#1867bc;"' : ''}>Reports</a>`;
            document.querySelector('.nav-links').appendChild(rli);
        }

        // click / tap fallback
        const toggle = li.querySelector('.toa-nav-dd-toggle');
        toggle.addEventListener('click', e => {
            e.preventDefault();
            const open = li.classList.toggle('open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (!open) toggle.blur();   // otherwise keyboard focus would hold it open
        });
        document.addEventListener('click', e => {
            if (!li.contains(e.target)) { li.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { li.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.blur(); }
        });
    };
})();