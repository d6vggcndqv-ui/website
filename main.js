// ── Camera / footage matching (POU only) ─────────────────────
// Matches Firestore flight events to camera events captured by the
// autonomous camera system at fltech-p2, and renders a small camera
// icon linking to the footage when a match is found.

const CAMERA_API_BASE = 'https://fltech-p2.tailf2088d.ts.net';
const CAMERA_API_KEY  = '9fd29c198dc4214cc570e438eb37c09fe53d3687842a5014d9f0671411a0eda6';

/**
 * Look up a camera event matching a flight record.
 * @param {string} registration - aircraft registration (e.g. "N779WM")
 * @param {string} isoTimestamp - UTC ISO string from Firestore, e.g. "2026-07-31T15:56:15.076Z"
 * @param {number} windowSeconds - tolerance window around the timestamp (default 60s)
 * @returns {Promise<object|null>} the matched event object, or null if none found
 */
async function findCameraEvent(registration, isoTimestamp, windowSeconds = 60) {
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return null;

    const params = new URLSearchParams({
        year:   d.getUTCFullYear(),
        month:  d.getUTCMonth() + 1,
        day:    d.getUTCDate(),
        hour:   d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        registration:   registration,
        window_seconds: windowSeconds,
        api_key:        CAMERA_API_KEY,
    });

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAYS_MS = [500, 1000]; // delay before attempt 2 and attempt 3

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const res = await fetch(`${CAMERA_API_BASE}/events?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data.total > 0 ? data.events[0] : null;
        } catch (e) {
            const isLastAttempt = attempt === MAX_ATTEMPTS;
            console.warn(`Camera lookup failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, e);
            if (isLastAttempt) return null;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
        }
    }
}

/**
 * Builds the HTML for a small camera icon linking to footage for a given event id.
 * Uses api_key as a query param (not a header) so it works as a plain link.
 * @param {number|string} eventId
 * @returns {string} HTML string for the icon link
 */
function cameraIconHtml(eventId) {
    return `<a href="${CAMERA_API_BASE}/events/${eventId}/thumbnail?api_key=${CAMERA_API_KEY}" target="_blank" title="View photo or video" style="text-decoration:none;font-size:11px;color:#0057ff;margin-left:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0057ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M3 7h3l2-3h8l2 3h3v13H3z"></path><circle cx="12" cy="13" r="4"></circle></svg></a>`;
}

/**
 * Fetches a camera video as a blob (bypassing the cross-origin limitation on the
 * `download` attribute) and triggers a browser save dialog for it.
 * @param {number|string} eventId
 * @param {HTMLElement} linkEl - the clicked icon link, used to show a temporary "Downloading..." state
 */
async function downloadCameraVideo(eventId, linkEl) {
    const originalHtml = linkEl.innerHTML;
    linkEl.innerHTML = '⏳';
    try {
        const res = await fetch(`${CAMERA_API_BASE}/events/${eventId}/video?api_key=${CAMERA_API_KEY}`);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `event-${eventId}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    } catch (e) {
        console.warn('Camera video download failed:', e);
        alert('Could not download footage. Please try again.');
    } finally {
        linkEl.innerHTML = originalHtml;
    }
}

// Event delegation: handles clicks on any camera download icon, since icons
// are injected dynamically after initial page render.
// TEMPORARILY DISABLED while testing plain-link behavior:
// document.addEventListener('click', (e) => {
//     const link = e.target.closest('[data-camera-download]');
//     if (!link) return;
//     e.preventDefault();
//     downloadCameraVideo(link.getAttribute('data-camera-download'), link);
// });

/**
 * For each row in a rendered page, kicks off a camera lookup and fills in
 * the matching row's placeholder slot (identified by data-camera-slot="<docId>")
 * with a camera icon if a match is found. Silently no-ops on rows with no match,
 * or if the slot has since been removed from the DOM (e.g. pagination changed).
 * @param {Array<{docId: string, registration: string, timestamp: string}>} pageRows
 */
function attachCameraIcons(pageRows) {
    pageRows.forEach(r => {
        findCameraEvent(r.registration, r.timestamp, 60).then(event => {
            if (!event) return;
            if (event.registration && event.registration.toUpperCase() !== r.registration.toUpperCase()) {
                console.warn(`Camera event registration mismatch: expected ${r.registration}, got ${event.registration}`);
                return;
            }
            const slot = document.querySelector(`[data-camera-slot="${r.docId}"]`);
            if (!slot) return; // page changed since lookup started
            slot.innerHTML = cameraIconHtml(event.id);
        });
    });
}

// ── Camera icon: Photo / Video chooser popover (ADDED) ───────
// Intercepts clicks on camera icons injected by attachCameraIcons()
// and shows a small popover anchored under the icon offering:
//   Photo → opens the existing thumbnail URL in a new tab
//   Video → same URL with "/thumbnail?" replaced by "/video?"
// Additive only: relies on the existing [data-camera-slot] markup.

let cameraChooserEl = null;
let cameraChooserAnchor = null;

function closeCameraChooser() {
    if (cameraChooserEl) cameraChooserEl.remove();
    cameraChooserEl = null;
    cameraChooserAnchor = null;
}

function openCameraChooser(linkEl) {
    closeCameraChooser();

    const photoUrl = linkEl.href;
    const videoUrl = photoUrl.replace('/thumbnail?', '/video?');

    const menu = document.createElement('div');
    menu.setAttribute('data-camera-chooser', '');
    menu.style.cssText =
        'position:absolute;z-index:9999;display:flex;flex-direction:column;' +
        'background:#fff;border:1px solid #d0d7e2;border-radius:6px;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px;min-width:90px;';

    const makeBtn = (label, url) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText =
            'background:none;border:none;padding:6px 12px;text-align:left;' +
            'font-size:12px;color:#222;cursor:pointer;border-radius:4px;';
        b.addEventListener('mouseenter', () => { b.style.background = '#eef3ff'; b.style.color = '#0057ff'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'none';    b.style.color = '#222'; });
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(url, '_blank', 'noopener');
            closeCameraChooser();
        });
        return b;
    };

    menu.append(makeBtn('Photo', photoUrl), makeBtn('Video', videoUrl));
    document.body.appendChild(menu);

    // Anchor just below the icon; nudge left if it would overflow the viewport.
    const r = linkEl.getBoundingClientRect();
    menu.style.top  = `${r.bottom + window.scrollY + 4}px`;
    menu.style.left = `${r.left + window.scrollX}px`;
    const mr = menu.getBoundingClientRect();
    if (mr.right > window.innerWidth - 8) {
        menu.style.left = `${window.innerWidth - mr.width - 8 + window.scrollX}px`;
    }

    cameraChooserEl = menu;
    cameraChooserAnchor = linkEl;
}

// Delegated: icons are injected after render, so listen at the document level.
document.addEventListener('click', (e) => {
    if (e.target.closest('[data-camera-chooser]')) return; // handled by the buttons

    const link = e.target.closest('[data-camera-slot] a');
    if (link) {
        e.preventDefault();
        if (cameraChooserAnchor === link) { closeCameraChooser(); return; } // toggle off
        openCameraChooser(link);
        return;
    }

    closeCameraChooser(); // click anywhere else dismisses
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCameraChooser(); });
// Close on scroll/resize so the popover never drifts away from its icon
// (covers scrolling inside table containers too, via capture).
window.addEventListener('scroll', closeCameraChooser, true);
window.addEventListener('resize', closeCameraChooser);