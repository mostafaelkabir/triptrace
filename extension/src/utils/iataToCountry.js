// Static IATA airport code → country name lookup.
// ~500 airports covering all major travel destinations worldwide.
const IATA_MAP = {
  // ── United States ────────────────────────────────────────────────────────────
  ABQ: "United States", ALB: "United States", ANC: "United States",
  ATL: "United States", AUS: "United States", BDL: "United States",
  BNA: "United States", BOI: "United States", BOS: "United States",
  BTR: "United States", BUF: "United States", BUR: "United States",
  BWI: "United States", CHS: "United States", CID: "United States",
  CLE: "United States", CLT: "United States", CMH: "United States",
  COS: "United States", CVG: "United States", DAL: "United States",
  DAY: "United States", DCA: "United States", DEN: "United States",
  DFW: "United States", DSM: "United States", DTW: "United States",
  ELP: "United States", EUG: "United States", EWR: "United States",
  FAT: "United States", FLL: "United States", GRR: "United States",
  GSO: "United States", HNL: "United States", HOU: "United States",
  HSV: "United States", IAD: "United States", IAH: "United States",
  ICT: "United States", IND: "United States", JAC: "United States",
  JAX: "United States", JFK: "United States", LAS: "United States",
  LAX: "United States", LBB: "United States", LEX: "United States",
  LIT: "United States", LGB: "United States", MCI: "United States",
  MCO: "United States", MDW: "United States", MEM: "United States",
  MHT: "United States", MIA: "United States", MKE: "United States",
  MLB: "United States", MSN: "United States", MSP: "United States",
  MSY: "United States", MTJ: "United States", MYR: "United States",
  OAK: "United States", OGG: "United States", OKC: "United States",
  OMA: "United States", ONT: "United States", ORD: "United States",
  ORF: "United States", PDX: "United States", PHL: "United States",
  PHX: "United States", PIT: "United States", PNS: "United States",
  PSP: "United States", PVD: "United States", PWM: "United States",
  RDU: "United States", RIC: "United States", RNO: "United States",
  ROC: "United States", RSW: "United States", SAN: "United States",
  SAT: "United States", SAV: "United States", SBA: "United States",
  SBN: "United States", SEA: "United States", SFO: "United States",
  SJC: "United States", SJU: "United States", SLC: "United States",
  SMF: "United States", SNA: "United States", SRQ: "United States",
  STL: "United States", SYR: "United States", TPA: "United States",
  TUL: "United States", TUS: "United States", XNA: "United States",
  YUM: "United States",

  // ── Canada ───────────────────────────────────────────────────────────────────
  YEG: "Canada", YHZ: "Canada", YLW: "Canada", YOW: "Canada",
  YQB: "Canada", YQR: "Canada", YUL: "Canada", YVR: "Canada",
  YWG: "Canada", YXE: "Canada", YYC: "Canada", YYJ: "Canada",
  YYT: "Canada", YYZ: "Canada",

  // ── Mexico ───────────────────────────────────────────────────────────────────
  ACA: "Mexico", BJX: "Mexico", BOG: "Colombia", MDE: "Colombia", CJS: "Mexico",
  CUL: "Mexico", CUN: "Mexico", GDL: "Mexico", HMO: "Mexico",
  HUX: "Mexico", MEX: "Mexico", MID: "Mexico", MLM: "Mexico",
  MTY: "Mexico", MZT: "Mexico", OAX: "Mexico", PBC: "Mexico",
  PVR: "Mexico", SJD: "Mexico", SLP: "Mexico", TIJ: "Mexico",
  VER: "Mexico", ZIH: "Mexico", ZLO: "Mexico",

  // ── Caribbean & Central America ──────────────────────────────────────────────
  ANU: "Antigua and Barbuda", BGI: "Barbados", BZE: "Belize",
  CUR: "Curaçao", EIS: "British Virgin Islands", FDF: "Martinique",
  GCM: "Cayman Islands", GEO: "Guyana", GND: "Grenada",
  HAV: "Cuba", KIN: "Jamaica", MBJ: "Jamaica", MGA: "Nicaragua",
  MHH: "Bahamas", NAS: "Bahamas", NOU: "New Caledonia",
  PAP: "Haiti", PLS: "Turks and Caicos Islands", POS: "Trinidad and Tobago",
  PTP: "Guadeloupe", PUJ: "Dominican Republic", SAL: "El Salvador",
  SAP: "Honduras", SDQ: "Dominican Republic", SKB: "Saint Kitts and Nevis",
  GUA: "Guatemala", PTY: "Panama", SJO: "Costa Rica", STO: "Guatemala", SXM: "Sint Maarten",
  TGU: "Honduras", UVF: "Saint Lucia", VVI: "Bolivia",

  // ── South America ────────────────────────────────────────────────────────────
  ASU: "Paraguay", AEP: "Argentina", BEL: "Brazil", BSB: "Brazil",
  BUE: "Argentina", CFC: "Brazil", CGB: "Brazil", CGH: "Brazil",
  CGR: "Brazil", CNF: "Brazil", COR: "Argentina", CWB: "Brazil",
  EZE: "Argentina", FOR: "Brazil", GIG: "Brazil", GRU: "Brazil",
  GYE: "Ecuador", IGU: "Brazil", IQT: "Peru", LIM: "Peru",
  MAO: "Brazil", MDZ: "Argentina", MGF: "Brazil", MVD: "Uruguay",
  NAT: "Brazil", POA: "Brazil", PMW: "Brazil", PSM: "Peru",
  REC: "Brazil", RIO: "Brazil", SCL: "Chile", SSA: "Brazil",
  UIO: "Ecuador", VCP: "Brazil", VVI: "Bolivia",

  // ── United Kingdom ───────────────────────────────────────────────────────────
  ABZ: "United Kingdom", BFS: "United Kingdom", BHD: "United Kingdom",
  BHX: "United Kingdom", BRS: "United Kingdom", CWL: "United Kingdom",
  EDI: "United Kingdom", EMA: "United Kingdom", EXT: "United Kingdom",
  GLA: "United Kingdom", HUY: "United Kingdom", INV: "United Kingdom",
  LBA: "United Kingdom", LCY: "United Kingdom", LGW: "United Kingdom",
  LHR: "United Kingdom", LPL: "United Kingdom", LTN: "United Kingdom",
  MAN: "United Kingdom", NCL: "United Kingdom", NQY: "United Kingdom",
  SEN: "United Kingdom", SOU: "United Kingdom", STN: "United Kingdom",

  // ── Ireland ──────────────────────────────────────────────────────────────────
  DUB: "Ireland", SNN: "Ireland", ORK: "Ireland",

  // ── Germany ──────────────────────────────────────────────────────────────────
  BER: "Germany", BRE: "Germany", CGN: "Germany", DRS: "Germany",
  DTM: "Germany", DUS: "Germany", FKB: "Germany", FRA: "Germany",
  HAJ: "Germany", HAM: "Germany", LEJ: "Germany", MUC: "Germany",
  NUE: "Germany", STR: "Germany", TXL: "Germany",

  // ── France ───────────────────────────────────────────────────────────────────
  BIA: "France", BOD: "France", CDG: "France", CFE: "France",
  LIL: "France", LYS: "France", MPL: "France", MRS: "France",
  NCE: "France", NTE: "France", ORY: "France", RNS: "France",
  SXB: "France", TLS: "France",

  // ── Spain ────────────────────────────────────────────────────────────────────
  AGP: "Spain", ALC: "Spain", BCN: "Spain", BIO: "Spain",
  FUE: "Spain", GRX: "Spain", IBZ: "Spain", LPA: "Spain",
  MAD: "Spain", OVD: "Spain", PMI: "Spain", SDR: "Spain",
  SVQ: "Spain", TFN: "Spain", TFS: "Spain", VLC: "Spain",
  VLL: "Spain", ZAZ: "Spain",

  // ── Italy ────────────────────────────────────────────────────────────────────
  AOI: "Italy", BLQ: "Italy", BRI: "Italy", CAG: "Italy",
  CTA: "Italy", FCO: "Italy", FLR: "Italy", GOA: "Italy",
  LIN: "Italy", MXP: "Italy", NAP: "Italy", PMO: "Italy",
  PSA: "Italy", SUF: "Italy", TRN: "Italy", TSF: "Italy",
  VCE: "Italy", VRN: "Italy",

  // ── Netherlands ──────────────────────────────────────────────────────────────
  AMS: "Netherlands", EIN: "Netherlands", MST: "Netherlands",
  RTM: "Netherlands",

  // ── Belgium ──────────────────────────────────────────────────────────────────
  ANR: "Belgium", BRU: "Belgium", CRL: "Belgium",

  // ── Switzerland ──────────────────────────────────────────────────────────────
  BSL: "Switzerland", GVA: "Switzerland", ZRH: "Switzerland",

  // ── Austria ──────────────────────────────────────────────────────────────────
  GRZ: "Austria", INN: "Austria", LNZ: "Austria", SZG: "Austria",
  VIE: "Austria",

  // ── Portugal ─────────────────────────────────────────────────────────────────
  FAO: "Portugal", FNC: "Portugal", LIS: "Portugal", OPO: "Portugal",
  PDL: "Portugal", TER: "Portugal",

  // ── Greece ───────────────────────────────────────────────────────────────────
  ATH: "Greece", CFU: "Greece", CHQ: "Greece", HER: "Greece",
  JMK: "Greece", JTR: "Greece", KGS: "Greece", MJT: "Greece",
  RHO: "Greece", SKG: "Greece", ZTH: "Greece",

  // ── Turkey ───────────────────────────────────────────────────────────────────
  ADB: "Turkey", ADF: "Turkey", AYT: "Turkey", BJV: "Turkey",
  DLM: "Turkey", ERC: "Turkey", ERZ: "Turkey", ESB: "Turkey",
  GZP: "Turkey", GZT: "Turkey", IST: "Turkey", KCO: "Turkey",
  KYA: "Turkey", MLX: "Turkey", SAW: "Turkey", SZF: "Turkey",
  TZX: "Turkey", VAN: "Turkey",

  // ── Scandinavia ──────────────────────────────────────────────────────────────
  // Sweden
  ARN: "Sweden", GOT: "Sweden", LLA: "Sweden", MMX: "Sweden", NYO: "Sweden",
  // Norway
  AES: "Norway", BGO: "Norway", BOO: "Norway", KKN: "Norway", KRS: "Norway",
  OSL: "Norway", SVG: "Norway", TOS: "Norway", TRD: "Norway",
  // Denmark
  AAL: "Denmark", AAR: "Denmark", BLL: "Denmark", CPH: "Denmark",
  // Finland
  HEL: "Finland", KEM: "Finland", OUL: "Finland", RVN: "Finland",
  TMP: "Finland", TKU: "Finland",
  // Iceland
  AEY: "Iceland", KEF: "Iceland",

  // ── Eastern Europe ───────────────────────────────────────────────────────────
  // Poland
  GDN: "Poland", KRK: "Poland", KTW: "Poland", LCJ: "Poland",
  POZ: "Poland", RZE: "Poland", WAW: "Poland", WRO: "Poland",
  // Czech Republic
  BRQ: "Czech Republic", OSR: "Czech Republic", PRG: "Czech Republic",
  // Hungary
  BUD: "Hungary", DEB: "Hungary",
  // Romania
  CLJ: "Romania", CND: "Romania", IAS: "Romania", OTP: "Romania",
  SBZ: "Romania", TSR: "Romania",
  // Bulgaria
  BOJ: "Bulgaria", PDV: "Bulgaria", SOF: "Bulgaria", VAR: "Bulgaria",
  // Serbia
  BEG: "Serbia", INI: "Serbia",
  // Croatia
  DBV: "Croatia", PUY: "Croatia", RJK: "Croatia", SPU: "Croatia",
  ZAG: "Croatia",
  // Slovenia
  LJU: "Slovenia",
  // Slovakia
  BTS: "Slovakia", KSC: "Slovakia",
  // Bosnia
  SJJ: "Bosnia and Herzegovina",
  // North Macedonia
  SKP: "North Macedonia",
  // Albania
  TIA: "Albania",
  // Kosovo
  PRN: "Kosovo",
  // Moldova
  KIV: "Moldova",
  // Ukraine
  IEV: "Ukraine", KBP: "Ukraine", LWO: "Ukraine", ODS: "Ukraine",
  // Belarus
  MSQ: "Belarus",
  // Baltic States
  RIX: "Latvia", TLL: "Estonia", VNO: "Lithuania",

  // ── Russia ───────────────────────────────────────────────────────────────────
  AER: "Russia", DME: "Russia", KZN: "Russia", LED: "Russia",
  OVB: "Russia", ROV: "Russia", SVO: "Russia", SVX: "Russia",
  UFA: "Russia", VKO: "Russia",

  // ── Middle East ──────────────────────────────────────────────────────────────
  // Saudi Arabia
  AHB: "Saudi Arabia", AJF: "Saudi Arabia", BHH: "Saudi Arabia",
  DMM: "Saudi Arabia", GIZ: "Saudi Arabia", HAS: "Saudi Arabia",
  JED: "Saudi Arabia", MED: "Saudi Arabia", RUH: "Saudi Arabia",
  TIF: "Saudi Arabia", TUU: "Saudi Arabia", YNB: "Saudi Arabia",
  // UAE
  AUH: "United Arab Emirates", DWC: "United Arab Emirates",
  DXB: "United Arab Emirates", FJR: "United Arab Emirates",
  RKT: "United Arab Emirates", SHJ: "United Arab Emirates",
  // Qatar
  DOH: "Qatar",
  // Kuwait
  KWI: "Kuwait",
  // Bahrain
  BAH: "Bahrain",
  // Oman
  MCT: "Oman", SLL: "Oman",
  // Jordan
  AMM: "Jordan", AQJ: "Jordan",
  // Lebanon
  BEY: "Lebanon",
  // Israel
  TLV: "Israel",
  // Iraq
  BGW: "Iraq", BSR: "Iraq", EBL: "Iraq", ISU: "Iraq", NJF: "Iraq",
  // Iran
  IKA: "Iran", MHD: "Iran", SYZ: "Iran", THR: "Iran",
  // Yemen
  ADE: "Yemen", SAH: "Yemen",
  // Syria
  ALP: "Syria", DAM: "Syria",

  // ── South Asia ───────────────────────────────────────────────────────────────
  // India
  AMD: "India", ATQ: "India", BBI: "India", BDQ: "India",
  BHO: "India", BLR: "India", BOM: "India", BHU: "India",
  CCJ: "India", CCU: "India", CJB: "India", COK: "India",
  DEL: "India", GAY: "India", GAU: "India", GOI: "India",
  HYD: "India", IXA: "India", IXB: "India", IXC: "India",
  IXE: "India", IXJ: "India", IXM: "India", IXR: "India",
  IXZ: "India", JAI: "India", JLR: "India", JSA: "India",
  LKO: "India", MAA: "India", NAG: "India", PAT: "India",
  PNQ: "India", RAJ: "India", RPR: "India", STV: "India",
  SXR: "India", TRV: "India", TRZ: "India", UDR: "India",
  VGA: "India", VNS: "India", VTZ: "India",
  // Pakistan
  ISB: "Pakistan", KHI: "Pakistan", LHE: "Pakistan", MUX: "Pakistan",
  PEW: "Pakistan", SKT: "Pakistan", UET: "Pakistan",
  // Bangladesh
  CGP: "Bangladesh", DAC: "Bangladesh", ZYL: "Bangladesh",
  // Sri Lanka
  CMB: "Sri Lanka", HRI: "Sri Lanka",
  // Nepal
  KTM: "Nepal",
  // Maldives
  MLE: "Maldives",
  // Afghanistan
  KBL: "Afghanistan",

  // ── Southeast Asia ───────────────────────────────────────────────────────────
  // Thailand
  BKK: "Thailand", CNX: "Thailand", DMK: "Thailand", HDY: "Thailand",
  HKT: "Thailand", KBV: "Thailand", KOP: "Thailand", NST: "Thailand",
  USM: "Thailand", UTP: "Thailand",
  // Vietnam
  DAD: "Vietnam", HAN: "Vietnam", HPH: "Vietnam", PQC: "Vietnam",
  SGN: "Vietnam", UIH: "Vietnam", VCA: "Vietnam",
  // Malaysia
  BKI: "Malaysia", IPH: "Malaysia", JHB: "Malaysia", KBR: "Malaysia",
  KCH: "Malaysia", KUL: "Malaysia", LGK: "Malaysia", MKZ: "Malaysia",
  PEN: "Malaysia", SZB: "Malaysia", TGG: "Malaysia",
  // Singapore
  SIN: "Singapore",
  // Indonesia
  AMQ: "Indonesia", BPN: "Indonesia", CGK: "Indonesia", DPS: "Indonesia",
  DJJ: "Indonesia", GTO: "Indonesia", HLP: "Indonesia", JOG: "Indonesia",
  KNO: "Indonesia", LOP: "Indonesia", MDC: "Indonesia", MES: "Indonesia",
  MOF: "Indonesia", PLM: "Indonesia", PKU: "Indonesia", SOC: "Indonesia",
  SUB: "Indonesia", SRG: "Indonesia", TIM: "Indonesia", UPG: "Indonesia",
  // Philippines
  BCD: "Philippines", CBO: "Philippines", CEB: "Philippines",
  DVO: "Philippines", GES: "Philippines", ILO: "Philippines",
  KLO: "Philippines", LAO: "Philippines", MNL: "Philippines",
  // Myanmar
  MDL: "Myanmar", RGN: "Myanmar",
  // Cambodia
  PNH: "Cambodia", REP: "Cambodia",
  // Laos
  LPQ: "Laos", VTE: "Laos",
  // Brunei
  BWN: "Brunei",
  // Timor-Leste
  DIL: "Timor-Leste",

  // ── East Asia ────────────────────────────────────────────────────────────────
  // Japan
  AOJ: "Japan", CTS: "Japan", FUK: "Japan", HIJ: "Japan",
  HND: "Japan", KIX: "Japan", KMI: "Japan", KMJ: "Japan",
  KOJ: "Japan", MYJ: "Japan", NGO: "Japan", NGS: "Japan",
  NRT: "Japan", OIT: "Japan", OKA: "Japan", OKJ: "Japan",
  OSA: "Japan", SDJ: "Japan", SHM: "Japan", TOY: "Japan",
  UBJ: "Japan",
  // South Korea
  CJU: "South Korea", GMP: "South Korea", HIN: "South Korea",
  ICN: "South Korea", KWJ: "South Korea", MWX: "South Korea",
  PUS: "South Korea", TAE: "South Korea", USN: "South Korea",
  // China
  BJS: "China", CAN: "China", CGO: "China", CKG: "China",
  CSX: "China", CTU: "China", CZX: "China", DLC: "China",
  FOC: "China", HAK: "China", HFE: "China", HGH: "China",
  HRB: "China", KMG: "China", KWL: "China", LHW: "China",
  NKG: "China", NNG: "China", PEK: "China", PKX: "China",
  PVG: "China", SHA: "China", SHE: "China", SIA: "China",
  SYX: "China", TAO: "China", TNA: "China", TSN: "China",
  TYN: "China", URC: "China", WUH: "China", WUX: "China",
  XIY: "China", XMN: "China",
  // Hong Kong
  HKG: "Hong Kong",
  // Macau
  MFM: "Macau",
  // Taiwan
  KHH: "Taiwan", RMQ: "Taiwan", TPE: "Taiwan", TSA: "Taiwan",
  // Mongolia
  ULN: "Mongolia",

  // ── Central Asia ─────────────────────────────────────────────────────────────
  ALA: "Kazakhstan", NQZ: "Kazakhstan", TSE: "Kazakhstan",
  FRU: "Kyrgyzstan", OSS: "Kyrgyzstan",
  DYU: "Tajikistan",
  ASB: "Turkmenistan",
  TAS: "Uzbekistan", SKD: "Uzbekistan", UGC: "Uzbekistan",

  // ── Caucasus ─────────────────────────────────────────────────────────────────
  GYD: "Azerbaijan", TBS: "Georgia", EVN: "Armenia",

  // ── Africa ───────────────────────────────────────────────────────────────────
  // North Africa
  ALG: "Algeria", MRU: "Mauritius", ORN: "Algeria", TUN: "Tunisia",
  SFA: "Tunisia", MIR: "Tunisia", TLM: "Algeria",
  CAI: "Egypt", HBE: "Egypt", HRG: "Egypt", LXR: "Egypt", SSH: "Egypt",
  CMN: "Morocco", FEZ: "Morocco", MHN: "Morocco", OUD: "Morocco",
  RAK: "Morocco", RBA: "Morocco", TNG: "Morocco",
  TIP: "Libya", BEN: "Libya",
  KRT: "Sudan",
  // East Africa
  ADD: "Ethiopia", DIR: "Djibouti", JIB: "Djibouti",
  ASM: "Eritrea", MBA: "Kenya", NBO: "Kenya", KIS: "Kenya",
  DAR: "Tanzania", JRO: "Tanzania", ZNZ: "Tanzania",
  EBB: "Uganda", KLA: "Uganda",
  KGL: "Rwanda",
  BJM: "Burundi",
  MGQ: "Somalia",
  HGA: "Somalia",
  // West Africa
  ABJ: "Ivory Coast", ABV: "Nigeria", ACC: "Ghana", BKO: "Mali",
  CKY: "Guinea", COO: "Benin", DKR: "Senegal", DSS: "Senegal",
  FNA: "Sierra Leone", KAN: "Nigeria", LFW: "Togo", LOS: "Nigeria",
  NIM: "Niger", OUA: "Burkina Faso", PBM: "Suriname", ROB: "Liberia",
  TBS: "Georgia",
  // Southern Africa
  BEW: "Mozambique", CPT: "South Africa", DUR: "South Africa",
  GBE: "Botswana", HRE: "Zimbabwe", JNB: "South Africa",
  LAD: "Angola", LLW: "Malawi", LUN: "Zambia",
  MQP: "South Africa", MPM: "Mozambique", MTS: "Eswatini",
  NLD: "South Africa", PLZ: "South Africa", WDH: "Namibia",
  // Central Africa
  BBM: "Cameroon", BGF: "Central African Republic", BKY: "Congo",
  DLA: "Cameroon", FIH: "Democratic Republic of the Congo",
  FOM: "Cameroon", LBV: "Gabon", LFI: "Democratic Republic of the Congo",
  MYC: "Venezuela", NDJ: "Chad", YAO: "Cameroon",
  // Indian Ocean
  ANT: "Comoros", DZA: "Mayotte", HAH: "Comoros", MAJ: "Marshall Islands",
  MRU: "Mauritius", MTS: "Eswatini", RUN: "Réunion", SEZ: "Seychelles",

  // ── Oceania ──────────────────────────────────────────────────────────────────
  // Australia
  ADL: "Australia", ASP: "Australia", BNE: "Australia", CBR: "Australia",
  CNS: "Australia", DRW: "Australia", HBA: "Australia", LST: "Australia",
  MEL: "Australia", MKY: "Australia", OOL: "Australia", PER: "Australia",
  SYD: "Australia", TSV: "Australia",
  // New Zealand
  AKL: "New Zealand", CHC: "New Zealand", DUD: "New Zealand",
  HLZ: "New Zealand", NPE: "New Zealand", NSN: "New Zealand",
  NPL: "New Zealand", PMR: "New Zealand", ROT: "New Zealand",
  TRG: "New Zealand", WLG: "New Zealand", ZQN: "New Zealand",
  // Pacific Islands
  APW: "Samoa", FUN: "Tuvalu", GUM: "Guam", HIR: "Solomon Islands",
  INU: "Nauru", KBV: "Thailand", NAN: "Fiji", PNI: "Micronesia",
  PPT: "French Polynesia", RAR: "Cook Islands", SUV: "Fiji",
  TBU: "Tonga", UAP: "French Polynesia", VLI: "Vanuatu",

  // ── Miscellaneous / Territories ───────────────────────────────────────────────
  AGA: "Morocco", ACE: "Spain", // Canary Islands → Spain
  AXA: "Anguilla", BQN: "Puerto Rico", CYB: "Cayman Islands",
  GGT: "Bahamas", GHB: "Bahamas", RSD: "Bahamas",
  SBH: "Saint Barthélemy",
};

/**
 * Resolve a 3-letter IATA airport code to a country name.
 * @param {string|null} code
 * @returns {string|null}
 */
export function iataToCountry(code) {
  if (!code || typeof code !== "string") return null;
  return IATA_MAP[code.toUpperCase()] ?? null;
}
