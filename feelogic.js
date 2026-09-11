// ── feelogic.js ──────────────────────────────────────────────────
// Shared landing-fee computation logic for FL Technologies portal pages.
// Moved out of landingfees.html so flighthistory.html and noiseabatement.html
// can compute the same fee status inline without duplicating this logic.
//
// Depends on (must be loaded first, as plain scripts, same order as before):
//   basedaircraft_pou.js  -> BASED_AIRCRAFT_POU
//   icaocodeRegistry.js   -> typeCodeRegistry
//   feeschedule_pou.js    -> getFeeForAircraftType
//   mtow_pou.js            -> MTOW_RANGES_POU (used by pages rendering weight tier)
//
// Plain global scope (no ES module) — matches the other static data files.

// ICAO type codes that should never generate a fee regardless of class field.
// Used to filter out piston aircraft incorrectly classified as Turbine
// due to FAA data labeling turbocharged pistons as "Turbo-prop".
const EXCLUDED_TYPES_POU = new Set([
    'C182',   // Cessna 182 Skylane (piston)
    'C18T',   // Cessna T182 Turbo Skylane (turbocharged piston)
    'P28A',   // Piper Cherokee/Archer (piston)
    'P28B',   // Piper Warrior (piston)
    'P28R',   // Piper Arrow (piston — some turbocharged)
    'P28T',   // Piper Turbo Arrow (turbocharged piston)
    'P32R',   // Piper Saratoga SP (turbocharged piston)
    'P32T',   // Piper Turbo Saratoga (turbocharged piston)
    'C210',   // Cessna 210 Centurion (some turbocharged)
    'T210',   // Cessna T210 Turbo Centurion (turbocharged piston)
    'C337',   // Cessna 337 Skymaster (piston twin)
    'P337',   // Cessna T337 Turbo Skymaster (turbocharged piston)
]);

// ── Fee calculation ────────────────────────────────────────────
// processRow returns null for based/exempt aircraft and non-turbine.
// Returns a row object for transient turbine landings.
function processRow(r, docId) {
    // Only landings generate fees
    if (r.event !== 'Landing') return null;
    // Based aircraft are exempt
    if (BASED_AIRCRAFT_POU.has(r.registration)) return null;

    // Look up ICAO type code from registration, then get fee from schedule
    const icaoCode = typeCodeRegistry[r.registration] || null;
    // Exclude piston aircraft misclassified as Turbine due to FAA data quirks
    if (icaoCode && EXCLUDED_TYPES_POU.has(icaoCode)) return null;

    // Determine if turbine: use class field if present, otherwise fall back
    // to checking whether the ICAO type code resolves to a fee tier.
    // This handles pre-classRegistry records where class was not yet logged.
    const isTurbineByClass = r.class === 'Turbine';
    const isTurbineByIcao  = icaoCode ? !!getFeeForAircraftType(icaoCode) : false;
    if (!isTurbineByClass && !isTurbineByIcao) return null;
    const feeInfo  = icaoCode ? getFeeForAircraftType(icaoCode) : null;

    return {
        docId:        docId,
        date:         r.date,
        time:         r.time,
        registration: r.registration,
        icaoCode:     icaoCode || 'Unknown',
        tier:         feeInfo ? feeInfo.tier : null,
        fee:          feeInfo ? feeInfo.fee  : null,
        needsReview:  !feeInfo,
        timestamp:    r.timestamp,
    };
}

// ── Inline fee tier assignment (session only — no Firestore write) ──
const FEE_TIER_OPTIONS = [
    'Light Turboprop',
    'Medium Turboprop',
    'Heavy Turboprop',
    'Very Light Jet',
    'Light Jet',
    'Medium Jet',
    'Heavy Jet',
    'Super Heavy Jet',
];

const TIER_FEES = {
    'Light Turboprop':  35,
    'Medium Turboprop': 35,
    'Heavy Turboprop':  35,
    'Very Light Jet':   35,
    'Light Jet':        40,
    'Medium Jet':       60,
    'Heavy Jet':        80,
    'Super Heavy Jet':  80,
};