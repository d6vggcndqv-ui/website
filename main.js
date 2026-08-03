// ── Camera / footage matching (POU only) ─────────────────────
// Matches Firestore flight events to camera events captured by the
// autonomous camera system at fltech-p2, and renders a small camera
// icon linking to the footage when a match is found.

const CAMERA_API_BASE = 'https://fltech-p2.tail15d9e4.ts.net';
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

    try {
        const res = await fetch(`${CAMERA_API_BASE}/events?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.total > 0 ? data.events[0] : null;
    } catch (e) {
        console.warn('Camera lookup failed:', e);
        return null;
    }
}

/**
 * Builds the HTML for a small camera icon linking to footage for a given event id.
 * Uses api_key as a query param (not a header) so it works as a plain link.
 * @param {number|string} eventId
 * @returns {string} HTML string for the icon link
 */
function cameraIconHtml(eventId) {
    return `<a href="${CAMERA_API_BASE}/events/${eventId}/video?api_key=${CAMERA_API_KEY}" target="_blank" title="View footage" style="text-decoration:none;font-size:11px;color:#0057ff;margin-left:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0057ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M3 7h3l2-3h8l2 3h3v13H3z"></path><circle cx="12" cy="13" r="4"></circle></svg></a>`;
}

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
            const slot = document.querySelector(`[data-camera-slot="${r.docId}"]`);
            if (!slot) return; // page changed since lookup started
            slot.innerHTML = cameraIconHtml(event.id);
        });
    });
}