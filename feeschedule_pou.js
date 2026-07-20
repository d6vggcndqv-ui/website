// Landing Fee Schedule — KPOU (Hudson Valley Regional / Poughkeepsie)
// Used by landingfees.html to calculate fees owed by transient turbine aircraft.
//
// Keys are ICAO strings as stored in the `aircraftType` field of flights_pou.
// Only turbine aircraft (class === "Turbine") reach this lookup — all piston
// and rotorcraft landings are fee-exempt and never evaluated here.
//
// If an aircraft's ICAO code is not found in this map, the report flags
// the record as "Unknown — Review Manually" rather than assigning a fee.
//
// Fee amounts per KPOU rate schedule (last reviewed 6/2026).
// Update LANDING_FEES amounts if the rate schedule changes.

const FEE_TIERS_POU = {
  'P46T':  { tier: 'Light Turboprop',   fee: 35 },
  'C208':  { tier: 'Light Turboprop',   fee: 35 },
  'C425':  { tier: 'Light Turboprop',   fee: 35 },
  'PAY1':  { tier: 'Light Turboprop',   fee: 35 },
  'PAY2':  { tier: 'Light Turboprop',   fee: 35 },
  'PA31':  { tier: 'Light Turboprop',   fee: 35 },
  'AT3T':  { tier: 'Light Turboprop',   fee: 35 },
  'EVOT':  { tier: 'Light Turboprop',   fee: 35 },
  'BE9L':  { tier: 'Light Turboprop',   fee: 35 },
  'BE9T':  { tier: 'Light Turboprop',   fee: 35 },
  'TBM7':  { tier: 'Light Turboprop',   fee: 35 },
  'MU2':  { tier: 'Light Turboprop',   fee: 35 },
  'TBM9':  { tier: 'Light Turboprop',   fee: 35 },
  'DHC2':  { tier: 'Light Turboprop',   fee: 35 },
  'PAY3':  { tier: 'Medium Turboprop',   fee: 35 },
  'PAY4':  { tier: 'Medium Turboprop',   fee: 35 },
  'D228':  { tier: 'Medium Turboprop',   fee: 35 },
  'SW3':  { tier: 'Medium Turboprop',   fee: 35 },
  'SW4':  { tier: 'Medium Turboprop',   fee: 35 },
  'P180':  { tier: 'Medium Turboprop',   fee: 35 },
  'PC12':  { tier: 'Medium Turboprop',   fee: 35 },
  'DHC6':  { tier: 'Medium Turboprop',   fee: 35 },
  'BE99':  { tier: 'Medium Turboprop',   fee: 35 },
  'BE9T':  { tier: 'Medium Turboprop',   fee: 35 },
  'BE10':  { tier: 'Medium Turboprop',   fee: 35 },
  'BE20':  { tier: 'Medium Turboprop',   fee: 35 },
  'BE30':  { tier: 'Medium Turboprop',   fee: 35 },
  'BE35':  { tier: 'Medium Turboprop',   fee: 35 },
  'AC90':  { tier: 'Medium Turboprop',   fee: 35 },
  'JS31':  { tier: 'Medium Turboprop',   fee: 35 },
  'B190':  { tier: 'Heavy Turboprop',   fee: 35 },
  'E120':  { tier: 'Heavy Turboprop',   fee: 35 },
  'SF34':  { tier: 'Heavy Turboprop',   fee: 35 },
  'SB20':  { tier: 'Heavy Turboprop',   fee: 35 },
  'DH8A':  { tier: 'Heavy Turboprop',   fee: 35 },
  'DH8B':  { tier: 'Heavy Turboprop',   fee: 35 },
  'DH8C':  { tier: 'Heavy Turboprop',   fee: 35 },
  'DH8D':  { tier: 'Heavy Turboprop',   fee: 35 },
  'SF50':  { tier: 'Very Light Jet',   fee: 35 },
  'HA4T':  { tier: 'Very Light Jet',   fee: 35 },
  'EA50':  { tier: 'Very Light Jet',   fee: 35 },
  'C501':  { tier: 'Light Jet',   fee: 40 },
  'C510':  { tier: 'Light Jet',   fee: 40 },
  'C525':  { tier: 'Light Jet',   fee: 40 },
  'C550':  { tier: 'Light Jet',   fee: 40 },
  'C551':  { tier: 'Light Jet',   fee: 40 },
  'C560':  { tier: 'Light Jet',   fee: 40 },
  'C25C':  { tier: 'Light Jet',   fee: 40 },
  'E50P':  { tier: 'Light Jet',   fee: 40 },
  'E55P':  { tier: 'Light Jet',   fee: 40 },
  'LJ24':  { tier: 'Light Jet',   fee: 40 },
  'LJ25':  { tier: 'Light Jet',   fee: 40 },
  'LJ28':  { tier: 'Light Jet',   fee: 40 },
  'LJ29':  { tier: 'Light Jet',   fee: 40 },
  'LJ31':  { tier: 'Light Jet',   fee: 40 },
  'LJ35':  { tier: 'Light Jet',   fee: 40 },
  'LJ36':  { tier: 'Light Jet',   fee: 40 },
  'LJ40':  { tier: 'Light Jet',   fee: 40 },
  'PC24':  { tier: 'Light Jet',   fee: 40 },
  'PRM1':  { tier: 'Light Jet',   fee: 40 },
  'BE40':  { tier: 'Light Jet',   fee: 40 },
  'FA10':  { tier: 'Light Jet',   fee: 40 },
  'C650':  { tier: 'Medium Jet',   fee: 60 },
  'C56X':  { tier: 'Medium Jet',   fee: 60 },
  'H25B':  { tier: 'Medium Jet',   fee: 60 },
  'JS41':  { tier: 'Medium Jet',   fee: 60 },
  'WW24':  { tier: 'Medium Jet',   fee: 60 },
  'LJ45':  { tier: 'Medium Jet',   fee: 60 },
  'ASTR':  { tier: 'Medium Jet',   fee: 60 },
  'G150':  { tier: 'Medium Jet',   fee: 60 },
  'C68A':  { tier: 'Medium Jet',   fee: 60 },
  'C680':  { tier: 'Medium Jet',   fee: 60 },
  'FA20':  { tier: 'Medium Jet',   fee: 60 },
  'H25C':  { tier: 'Medium Jet',   fee: 60 },
  'D328':  { tier: 'Heavy Jet',   fee: 80 },
  'CL30':  { tier: 'Heavy Jet',   fee: 80 },
  'CL35':  { tier: 'Heavy Jet',   fee: 80 },
  'CL60':  { tier: 'Heavy Jet',   fee: 80 },
  'F2TH':  { tier: 'Heavy Jet',   fee: 80 },
  'FA50':  { tier: 'Heavy Jet',   fee: 80 },
  'GALX':  { tier: 'Heavy Jet',   fee: 80 },
  'G280':  { tier: 'Heavy Jet',   fee: 80 },
  'E545':  { tier: 'Heavy Jet',   fee: 80 },
  'E550':  { tier: 'Heavy Jet',   fee: 80 },
  'C750':  { tier: 'Heavy Jet',   fee: 80 },
  'C700':  { tier: 'Heavy Jet',   fee: 80 },
  'E135':  { tier: 'Heavy Jet',   fee: 80 },
  'F900':  { tier: 'Heavy Jet',   fee: 80 },
  'GLF2':  { tier: 'Heavy Jet',   fee: 80 },
  'GLF3':  { tier: 'Heavy Jet',   fee: 80 },
  'BA11':  { tier: 'Super Heavy Jet',   fee: 80 },
  'B461':  { tier: 'Super Heavy Jet',   fee: 80 },
  'B462':  { tier: 'Super Heavy Jet',   fee: 80 },
  'GL7T':  { tier: 'Super Heavy Jet',   fee: 80 },
  'GLF4':  { tier: 'Super Heavy Jet',   fee: 80 },
  'GLF5':  { tier: 'Super Heavy Jet',   fee: 80 },
  'GLF6':  { tier: 'Super Heavy Jet',   fee: 80 },
  'FA6X':  { tier: 'Super Heavy Jet',   fee: 80 },
  'FA7X':  { tier: 'Super Heavy Jet',   fee: 80 },
  'GL5T':  { tier: 'Super Heavy Jet',   fee: 80 },


  
  


  

  





  
  



};

// Helper used by landingfees.html.
// Returns { tier, fee } for a known ICAO code, or null for unknown.
function getFeeForAircraftType(icaoCode) {
  return FEE_TIERS_POU[icaoCode] || null;
}