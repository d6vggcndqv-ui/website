
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
const MAX_ALTITUDE_FT = 1000;

let trackedAircraft = {};

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function logFlight(callsign, aircraftType, event) {
  try {
    await addDoc(collection(db, "flights"), {
      callsign: callsign || "Unknown",
      aircraftType: aircraftType || "Unknown",
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

async function fetchAndDetect() {
  try {
    const response = await fetch('https://map.fl-technologies-data.com/tar1090/data/aircraft.json');
    const data = await response.json();
    console.log('Total aircraft:', data.aircraft.length);
    const aircraft = data.aircraft;

    const currentAircraft = {};

    aircraft.forEach(flight => {
      if (!flight.lat || !flight.lon) return;

      const distance = getDistance(OWD_LAT, OWD_LNG, flight.lat, flight.lon);
      const altitude = flight.alt_baro || 99999;

      if (distance <= MAX_DISTANCE_KM && altitude <= MAX_ALTITUDE_FT) {
        currentAircraft[flight.hex] = flight;

        if (!trackedAircraft[flight.hex]) {
          logFlight(flight.flight, flight.t, "Landing");
        }
      }
    });

    Object.keys(trackedAircraft).forEach(hex => {
      if (!currentAircraft[hex]) {
        logFlight(trackedAircraft[hex].flight, trackedAircraft[hex].t, "Takeoff");
      }
    });

    trackedAircraft = currentAircraft;

  } catch (error) {
    console.error("Error fetching aircraft data:", error);
  }
}

fetchAndDetect();
setInterval(fetchAndDetect, 10000);


