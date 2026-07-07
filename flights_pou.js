import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFl5lTFABQa7MvO0vt5R4rbzOtLtkScs0",
  authDomain: "owd-data.firebaseapp.com",
  projectId: "owd-data",
  storageBucket: "owd-data.firebasestorage.app",
  messagingSenderId: "912110224300",
  appId: "1:912110224300:web:ba2b8073871ec023817009",
  measurementId: "G-PHD4THC11M"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

const POU_LAT = 41.626598;
const POU_LNG = -73.884201;
const MAX_DISTANCE_KM = 3;
const HELICOPTER_DISTANCE_KM = 1;
const COOLDOWN_MS = 60000;

const RUNWAYS = [
  { name: "6/24", lat1: 41.621906, lon1: -73.891963, lat2: 41.630346, lon2: -73.878236 },
  { name: "15/33", lat1: 41.630282, lon1: -73.885205, lat2: 41.624559, lon2: -73.878530 }
];
const RUNWAY_CORRIDOR_KM = 0.15;

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isOnRunway(lat, lon) {
  for (const rwy of RUNWAYS) {
    const dx = rwy.lat2 - rwy.lat1;
    const dy = rwy.lon2 - rwy.lon1;
    const t = Math.max(0, Math.min(1, ((lat - rwy.lat1) * dx + (lon - rwy.lon1) * dy) / (dx * dx + dy * dy)));
    const closestLat = rwy.lat1 + t * dx;
    const closestLon = rwy.lon1 + t * dy;
    const dist = getDistance(lat, lon, closestLat, closestLon);
    if (dist <= RUNWAY_CORRIDOR_KM) return rwy.name;
  }
  return null;
}

function isOnGround(alt) {
  return alt === "ground";
}

async function logFlight(registration, aacAdg, category, aircraftClass, event, runway = "n/a") {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - COOLDOWN_MS).toISOString();
    const dedupCheck = query(
      collection(db, "flights_pou"),
      where("registration", "==", registration ? registration.trim() : "Unknown"),
      where("event", "==", event),
      where("timestamp", ">=", cutoff)
    );
    const existing = await getDocs(dedupCheck);
    if (!existing.empty) {
      console.log(`Skipping duplicate ${event} for ${registration}`);
      return;
    }
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    await addDoc(collection(db, "flights_pou"), {
      registration: registration ? registration.trim() : "Unknown",
      aircraftType: aacAdg || "Unknown",
      category: category,
      class: aircraftClass,
      event: event,
      runway: runway,
      timestamp: now.toISOString(),
      date: `${month}/${day}/${year}`,
      time: `${hours}:${minutes}:${seconds} ${ampm}`
    });
    console.log(`Logged ${event} for ${registration}`);
  } catch (error) {
    console.error("Error logging flight:", error);
  }
}

let previousAircraft = {};
let aircraftState = {};
const aircraftTypeCache = {};

async function fetchAndDetect() {
  try {
    const response = await fetch('https://map.fl-technologies-data.com/tar1090/data/aircraft.json');
    const data = await response.json();
    const now = Date.now();
    const currentAircraft = {};

    data.aircraft.forEach(flight => {
      if (!flight.lat || !flight.lon) return;
      const distance = getDistance(POU_LAT, POU_LNG, flight.lat, flight.lon);
      if (distance > MAX_DISTANCE_KM) return;

      currentAircraft[flight.hex] = flight;

      // Resolve AAC-ADG from registry, cache per hex so it only runs once per aircraft
      if (!aircraftTypeCache[flight.hex]) {
        if (flight.category === "A7") {
          aircraftTypeCache[flight.hex] = "n/a";
        } else {
          aircraftTypeCache[flight.hex] = aircraftRegistry[flight.hex.toLowerCase()] || "Unknown";
        }
      }
      const aacAdg = aircraftTypeCache[flight.hex];
      const category = flight.category === "A7" ? "Rotorcraft" : "Airplane";
      const aircraftClass = flight.category === "A7" ? "Rotorcraft" : (classRegistry[flight.hex.toLowerCase()] || "Unknown");

      const prev = previousAircraft[flight.hex];
      const state = aircraftState[flight.hex] || {
        lastTakeoff: 0,
        lastLanding: 0,
        lastTouchAndGo: 0,
        landingLogged: false,
        minAltOnRunway: null,
        consecutiveClimbs: 0,
        helicopterClimbs: 0,
        wasDescendingOnRunway: false,
        maxDistanceWhileAirborne: 0,
        consecutiveDescents: 0,
        lastRunway: "n/a",
        minGsOnRunway: null,
        gsAccelCount: 0,
        didDecelerateOnRunway: false,
        consecutiveDecelsOnRunway: 0
      };

      const currentAlt = flight.alt_baro;
      const prevAlt = prev ? prev.alt_baro : null;
      const currentGs = flight.gs || 0;
      const prevGs = prev ? (prev.gs || 0) : 0;
      const isHelicopter = flight.category === "A7";

      let takeoffLoggedThisIteration = false;
      let touchAndGoLoggedThisIteration = false;

      // --- track max distance while airborne for helicopters ---
      if (isHelicopter && !isOnGround(currentAlt)) {
        state.maxDistanceWhileAirborne = Math.max(state.maxDistanceWhileAirborne, distance);
      }

      // --- LANDING option 1: transitions to "ground" ---
      if (isOnGround(currentAlt) && prevAlt !== null && !isOnGround(prevAlt) &&
          typeof prevAlt === "number" && !state.landingLogged) {
        console.log('LANDING CONDITION MET for',  registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight);
        state.landingLogged = true;
        state.lastLanding = now;
        state.minAltOnRunway = null;
        state.consecutiveClimbs = 0;
        state.helicopterClimbs = 0;
        state.wasDescendingOnRunway = false;
        state.maxDistanceWhileAirborne = 0;
        logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Landing", state.lastRunway);
      }

      // --- LANDING option 2: within airport area, was descending on runway, now very slow (under 5kts) ---
      if (!state.landingLogged && !isOnGround(currentAlt) &&
          distance <= MAX_DISTANCE_KM &&
          state.wasDescendingOnRunway &&
          currentGs < 5 && currentGs !== 0 &&
          (now - state.lastLanding) > COOLDOWN_MS) {
        console.log('LANDING CONDITION 2 MET for',  registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight);
        state.landingLogged = true;
        state.lastLanding = now;
        state.minAltOnRunway = null;
        state.consecutiveClimbs = 0;
        state.wasDescendingOnRunway = false;
        logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Landing", state.lastRunway);
      }

      // --- TAKEOFF option 1: was on ground, now showing a number ---
      if (prevAlt !== null && isOnGround(prevAlt) && !isOnGround(currentAlt) &&
          typeof currentAlt === "number") {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.minAltOnRunway = null;
          state.consecutiveClimbs = 0;
          state.helicopterClimbs = 0;
          state.wasDescendingOnRunway = false;
          state.maxDistanceWhileAirborne = 0;
          takeoffLoggedThisIteration = true;
          logFlight( registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Takeoff", state.lastRunway);
        }
      }

      // --- track descending on runway ---
      const currentRunway = isOnRunway(flight.lat, flight.lon);
      if (currentRunway) state.lastRunway = currentRunway;

      if (!isHelicopter && currentRunway &&
          !isOnGround(currentAlt) && !isOnGround(prevAlt) &&
          typeof currentAlt === "number" && typeof prevAlt === "number" &&
          currentAlt < prevAlt && currentGs > 30) {
        state.consecutiveDescents++;
        if (state.consecutiveDescents >= 2) {
          state.wasDescendingOnRunway = true;
        }
      } else if (!isHelicopter && currentRunway) {
        state.consecutiveDescents = 0;
      }

      // --- reset wasDescendingOnRunway and consecutiveDescents if aircraft leaves runway corridor ---
      if (!currentRunway) {
        state.wasDescendingOnRunway = false;
        state.consecutiveDescents = 0;
      }

      // --- TOUCH AND GO detection (runs before takeoff option 2) ---
      if (!isHelicopter && !isOnGround(currentAlt) && currentRunway &&
          typeof currentAlt === "number" && currentAlt < 500 &&
          state.wasDescendingOnRunway &&
          (now - state.lastTakeoff) > COOLDOWN_MS && !takeoffLoggedThisIteration) {

        if (state.minAltOnRunway === null || currentAlt < state.minAltOnRunway) {
          state.minAltOnRunway = currentAlt;
          state.consecutiveClimbs = 0;
        }

        if (state.minAltOnRunway !== null && currentAlt > state.minAltOnRunway &&
            prevAlt !== null && typeof prevAlt === "number" && currentAlt > prevAlt) {
          state.consecutiveClimbs++;
        } else if (prevAlt !== null && typeof prevAlt === "number" && currentAlt < prevAlt) {
          state.consecutiveClimbs = 0;
        }

        if (state.consecutiveClimbs >= 2) {
          if ((now - state.lastTouchAndGo) > COOLDOWN_MS) {
            state.lastTouchAndGo = now;
            state.lastTakeoff = now;
            state.landingLogged = false;
            state.minAltOnRunway = null;
            state.consecutiveClimbs = 0;
            state.wasDescendingOnRunway = false;
            touchAndGoLoggedThisIteration = true;
            logFlight( registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Touch and Go", state.lastRunway);
          }
        }
      }

      // --- reset touch and go tracking if aircraft leaves runway ---
      if (!currentRunway) {
        state.minAltOnRunway = null;
        state.consecutiveClimbs = 0;
        state.minGsOnRunway = null;
        state.gsAccelCount = 0;
        state.didDecelerateOnRunway = false;
        state.consecutiveDecelsOnRunway = 0;
      }

      // --- TOUCH AND GO option 2: deceleration then acceleration on runway, never below 35kts ---
      if (!isHelicopter && !isOnGround(currentAlt) && currentRunway &&
          typeof currentAlt === "number" && typeof prevAlt === "number" &&
          (now - state.lastTakeoff) > COOLDOWN_MS && !takeoffLoggedThisIteration && !touchAndGoLoggedThisIteration) {

        if ((state.minGsOnRunway === null && prevAlt !== null) || currentGs < state.minGsOnRunway) {
          if (state.minGsOnRunway !== null && currentGs < state.minGsOnRunway) {
            state.consecutiveDecelsOnRunway++;
            if (state.consecutiveDecelsOnRunway >= 2) {
              state.didDecelerateOnRunway = true;
            }
          } else {
            state.consecutiveDecelsOnRunway = 0;
          }
          state.minGsOnRunway = currentGs;
          state.gsAccelCount = 0;
        } else {
          state.consecutiveDecelsOnRunway = 0;
        }

        if (state.minGsOnRunway !== null && currentGs > state.minGsOnRunway && currentGs > prevGs) {
          state.gsAccelCount++;
        }

        if (state.gsAccelCount >= 2 && state.minGsOnRunway >= 35 && state.didDecelerateOnRunway) {
          if ((now - state.lastTouchAndGo) > COOLDOWN_MS) {
            state.lastTouchAndGo = now;
            state.lastTakeoff = now;
            state.landingLogged = false;
            state.minGsOnRunway = null;
            state.gsAccelCount = 0;
            state.didDecelerateOnRunway = false;
            state.consecutiveDecelsOnRunway = 0;
            state.minAltOnRunway = null;
            state.consecutiveClimbs = 0;
            state.wasDescendingOnRunway = false;
            touchAndGoLoggedThisIteration = true;
            logFlight( registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Touch and Go", state.lastRunway);
          }
        }
      }

      // --- TAKEOFF option 2: fixed wing on runway, accelerating above 40kts, climbing, below 500ft, not previously descending, no touch and go this iteration ---
      if (!isHelicopter && !isOnGround(currentAlt) && currentRunway &&
          currentGs > 40 && currentGs > prevGs &&
          typeof currentAlt === "number" && typeof prevAlt === "number" &&
          currentAlt > prevAlt && currentAlt < 500 &&
          !state.wasDescendingOnRunway && !touchAndGoLoggedThisIteration) {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.minAltOnRunway = null;
          state.consecutiveClimbs = 0;
          state.wasDescendingOnRunway = false;
          takeoffLoggedThisIteration = true;
          logFlight( registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Takeoff", currentRunway || state.lastRunway);
        }
      }

      // --- TAKEOFF option 3: helicopter within 1km, not on ground, climbing for 2 consecutive fetches ---
      if (isHelicopter && !isOnGround(currentAlt) && distance <= HELICOPTER_DISTANCE_KM &&
          typeof currentAlt === "number" && typeof prevAlt === "number" && currentAlt > prevAlt) {
        state.helicopterClimbs++;
      } else if (isHelicopter && typeof currentAlt === "number" && typeof prevAlt === "number" &&
                 currentAlt <= prevAlt) {
        state.helicopterClimbs = 0;
      }

      if (isHelicopter && state.helicopterClimbs >= 2) {
        const hasLandedSinceLastTakeoff = state.landingLogged;
        const hasNeverTakenOff = state.lastTakeoff === 0;

        if ((hasLandedSinceLastTakeoff || hasNeverTakenOff) &&
            (now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.helicopterClimbs = 0;
          takeoffLoggedThisIteration = true;
          logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Takeoff");
        }
      }

      aircraftState[flight.hex] = state;
    });

    previousAircraft = currentAircraft;

  } catch (error) {
    console.error("Error fetching aircraft data:", error);
  }
}

fetchAndDetect();
setInterval(fetchAndDetect, 2000);

// Hard refresh the page every 3 hours
setTimeout(() => location.reload(true), 3 * 60 * 60 * 1000);

// ════════════════════════════════════════════════════════════════════
// END OF DAY NOISE INQUIRY SUMMARY
// Runs at 11:59 PM each night. If more than one noise inquiry was
// submitted today for POU, sends a digest email via Web3Forms.
// ════════════════════════════════════════════════════════════════════
 
async function sendNoiseSummary() {
  try {
    // ── Get today's date string matching the format stored in Firestore ("MM/DD/YYYY") ──
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day   = String(now.getDate()).padStart(2, '0');
    const year  = now.getFullYear();
    const todayStr = `${month}/${day}/${year}`;
 
    // ── Query noise_inquiries for today's POU submissions ────────────
    const q = query(
      collection(db, "noise_inquiries"),
      where("date", "==", todayStr),
      where("airport", "==", "POU — Dutchess County")
    );
    const snapshot = await getDocs(q);
 
    if (snapshot.size <= 1) {
      console.log(`[NoiseSummary] Only ${snapshot.size} submission(s) today — no summary needed.`);
      return;
    }
 
    const submissions = snapshot.docs.map(d => d.data());
 
    // ── Tally complaint types ─────────────────────────────────────────
    const typeCounts = {};
    submissions.forEach(s => {
      (s.complaint_types || []).forEach(t => {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
    });
    const typeLines = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `  • ${type} — ${count} report${count > 1 ? 's' : ''}`)
      .join('\n');
 
    // ── Time range of events ──────────────────────────────────────────
    const eventTimes = submissions
      .map(s => s.event_time)
      .filter(Boolean)
      .sort();
    const timeRange = eventTimes.length > 0
      ? `${eventTimes[0]} – ${eventTimes[eventTimes.length - 1]}`
      : 'Not specified';
 
    // ── Unique addresses ──────────────────────────────────────────────
    const addresses = [...new Set(submissions.map(s => s.address).filter(Boolean))];
    const addressLines = addresses.map(a => `  • ${a}`).join('\n');
 
    // ── Comments (non-empty only) ─────────────────────────────────────
    const comments = submissions.map(s => s.comments).filter(Boolean);
    const commentLines = comments.length > 0
      ? comments.map(c => `  • "${c}"`).join('\n')
      : '  None';
 
    // ── Noise abatement links ─────────────────────────────────────────
    const links = submissions
      .map(s => s.noise_abatement_link)
      .filter(Boolean);
    const linkLines = links.length > 0
      ? links.map((l, i) => `  • Event ${i + 1}: ${l}`).join('\n')
      : '  None';
 
    // ── Build email body ──────────────────────────────────────────────
    const body = `Noise Inquiry Summary — ${todayStr}
Airport: POU — Dutchess County
Total Submissions: ${submissions.length}
 
COMPLAINT TYPES:
${typeLines}
 
TIME RANGE OF EVENTS: ${timeRange}
 
LOCATIONS REPORTED FROM:
${addressLines}
 
COMMENTS:
${commentLines}
 
NOISE ABATEMENT LINKS:
${linkLines}`;
 
    // ── Send via Web3Forms ────────────────────────────────────────────
    const formData = new FormData();
    formData.append('access_key', '44fd3732-39ce-45f0-b09c-9e1ae5ab4dae');
    formData.append('subject', `Noise Inquiry Daily Summary — POU — ${todayStr}`);
    formData.append('message', body);
 
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData
    });
 
    if (response.ok) {
      console.log('[NoiseSummary] Summary email sent successfully.');
    } else {
      console.error('[NoiseSummary] Web3Forms submission failed:', response.status);
    }
 
  } catch (err) {
    console.error('[NoiseSummary] Error sending summary:', err);
  }
}
 
// ── Schedule summary at 11:59 PM ─────────────────────────────────────
(function scheduleNoiseSummary() {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 35, 0, 0);
  let msUntilTarget = target - now;
  if (msUntilTarget < 0) msUntilTarget += 24 * 60 * 60 * 1000; // already past 11:59, schedule for tomorrow
  console.log(`[NoiseSummary] Summary scheduled in ${Math.round(msUntilTarget / 60000)} minutes.`);
  setTimeout(sendNoiseSummary, msUntilTarget);
})();
