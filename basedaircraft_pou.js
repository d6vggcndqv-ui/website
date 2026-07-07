// Based Aircraft at KPOU (Hudson Valley Regional / Poughkeepsie)
// Source: FAA National Based Aircraft Inventory Program — 6/16/26
// Used by landingfees.html to determine fee exemption.
// Aircraft whose registration appears in this Set are considered based
// and are exempt from landing fees regardless of aircraft class.
//
// Part-time based aircraft (marked PARTIME in the FAA report) are included
// as exempt. Review periodically and update from the FAA inventory export.

const BASED_AIRCRAFT_POU = new Set([
  'N108CH',
  'N117FH',
  'N119NY',
  'N120NY',
  'N12104',
  'N12180',
  'N123SP',
  'N129FR',
  'N12KB',
  'N12V',
  'N1339E',
  'N145WW',
  'N1474X',
  'N1526P',
  'N15534',
  'N1713V',
  'N1833T',
  'N1838L',
  'N19WC',
  'N202TW',
  'N20559',
  'N20972',
  'N210TY',
  'N2117Q',
  'N22106',
  'N2210W',
  'N224TW',
  'N234TS',
  'N235RB',
  'N236BE',
  'N2499P',
  'N251DB',
  'N2727K',
  'N2776A',
  'N278DB',
  'N29172',
  'N293TW',
  'N296CT',
  'N2978S',
  'N2999G',
  'N30347',
  'N3205A',
  'N32168',
  'N333ZX',
  'N3368K',
  'N35544',
  'N355RL',
  'N3778V',
  'N398MW',
  'N416TW',
  'N423RS',
  'N433TW',  // OCR showed N4359 — cross-reference as N4395J may be alternate; both included below
  'N4395J',
  'N43TB',
  'N4405D',
  'N4522X',
  'N4538E',
  'N454M',
  'N4740N',
  'N5126P',
  'N5179G',
  'N5215L',
  'N523TW',
  'N524TW',
  'N526TW',
  'N5297V',
  'N5548C',
  'N56424',
  'N5750Q',
  'N58743',
  'N590TW',
  'N6052F',
  'N611H',
  'N611KG',
  'N62529',
  'N624FM',
  'N644HL',  // Part-time based — included as exempt
  'N654PP',  // Part-time based — included as exempt
  'N66120',
  'N6616H',
  'N6684G',
  'N668TW',
  'N6697Z',
  'N6884H',
  'N696HD',
  'N699CD', // OCR showed N6s3CcD — likely N6993CD, verify
  'N7023Q',
  'N70336',
  'N7041C',
  'N712TM',
  'N717JT',
  'N723CB',
  'N7328P',
  'N7334P',
  'N7379T',
  'N737QC',
  'N75082',
  'N7542D',
  'N759KS',
  'N764AA',
  'N7696C',
  'N7762N',
  'N776HC',
  'N7772G',
  'N7813F',
  'N78445',
  'N79BT',   // OCR showed N7SBT
  'N809TW',  // OCR showed NB09TW
  'N812MA',
  'N8198B',
  'N824FM',
  'N82743',
  'N8296W',  // OCR showed N82s6w
  'N82SB',
  'N83225',  // Part-time based — included as exempt
  'N837TA',
  'N848TW',  // OCR showed Ne4sTW
  'N849TW',  // OCR showed Ne4oTW
  'N881TW',  // OCR showed N8B1ITW
  'N8824C',  // OCR showed NaB24C
  'N927TC',
  'N93CD',   // OCR showed N@3cD
  'N9370N',
  'N9426E',
  'N9468D',
  'N954JH',
  'N955JP',  // OCR showed NSS5JP
  'N95GJ',   // OCR showed NSSGJ
  'N969SH',
  'N96BP',   // OCR showed Ng6BP
  'N9725Q',
  'N987JS',  // OCR showed Ng87JS
  'N9885U',
  'N988TW',  // OCR showed NgBsTW
  'N9994V',  // OCR showed Nggsav
  'N99CV',   // OCR showed NS9CV
]);