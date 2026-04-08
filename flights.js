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
const COOLDOWN_MS = 60000;

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
        lastTouchAndGo: 0,
        landingLogged: false,
        belowTouchAndGoThreshold: false
      };

      const currentAlt = flight.alt_baro;
      const prevAlt = prev ? prev.alt_baro : null;

      // --- LANDING ---
      if (isOnGround(currentAlt) && prevAlt !== null && !isOnGround(prevAlt) &&
          typeof prevAlt === "number" && prevAlt > 200 && !state.landingLogged) {
        state.belowTouchAndGoThreshold = false;
        state.landingLogged = true;
        state.takeoffLogged = false;
        logFlight(flight.flight, flight.category, "Landing");
      }

      // --- TAKEOFF option 1: was on ground, now airborne ---
      if (prevAlt !== null && isOnGround(prevAlt) && !isOnGround(currentAlt) && typeof currentAlt === "number") {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.belowTouchAndGoThreshold = false;
          logFlight(flight.flight, flight.category, "Takeoff");
        }
      }

      // --- TAKEOFF option 2: first appears below 100ft ---
      if (!prev && typeof currentAlt === "number" && currentAlt < 100) {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.belowTouchAndGoThreshold = false;
          logFlight(flight.flight, flight.category, "Takeoff");
        }
      }

      // --- TAKEOFF option 2b: existing aircraft below 100ft and climbing ---
      if (prev && typeof currentAlt === "number" && typeof prevAlt === "number" &&
          currentAlt < 100 && currentAlt > prevAlt) {
        if ((now - state.lastTakeoff) > COOLDOWN_MS) {
          state.lastTakeoff = now;
          state.landingLogged = false;
          state.belowTouchAndGoThreshold = false;
          logFlight(flight.flight, flight.category, "Takeoff");
        }
      }

      // --- TOUCH AND GO: went below 200ft but never hit ground ---
      if (typeof currentAlt === "number" && currentAlt < 200 && !isOnGround(currentAlt)) {
        state.belowTouchAndGoThreshold = true;
      }

      if (state.belowTouchAndGoThreshold && typeof currentAlt === "number" && currentAlt >= 200) {
        if ((now - state.lastTouchAndGo) > COOLDOWN_MS) {
          state.lastTouchAndGo = now;
          state.belowTouchAndGoThreshold = false;
          logFlight(flight.flight, flight.category, "Touch and Go");
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
setInterval(fetchAndDetect, 5000);