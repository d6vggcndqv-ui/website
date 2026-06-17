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

const OWD_LAT = 42.1905;
const OWD_LNG = -71.1728;
const MAX_DISTANCE_KM = 3;
const HELICOPTER_DISTANCE_KM = 1;
const COOLDOWN_MS = 60000;

const RUNWAYS = [
  { name: "17/35", lat1: 42.1937493, lon1: -71.1777631, lat2: 42.1839344, lon2: -71.1717076 },
  { name: "10/28", lat1: 42.1921429, lon1: -71.1784215, lat2: 42.1923323, lon2: -71.1638716 }
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
      collection(db, "flights"),
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
    await addDoc(collection(db, "flights"), {
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
      const distance = getDistance(OWD_LAT, OWD_LNG, flight.lat, flight.lon);
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
        console.log('LANDING CONDITION 2 MET for', registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight);
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
          logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Takeoff", state.lastRunway);
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
            logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Touch and Go", state.lastRunway);
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
            logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Touch and Go", state.lastRunway);
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
          logFlight(registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight, aacAdg, category, aircraftClass, "Takeoff", currentRunway || state.lastRunway);
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

/* =====================================================================
   FLIGHT PATH CAPTURE  —  NEW FEATURE  (additive; added 2026-05-29)
   ---------------------------------------------------------------------
   Everything below this comment is new. It does NOT read, modify, or
   depend on the event-detection logic above. It runs its own fetch loop
   on its own interval, keeps its own state (trackBuffers), and writes
   flight paths to the "tracks_owd" Firestore collection.
 
   How it works:
     - While an aircraft is within TRACK_RADIUS_KM of OWD and at/below the
       noise-relevant ceiling (TRACK_CEILING_AGL_FT above the field), its
       position reports are buffered in memory.
     - When that aircraft has not been seen for TRACK_TIMEOUT_MS, the
       buffered path is flushed as ONE document. One document per visit,
       so a plane that flies several times a day produces several docs,
       told apart by their start timestamps.
     - High overflights (always above the ceiling) are never buffered, so
       en-route traffic that could never be a noise complaint is ignored.
     - Stationary aircraft parked on the field (on ground, ~0 kt) are not
       recorded, so a based aircraft idling on the ramp doesn't bloat a
       session; the takeoff roll and landing rollout (moving) still are.
     - Once a day it deletes track docs older than TRACK_RETENTION_DAYS.
 
   Two things to know:
     - One new import is needed (deleteDoc, used by the prune). It is
       placed here so your existing import block stays untouched; feel
       free to move it up next to your other firestore imports.
     - This makes a SECOND fetch of aircraft.json (your detector has its
       own). That keeps the two features fully independent. Merging them
       into one shared fetch would mean editing your existing code, so it
       is intentionally left separate.
   ===================================================================== */
 
import { deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
 
// ---- Config ----
const TRACK_COLLECTION     = "tracks_owd";
const TRACK_RADIUS_KM      = 8.05;     // wider than the 3 km detection radius; noise corridors run well past it, ~5 miles
const FIELD_ELEVATION_FT   = 49;     // OWD field elevation (MSL) — confirm against the charted figure
const TRACK_CEILING_AGL_FT = 4500;   // only keep paths that came at/below this height above the field
const TRACK_CEILING_MSL_FT = FIELD_ELEVATION_FT + TRACK_CEILING_AGL_FT; // feed reports MSL, so compare against this
const TRACK_GROUND_MIN_KT  = 3;      // ignore stationary ground samples (parked/idling aircraft)
const TRACK_TIMEOUT_MS     = 120000; // a visit ends after the aircraft is unseen this long (rides out coverage gaps)
const TRACK_POLL_MS        = 2000;   // sample cadence (matches the feed)
const TRACK_RETENTION_DAYS = 30;     // prune anything older than this
const TRACK_PRUNE_EVERY_MS = 24 * 60 * 60 * 1000; // run the prune at most once a day (also runs once on startup)
 
// ---- State (separate from the detector's aircraftState) ----
let trackBuffers = {};      // hex -> { hex, registration, type, startMs, lastSeenMs, points[], bbox }
let lastTrackPruneMs = 0;
 
// ---- Resolve AAC-ADG the same way the detector does (read-only reuse of aircraftRegistry) ----
function resolveTrackType(flight) {
  if (flight.category === "A7") return "Rotorcraft";
  if (typeof aircraftRegistry !== "undefined" && aircraftRegistry[flight.hex.toLowerCase()]) {
    return aircraftRegistry[flight.hex.toLowerCase()];
  }
  return "Unknown";
}
 
// ---- Flush one buffered visit to Firestore (one document per visit) ----
async function flushTrack(hex) {
  const buf = trackBuffers[hex];
  delete trackBuffers[hex];                   // free the buffer immediately
  if (!buf || buf.points.length < 2) return;  // nothing worth storing (e.g. only a single sample)
 
  const start = new Date(buf.startMs);
  const end   = new Date(buf.lastSeenMs);
 
  // display date/time in the same format your event docs use (derived from the visit start)
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day   = String(start.getDate()).padStart(2, '0');
  const year  = start.getFullYear();
  let hours   = start.getHours();
  const mins  = String(start.getMinutes()).padStart(2, '0');
  const secs  = String(start.getSeconds()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
 
  let minAlt = buf.points[0][2];
  for (const p of buf.points) if (p[2] < minAlt) minAlt = p[2];
 
  // Firestore does not allow arrays-of-arrays, so each point is stored as a small map.
  const trackPoints = buf.points.map(p => ({
    lat: p[0], lon: p[1], alt: p[2], gs: p[3], trk: p[4], t: p[5]
  }));
 
  try {
    await addDoc(collection(db, TRACK_COLLECTION), {
      registration: buf.registration || "Unknown",
      hex: buf.hex,
      aircraftType: buf.type || "Unknown",
      timestamp: start.toISOString(),   // used for ordering and for the retention prune
      start: start.toISOString(),
      end: end.toISOString(),
      date: `${month}/${day}/${year}`,
      time: `${hours}:${mins}:${secs} ${ampm}`,
      pointCount: trackPoints.length,
      minAltMSL: minAlt,                // lowest altitude seen on the visit (MSL)
      bbox: buf.bbox,                   // {minLat,maxLat,minLon,maxLon} for cheap "passed near here" pre-filtering
      track: trackPoints                // [{lat,lon,alt,gs,trk,t}, ...]  alt = ft MSL, t = sec since start
    });
    console.log(`Stored track for ${buf.registration} — ${trackPoints.length} pts`);
  } catch (error) {
    console.error("Error storing track:", error);
  }
}
 
// ---- Delete track docs older than the retention window ----
async function pruneOldTracks() {
  try {
    const cutoff = new Date(Date.now() - TRACK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const oldQuery = query(collection(db, TRACK_COLLECTION), where("timestamp", "<", cutoff));
    const snap = await getDocs(oldQuery);
    let removed = 0;
    for (const docSnap of snap.docs) {
      await deleteDoc(docSnap.ref);
      removed++;
    }
    if (removed) console.log(`Pruned ${removed} track(s) older than ${TRACK_RETENTION_DAYS} days`);
  } catch (error) {
    console.error("Error pruning tracks:", error);
  }
}
 
// ---- Main capture pass (own fetch, own interval) ----
async function captureTracks() {
  try {
    const response = await fetch('https://map.fl-technologies-data.com/tar1090/data/aircraft.json');
    const data = await response.json();
    const nowMs = Date.now();
 
    data.aircraft.forEach(flight => {
      if (flight.lat == null || flight.lon == null) return;
 
      const dist = getDistance(OWD_LAT, OWD_LNG, flight.lat, flight.lon);
      if (dist > TRACK_RADIUS_KM) return;              // outside the capture radius
 
      // altitude in feet MSL: a number from the feed, or field elevation when on the ground
      const onGround = isOnGround(flight.alt_baro);
      const altMSL = onGround
        ? FIELD_ELEVATION_FT
        : (typeof flight.alt_baro === "number" ? flight.alt_baro : null);
      const belowCeiling = altMSL !== null && altMSL <= TRACK_CEILING_MSL_FT;
      const moving = !onGround || (flight.gs || 0) >= TRACK_GROUND_MIN_KT;
      const recordable = belowCeiling && moving;
 
      let buf = trackBuffers[flight.hex];
 
      if (recordable) {
        if (!buf) {
          buf = trackBuffers[flight.hex] = {
            hex: flight.hex,
            registration: (registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight || "Unknown").trim(),
            type: resolveTrackType(flight),
            startMs: nowMs,
            lastSeenMs: nowMs,
            points: [],
            bbox: { minLat: flight.lat, maxLat: flight.lat, minLon: flight.lon, maxLon: flight.lon }
          };
        }
        // upgrade the registration if it was unknown at first and is now resolvable
        if (buf.registration === "Unknown") {
          const resolved = (registrationRegistry[flight.hex.toLowerCase()] || flight.r || flight.flight || "").trim();
          if (resolved) buf.registration = resolved;
        }
        buf.lastSeenMs = nowMs;
 
        // dedupe consecutive identical positions (parked/slow), then append
        const rlat = +flight.lat.toFixed(5);
        const rlon = +flight.lon.toFixed(5);
        const ralt = Math.round(altMSL);
        const last = buf.points[buf.points.length - 1];
        if (!last || last[0] !== rlat || last[1] !== rlon || last[2] !== ralt) {
          buf.points.push([
            rlat, rlon, ralt,
            Math.round(flight.gs || 0),
            Math.round(flight.track || 0),
            Math.round((nowMs - buf.startMs) / 1000)   // seconds since visit start
          ]);
          buf.bbox.minLat = Math.min(buf.bbox.minLat, flight.lat);
          buf.bbox.maxLat = Math.max(buf.bbox.maxLat, flight.lat);
          buf.bbox.minLon = Math.min(buf.bbox.minLon, flight.lon);
          buf.bbox.maxLon = Math.max(buf.bbox.maxLon, flight.lon);
        }
      } else if (buf && !onGround) {
        // airborne but above the ceiling and a visit is already open:
        // keep it alive so a brief climb-out doesn't split one visit into two
        buf.lastSeenMs = nowMs;
      }
      // (in range, below ceiling, stationary on ground) and (above ceiling, no open visit) are intentionally ignored
    });
 
    // visit-end sweep: flush any buffer not seen within the timeout
    const stale = nowMs - TRACK_TIMEOUT_MS;
    const toFlush = [];
    for (const hex in trackBuffers) {
      if (trackBuffers[hex].lastSeenMs < stale) toFlush.push(hex);
    }
    for (const hex of toFlush) await flushTrack(hex);
 
    // daily retention prune
    if (nowMs - lastTrackPruneMs > TRACK_PRUNE_EVERY_MS) {
      lastTrackPruneMs = nowMs;
      pruneOldTracks();
    }
  } catch (error) {
    console.error("Error capturing tracks:", error);
  }
}
 
captureTracks();
setInterval(captureTracks, TRACK_POLL_MS);

// Hard refresh the page every 3 hours
setTimeout(() => location.reload(true), 3 * 60 * 60 * 1000);