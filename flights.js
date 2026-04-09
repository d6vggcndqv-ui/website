import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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
const HELICOPTER_DISTANCE_KM = 0.5;
const COOLDOWN_MS = 60000;

const RUNWAYS = [
  { lat1: 42.1937493, lon1: -71.1777631, lat2: 42.1839344, lon2: -71.1717076 },
  { lat1: 42.1921429, lon1: -71.1784215, lat2: 42.1923323, lon2: -71.1638716 }
];
const RUNWAY_CORRIDOR_KM = 0.15;

const categoryMap = {
  "A1": "A1: Light",
  "A2": "A2: Small",
  "A3": "A3: Large",
  "A4": "A4: High Vortex Large",
  "A5": "A5: Heavy",
  "A7": "A7: Rotorcraft"
};

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
    if (dist <= RUNWAY_CORRIDOR_KM) return true;
  }
  return false;
}

function isOnGround(alt) {
  return alt === "ground";
}

async function logFlight(callsign, category, event) {
  try {
    await addDoc(collection(db, "flights"), {
      callsign: callsign ? callsign.trim() : "Unknown",
      aircraftType: categoryMap[category] || "Unknown",
      event: event,
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString()
    });
    console.log(`Logged ${event} for ${callsign}`);
  } catch (error) {
    console.error("Error logging flight:", error);
  }
}

let previousAircraft = {};
let aircraftState = {};

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

      const prev = previousAircraft[flight.hex];
      const state = aircraftState[flight.hex] || {
        lastTakeoff: 0,
        lastLanding: 0,
        lastTouchAndGo: 0,
        landingLogged: false,
        minAltOnRunway: null,
        consecutiveClimbs: 0,
        helicopterClimbs: 0
      };

      const currentAlt = flight.alt_baro;
      const prevAlt = prev ? prev.alt_baro : null;
      const currentGs = flight.gs || 0;
      const prevGs = prev ? (prev.gs || 0) : 0;
      const isHelicopter = flight.category === "A7";

      // track if a takeoff was logged in this iteration
      let takeoffLoggedThisIteration = false;

      // --- LANDING ---
      if (isOnGround(currentAlt) && prevAlt !== null && !isOnGround(prevAlt) &&
          typeof prevAlt === "number" && !state.landingLogged) {
        console.log('LANDING CONDITION MET for', flight.flight);
        state.landingLogged = true;
        state.lastLanding = now;
        state.minAltOnRunway = null;
        state.consecutiveClimbs = 0;
        state.helicopterClimbs = 0;
        logFlight(flight.flight, flight.category, "Landing");
      }

      // --- TAKEOFF option 1: was on ground, now showing a number (all aircraft) ---
      if (prevAlt !== null && isOnGround(prevAlt) && !isOnGround(currentAlt) &&
          typeof currentAlt === "number") {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.minAltOnRunway = null;
          state.consecutiveClimbs = 0;
          state.helicopterClimbs = 0;
          takeoffLoggedThisIteration = true;
          logFlight(flight.flight, flight.category, "Takeoff");
        }
      }

      // --- TAKEOFF option 2: fixed wing on runway, accelerating above 40kts, climbing, below 500ft ---
      if (!isHelicopter && !isOnGround(currentAlt) && isOnRunway(flight.lat, flight.lon) &&
          currentGs > 40 && currentGs > prevGs &&
          typeof currentAlt === "number" && typeof prevAlt === "number" &&
          currentAlt > prevAlt && currentAlt < 500) {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.minAltOnRunway = null;
          state.consecutiveClimbs = 0;
          takeoffLoggedThisIteration = true;
          logFlight(flight.flight, flight.category, "Takeoff");
        }
      }

      // --- TAKEOFF option 3: helicopter within 500m, not on ground, climbing for 2 consecutive fetches ---
      if (isHelicopter && !isOnGround(currentAlt) && distance <= HELICOPTER_DISTANCE_KM &&
          typeof currentAlt === "number" && typeof prevAlt === "number" && currentAlt > prevAlt) {
        state.helicopterClimbs++;
      } else if (isHelicopter && typeof currentAlt === "number" && typeof prevAlt === "number" &&
                 currentAlt <= prevAlt) {
        state.helicopterClimbs = 0;
      }

      if (isHelicopter && state.helicopterClimbs >= 2) {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.helicopterClimbs = 0;
          takeoffLoggedThisIteration = true;
          logFlight(flight.flight, flight.category, "Takeoff");
        }
      }

      // --- TOUCH AND GO detection ---
      if (!isHelicopter && !isOnGround(currentAlt) && isOnRunway(flight.lat, flight.lon) &&
          typeof currentAlt === "number" && (now - state.lastTakeoff) > COOLDOWN_MS &&
          !takeoffLoggedThisIteration) {

        if (state.minAltOnRunway === null || currentAlt < state.minAltOnRunway) {
          state.minAltOnRunway = currentAlt;
          state.consecutiveClimbs = 0;
        }

        if (state.minAltOnRunway !== null && currentAlt > state.minAltOnRunway &&
            prevAlt !== null && typeof prevAlt === "number" && currentAlt > prevAlt) {
          state.consecutiveClimbs++;
        } else if (prevAlt !== null && typeof prevAlt === "number" && currentAlt <= prevAlt) {
          state.consecutiveClimbs = 0;
        }

        if (state.consecutiveClimbs >= 2) {
          if ((now - state.lastTouchAndGo) > COOLDOWN_MS) {
            state.lastTouchAndGo = now;
            state.lastTakeoff = now;
            state.landingLogged = false;
            state.minAltOnRunway = null;
            state.consecutiveClimbs = 0;
            logFlight(flight.flight, flight.category, "Touch and Go");
          }
        }
      } else if (!isOnRunway(flight.lat, flight.lon)) {
        state.minAltOnRunway = null;
        state.consecutiveClimbs = 0;
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