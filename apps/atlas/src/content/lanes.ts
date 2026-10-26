/*
  Lanes: the fixed routes goods take from A to B, by sea, road, air and rail.

  A lane is an origin and a destination. Between them sit a handful of standard routes, each a
  chain of route points: ports, canals, straits, border crossings, airports, airspace and rail
  corridors. Events on the map are tagged to route points by the hourly pipeline
  (scripts/lanetags.mjs), so a route carries the risk of every point it passes.

  The routes come from this library only; customers pick an origin and a destination, not legs.
    - sea: shortest paths over a network of ports and sea waypoints, plus the same path with a
      canal or strait avoided (Suez and the Red Sea, Panama, the Taiwan Strait), and US/Canada
      West Coast port + rail for Asia to the east
    - road: one route per border crossing that serves the two countries (the three shortest)
    - air: direct, and via the cargo hubs that add at most a quarter to the distance
    - rail: China–Europe corridors (north through Russia, the Middle Corridor through the
      Caspian), and North American routes through the rail border crossings

  Distances are great-circle with a detour factor, transit days follow from typical speeds and
  dwell times, and costIndex is a relative cost estimate (cheapest route of the lane = 1). They
  are starting values: the customer's own quotes and transit times replace them.

  Pure data and functions, no imports: the pipeline (Node) and both apps read it.
*/

export type Mode = "sea" | "road" | "air" | "rail";
export const MODES: Mode[] = ["sea", "road", "air", "rail"];
export const MODE_LABEL: Record<Mode, string> = { sea: "Sea", road: "Road", air: "Air", rail: "Rail" };

export type PointKind = "port" | "canal" | "strait" | "cape" | "sea" | "border" | "ferry" | "airport" | "airspace" | "rail" | "waypoint";
export const KIND_LABEL: Record<PointKind, string> = {
  port: "Port",
  canal: "Canal",
  strait: "Strait",
  cape: "Cape route",
  sea: "Sea area",
  border: "Border crossing",
  ferry: "Ferry crossing",
  airport: "Airport",
  airspace: "Airspace",
  rail: "Rail corridor",
  waypoint: "Waypoint",
};

export interface RoutePoint {
  id: string;
  name: string;
  kind: PointKind;
  modes: Mode[];
  lat: number;
  lon: number;
  countries: string[]; // ISO-2 of the states that control or border it
  standing?: string; // a lasting condition worth knowing, not an event (shown, not scored)
}

const P = (id: string, name: string, kind: PointKind, modes: Mode[], lat: number, lon: number, countries: string[], standing?: string): RoutePoint => ({
  id, name, kind, modes, lat, lon, countries, ...(standing ? { standing } : {}),
});

// --- route points ---------------------------------------------------------------------------

export const POINTS: RoutePoint[] = [
  // sea: ports (they are also the places a sea lane starts and ends)
  P("SHANGHAI", "Port of Shanghai", "port", ["sea"], 31.23, 121.8, ["CN"]),
  P("YANTIAN", "Port of Shenzhen (Yantian)", "port", ["sea"], 22.57, 114.28, ["CN"]),
  P("BUSAN", "Port of Busan", "port", ["sea"], 35.1, 129.04, ["KR"]),
  P("YOKOHAMA", "Port of Tokyo–Yokohama", "port", ["sea"], 35.44, 139.65, ["JP"]),
  P("KAOHSIUNG", "Port of Kaohsiung", "port", ["sea"], 22.6, 120.28, ["TW"]),
  P("HCMC", "Port of Ho Chi Minh City (Cai Mep)", "port", ["sea"], 10.5, 107.03, ["VN"]),
  P("LAEMCHABANG", "Port of Laem Chabang", "port", ["sea"], 13.08, 100.88, ["TH"]),
  P("SINGAPORE", "Port of Singapore", "port", ["sea"], 1.26, 103.84, ["SG"]),
  P("NHAVA", "Port of Nhava Sheva (Mumbai)", "port", ["sea"], 18.95, 72.95, ["IN"]),
  P("CHENNAI", "Port of Chennai", "port", ["sea"], 13.1, 80.3, ["IN"]),
  P("JEBELALI", "Port of Jebel Ali (Dubai)", "port", ["sea"], 25.0, 55.06, ["AE"]),
  P("HAMBURG", "Port of Hamburg", "port", ["sea"], 53.54, 9.98, ["DE"]),
  P("ROTTERDAM", "Port of Rotterdam", "port", ["sea"], 51.95, 4.05, ["NL"]),
  P("ANTWERP", "Port of Antwerp-Bruges", "port", ["sea"], 51.3, 4.3, ["BE"]),
  P("FELIXSTOWE", "Port of Felixstowe", "port", ["sea"], 51.95, 1.33, ["GB"]),
  P("GDANSK", "Port of Gdańsk", "port", ["sea"], 54.4, 18.67, ["PL"]),
  P("GENOA", "Port of Genoa", "port", ["sea"], 44.4, 8.9, ["IT"]),
  P("VALENCIA", "Port of Valencia", "port", ["sea"], 39.45, -0.32, ["ES"]),
  P("PIRAEUS", "Port of Piraeus", "port", ["sea"], 37.94, 23.62, ["GR"]),
  P("ISTANBUL_PORT", "Port of Istanbul (Ambarlı)", "port", ["sea"], 40.97, 28.68, ["TR"]),
  P("NYNJ", "Port of New York and New Jersey", "port", ["sea"], 40.67, -74.15, ["US"]),
  P("SAVANNAH", "Port of Savannah", "port", ["sea"], 32.08, -81.09, ["US"]),
  P("HOUSTON", "Port of Houston", "port", ["sea"], 29.73, -95.0, ["US"]),
  P("LALB", "Ports of Los Angeles and Long Beach", "port", ["sea"], 33.74, -118.26, ["US"]),
  P("SEATTLE", "Ports of Seattle and Tacoma", "port", ["sea"], 47.6, -122.4, ["US"]),
  P("VANCOUVER", "Port of Vancouver", "port", ["sea"], 49.29, -123.1, ["CA"]),
  P("MONTREAL", "Port of Montreal", "port", ["sea"], 45.55, -73.53, ["CA"]),
  P("MANZANILLO", "Port of Manzanillo", "port", ["sea"], 19.06, -104.3, ["MX"]),
  P("VERACRUZ", "Port of Veracruz", "port", ["sea"], 19.2, -96.13, ["MX"]),
  P("SANTOS", "Port of Santos", "port", ["sea"], -23.98, -46.3, ["BR"]),

  // sea: canals, straits and sea areas (the chokepoints)
  P("TAIWAN_STRAIT", "Taiwan Strait", "strait", ["sea"], 24.5, 119.6, ["TW", "CN"]),
  P("LUZON_STRAIT", "Luzon Strait", "strait", ["sea"], 20.6, 121.2, ["PH", "TW"]),
  P("SOUTH_CHINA_SEA", "South China Sea", "sea", ["sea"], 13.0, 113.0, ["CN", "VN", "PH", "MY"]),
  P("MALACCA", "Strait of Malacca", "strait", ["sea"], 2.5, 101.4, ["MY", "SG", "ID"]),
  P("HORMUZ", "Strait of Hormuz", "strait", ["sea"], 26.57, 56.25, ["IR", "OM", "AE"]),
  P("BAB_EL_MANDEB", "Bab el-Mandeb", "strait", ["sea"], 12.6, 43.3, ["YE", "DJ", "ER"]),
  P("RED_SEA", "Red Sea", "sea", ["sea"], 20.0, 38.5, ["SA", "EG", "SD", "ER", "YE"]),
  P("SUEZ", "Suez Canal", "canal", ["sea"], 30.6, 32.34, ["EG"]),
  P("GIBRALTAR", "Strait of Gibraltar", "strait", ["sea"], 35.95, -5.6, ["ES", "MA", "GB"]),
  P("ENGLISH_CHANNEL", "English Channel and Dover Strait", "strait", ["sea"], 50.9, 1.4, ["GB", "FR"]),
  P("KIEL_CANAL", "Kiel Canal", "canal", ["sea"], 54.2, 9.5, ["DE"]),
  P("DANISH_STRAITS", "Danish Straits", "strait", ["sea"], 57.8, 10.6, ["DK", "SE"]),
  P("CAPE_GOOD_HOPE", "Cape of Good Hope", "cape", ["sea"], -34.8, 18.5, ["ZA"]),
  P("PANAMA", "Panama Canal", "canal", ["sea"], 9.1, -79.68, ["PA"]),

  // sea: waypoints that only shape the drawn path (never tagged)
  P("W_JAPAN_SW", "South of Kyushu", "waypoint", ["sea"], 30.5, 131.5, []),
  P("W_NPAC_JAPAN", "East of Japan", "waypoint", ["sea"], 34.0, 142.5, []),
  P("W_EAST_TAIWAN", "East of Taiwan", "waypoint", ["sea"], 23.5, 123.0, []),
  P("W_GULF_TH", "Gulf of Thailand", "waypoint", ["sea"], 7.0, 103.0, []),
  P("W_DONDRA", "South of Sri Lanka", "waypoint", ["sea"], 5.6, 80.6, []),
  P("W_ARABIAN", "Gulf of Oman", "waypoint", ["sea"], 22.5, 60.5, []),
  P("W_SEYCHELLES", "Western Indian Ocean", "waypoint", ["sea"], -5.0, 56.0, []),
  P("W_INDIAN_S", "Southern Indian Ocean", "waypoint", ["sea"], -10.0, 88.0, []),
  P("W_MADAGASCAR_S", "South of Madagascar", "waypoint", ["sea"], -28.0, 47.0, []),
  P("W_CRETE", "South of Crete", "waypoint", ["sea"], 34.2, 24.5, []),
  P("W_AEGEAN", "Aegean Sea", "waypoint", ["sea"], 38.6, 25.3, []),
  P("W_SICILY_CH", "Strait of Sicily", "waypoint", ["sea"], 37.2, 11.8, []),
  P("W_MED_W", "Western Mediterranean", "waypoint", ["sea"], 37.6, 3.0, []),
  P("W_SVINCENT", "Off Cape St Vincent", "waypoint", ["sea"], 36.8, -9.6, []),
  P("W_FINISTERRE", "Off Cape Finisterre", "waypoint", ["sea"], 43.5, -10.0, []),
  P("W_USHANT", "Off Ushant", "waypoint", ["sea"], 48.6, -6.0, []),
  P("W_NORTHSEA", "Southern North Sea", "waypoint", ["sea"], 52.8, 3.0, []),
  P("W_GERMAN_BIGHT", "German Bight", "waypoint", ["sea"], 54.1, 7.6, []),
  P("W_BALTIC", "Western Baltic", "waypoint", ["sea"], 55.2, 14.5, []),
  P("W_CANARIES", "Off the Canary Islands", "waypoint", ["sea"], 28.5, -16.8, []),
  P("W_CAPEVERDE", "Off Cape Verde", "waypoint", ["sea"], 15.0, -21.0, []),
  P("W_GUINEA", "Gulf of Guinea", "waypoint", ["sea"], -2.0, 0.0, []),
  P("W_SOUTH_ATL", "South Atlantic", "waypoint", ["sea"], -10.0, -25.0, []),
  P("W_BRAZIL_NE", "Off north-east Brazil", "waypoint", ["sea"], -5.0, -33.0, []),
  P("W_ANTILLES", "East of the Antilles", "waypoint", ["sea"], 17.0, -58.0, []),
  P("W_AZORES", "Near the Azores", "waypoint", ["sea"], 37.5, -28.0, []),
  P("W_NATL", "North Atlantic", "waypoint", ["sea"], 45.0, -40.0, []),
  P("W_CABOT", "Cabot Strait", "waypoint", ["sea"], 47.3, -60.0, []),
  P("W_WINDWARD", "Windward Passage", "waypoint", ["sea"], 20.0, -73.8, []),
  P("W_YUCATAN", "Yucatán Channel", "waypoint", ["sea"], 21.6, -85.6, []),
  P("W_FLORIDA", "Straits of Florida", "waypoint", ["sea"], 24.3, -81.5, []),
  P("W_PACIFIC_CA", "Off Central America", "waypoint", ["sea"], 11.0, -90.0, []),

  // road: border crossings and ferries
  P("LAREDO", "Laredo–Nuevo Laredo crossing", "border", ["road"], 27.6, -99.53, ["US", "MX"], "The busiest land port for US–Mexico trade."),
  P("PHARR", "Pharr–Reynosa crossing", "border", ["road"], 26.08, -98.2, ["US", "MX"]),
  P("EAGLE_PASS", "Eagle Pass–Piedras Negras crossing", "border", ["road"], 28.71, -100.5, ["US", "MX"]),
  P("EL_PASO", "El Paso–Ciudad Juárez crossing", "border", ["road"], 31.7, -106.3, ["US", "MX"]),
  P("NOGALES", "Nogales crossing", "border", ["road"], 31.33, -110.94, ["US", "MX"]),
  P("OTAY_MESA", "Otay Mesa–Tijuana crossing", "border", ["road"], 32.55, -116.94, ["US", "MX"]),
  P("AMBASSADOR", "Detroit–Windsor crossing", "border", ["road"], 42.31, -83.07, ["US", "CA"], "The busiest US–Canada truck crossing."),
  P("BLUE_WATER", "Port Huron–Sarnia (Blue Water Bridge)", "border", ["road"], 42.99, -82.42, ["US", "CA"]),
  P("PEACE_BRIDGE", "Buffalo–Fort Erie crossings", "border", ["road"], 42.9, -78.9, ["US", "CA"]),
  P("CHAMPLAIN", "Champlain–Lacolle crossing", "border", ["road"], 45.0, -73.45, ["US", "CA"]),
  P("BLAINE", "Blaine–Surrey crossing", "border", ["road"], 49.0, -122.75, ["US", "CA"]),
  P("KAPIKULE", "Kapıkule–Kapitan Andreevo crossing", "border", ["road", "rail"], 41.72, 26.36, ["TR", "BG"], "Turkey–EU customs border; long truck queues are common."),
  P("RORO_TRIESTE", "Turkey–Trieste roll-on roll-off ferries", "ferry", ["road"], 37.5, 19.5, ["TR", "IT"]),
  P("DOVER_CALAIS", "Dover–Calais ferries", "ferry", ["road"], 51.0, 1.55, ["GB", "FR"], "UK–EU customs checks apply since Brexit."),
  P("CHANNEL_TUNNEL", "Channel Tunnel (Folkestone–Calais)", "border", ["road"], 51.05, 1.3, ["GB", "FR"], "UK–EU customs checks apply since Brexit."),
  P("HOOK_HARWICH", "Harwich–Hook of Holland ferries", "ferry", ["road"], 52.0, 3.0, ["GB", "NL"], "UK–EU customs checks apply since Brexit."),
  P("BRENNER", "Brenner Pass", "border", ["road"], 47.0, 11.5, ["AT", "IT"], "Tyrol limits heavy trucks with night bans and block dispatching."),
  P("GOTTHARD", "Gotthard road tunnel", "border", ["road"], 46.55, 8.57, ["CH"], "Switzerland is outside the EU customs union; trucks clear customs twice."),
  P("MONT_BLANC", "Mont Blanc Tunnel", "border", ["road"], 45.85, 6.9, ["FR", "IT"]),
  P("FREJUS", "Fréjus Tunnel", "border", ["road"], 45.1, 6.7, ["FR", "IT"]),
  P("LA_JONQUERA", "La Jonquera–Le Perthus crossing", "border", ["road"], 42.45, 2.87, ["ES", "FR"]),
  P("IRUN", "Irun–Biriatou crossing", "border", ["road"], 43.35, -1.77, ["ES", "FR"]),

  // air: airports and hubs
  P("PVG", "Shanghai Pudong airport", "airport", ["air"], 31.14, 121.8, ["CN"]),
  P("HKG", "Hong Kong airport", "airport", ["air"], 22.31, 113.92, ["HK"]),
  P("ICN", "Seoul Incheon airport", "airport", ["air"], 37.46, 126.44, ["KR"]),
  P("NRT", "Tokyo Narita airport", "airport", ["air"], 35.77, 140.39, ["JP"]),
  P("TPE", "Taipei Taoyuan airport", "airport", ["air"], 25.08, 121.23, ["TW"]),
  P("SIN", "Singapore Changi airport", "airport", ["air"], 1.36, 103.99, ["SG"]),
  P("SGN", "Ho Chi Minh City airport", "airport", ["air"], 10.82, 106.66, ["VN"]),
  P("BOM", "Mumbai airport", "airport", ["air"], 19.09, 72.87, ["IN"]),
  P("DEL", "Delhi airport", "airport", ["air"], 28.56, 77.1, ["IN"]),
  P("DXB", "Dubai airport", "airport", ["air"], 25.25, 55.36, ["AE"]),
  P("DOH", "Doha airport", "airport", ["air"], 25.27, 51.61, ["QA"]),
  P("IST", "Istanbul airport", "airport", ["air"], 41.26, 28.74, ["TR"]),
  P("FRA", "Frankfurt airport", "airport", ["air"], 50.04, 8.56, ["DE"]),
  P("LEJ", "Leipzig/Halle airport", "airport", ["air"], 51.42, 12.24, ["DE"]),
  P("AMS", "Amsterdam Schiphol airport", "airport", ["air"], 52.31, 4.76, ["NL"]),
  P("LHR", "London Heathrow airport", "airport", ["air"], 51.47, -0.45, ["GB"]),
  P("CDG", "Paris Charles de Gaulle airport", "airport", ["air"], 49.01, 2.55, ["FR"]),
  P("MXP", "Milan Malpensa airport", "airport", ["air"], 45.63, 8.72, ["IT"]),
  P("ANC", "Anchorage airport", "airport", ["air"], 61.17, -150.0, ["US"]),
  P("ORD", "Chicago O'Hare airport", "airport", ["air"], 41.98, -87.9, ["US"]),
  P("JFK", "New York JFK airport", "airport", ["air"], 40.64, -73.78, ["US"]),
  P("ATL", "Atlanta airport", "airport", ["air"], 33.64, -84.43, ["US"]),
  P("DFW", "Dallas–Fort Worth airport", "airport", ["air"], 32.9, -97.04, ["US"]),
  P("LAX", "Los Angeles airport", "airport", ["air"], 33.94, -118.41, ["US"]),
  P("MEM", "Memphis airport", "airport", ["air"], 35.04, -89.98, ["US"]),
  P("SDF", "Louisville airport", "airport", ["air"], 38.17, -85.74, ["US"]),
  P("YYZ", "Toronto Pearson airport", "airport", ["air"], 43.68, -79.63, ["CA"]),
  P("MEX", "Mexico City airport", "airport", ["air"], 19.44, -99.07, ["MX"]),
  P("GRU", "São Paulo Guarulhos airport", "airport", ["air"], -23.43, -46.47, ["BR"]),

  // air: airspace a direct path can cross (the shapes are in AIRSPACE below)
  P("RU_AIRSPACE", "Russian airspace", "airspace", ["air"], 60.0, 90.0, ["RU"], "Closed to EU, UK, US and Canadian airlines since 2022; Chinese, Gulf and Turkish carriers still fly it, others route around it."),
  P("UA_AIRSPACE", "Ukrainian airspace", "airspace", ["air"], 49.0, 31.5, ["UA"], "Closed to civil flights since February 2022; real flights route around it."),
  P("IR_AIRSPACE", "Iranian airspace", "airspace", ["air"], 32.5, 54.0, ["IR"]),
  P("IQ_SY_AIRSPACE", "Iraqi and Syrian airspace", "airspace", ["air"], 34.0, 41.0, ["IQ", "SY"]),
  P("LEVANT_AIRSPACE", "Israeli, Lebanese and Jordanian airspace", "airspace", ["air"], 31.5, 35.5, ["IL", "LB", "JO"]),

  // rail: China–Europe corridors
  P("ALASHANKOU", "Alashankou–Dostyk rail border", "rail", ["rail"], 45.2, 82.5, ["CN", "KZ"], "Gauge changes from standard to Russian broad gauge here."),
  P("KHORGOS", "Khorgos–Altynkol rail border", "rail", ["rail"], 44.2, 80.4, ["CN", "KZ"], "Gauge changes from standard to Russian broad gauge here."),
  P("KZ_RAIL", "Kazakhstan rail transit", "rail", ["rail"], 48.0, 68.0, ["KZ"]),
  P("RU_RAIL", "Russian rail transit", "rail", ["rail"], 55.0, 50.0, ["RU"], "Goods crossing Russia face EU sanctions screening; many shippers avoid this corridor."),
  P("BY_RAIL", "Belarus rail transit", "rail", ["rail"], 53.5, 28.0, ["BY"]),
  P("MALASZEWICZE", "Brest–Małaszewicze rail border", "rail", ["rail"], 52.05, 23.6, ["BY", "PL"], "The main EU entry point for China–Europe trains; gauge changes back to standard."),
  P("CASPIAN_FERRY", "Caspian Sea rail ferry (Aktau–Baku)", "rail", ["rail"], 42.0, 50.5, ["KZ", "AZ"]),
  P("GE_RAIL", "Georgia rail transit (Baku–Tbilisi–Kars)", "rail", ["rail"], 41.7, 44.8, ["AZ", "GE"]),
  P("TR_RAIL", "Turkish rail network", "rail", ["rail"], 39.9, 32.8, ["TR"]),
  // rail: North America
  P("US_RAIL", "US freight rail network", "rail", ["rail"], 39.0, -95.0, ["US"]),
  P("CA_RAIL", "Canadian freight rail network", "rail", ["rail"], 50.5, -97.0, ["CA"]),
  P("MX_RAIL", "Mexican freight rail network", "rail", ["rail"], 23.0, -102.0, ["MX"]),
  P("LAREDO_RAIL", "Laredo international rail bridge", "rail", ["rail"], 27.5, -99.5, ["US", "MX"]),
  P("EAGLE_PASS_RAIL", "Eagle Pass rail bridge", "rail", ["rail"], 28.71, -100.51, ["US", "MX"]),
  P("EL_PASO_RAIL", "El Paso rail crossing", "rail", ["rail"], 31.75, -106.45, ["US", "MX"]),
  P("DETROIT_RAIL", "Detroit–Windsor rail tunnel", "rail", ["rail"], 42.32, -83.05, ["US", "CA"]),
  P("SARNIA_RAIL", "Port Huron–Sarnia rail tunnel", "rail", ["rail"], 42.96, -82.42, ["US", "CA"]),
  P("NIAGARA_RAIL", "Buffalo–Niagara rail crossing", "rail", ["rail"], 42.9, -79.0, ["US", "CA"]),
];

export const POINT_BY_ID: Record<string, RoutePoint> = Object.fromEntries(POINTS.map((p) => [p.id, p]));
export const TAGGABLE: RoutePoint[] = POINTS.filter((p) => p.kind !== "waypoint");
export function getPoint(id: string): RoutePoint | undefined {
  return POINT_BY_ID[id];
}

// --- places a lane can start or end ---------------------------------------------------------

export interface Place {
  id: string;
  name: string;
  country: string;
  mode: Mode;
  lat: number;
  lon: number;
  node?: string; // the route point it joins the network at (sea: its port, air: its airport)
}

const fromPoint = (id: string, name: string, mode: Mode): Place => {
  const p = POINT_BY_ID[id];
  return { id: `${mode}:${id}`, name, country: p.countries[0], mode, lat: p.lat, lon: p.lon, node: id };
};
const city = (mode: Mode, id: string, name: string, country: string, lat: number, lon: number): Place => ({ id: `${mode}:${id}`, name, country, mode, lat, lon });

export const PLACES: Place[] = [
  // sea: every port
  ...POINTS.filter((p) => p.kind === "port").map((p) => fromPoint(p.id, p.name.replace(/^Ports? of /, ""), "sea")),
  // air: every airport
  ...POINTS.filter((p) => p.kind === "airport").map((p) => fromPoint(p.id, p.name.replace(/ airport$/, ""), "air")),
  // road
  city("road", "MONTERREY", "Monterrey", "MX", 25.69, -100.32),
  city("road", "SALTILLO", "Saltillo", "MX", 25.42, -101.0),
  city("road", "MEXICO_CITY", "Mexico City", "MX", 19.43, -99.13),
  city("road", "QUERETARO", "Querétaro", "MX", 20.59, -100.39),
  city("road", "JUAREZ", "Ciudad Juárez", "MX", 31.69, -106.42),
  city("road", "TIJUANA", "Tijuana", "MX", 32.51, -117.04),
  city("road", "HERMOSILLO", "Hermosillo", "MX", 29.07, -110.96),
  city("road", "DETROIT", "Detroit", "US", 42.33, -83.05),
  city("road", "CHICAGO", "Chicago", "US", 41.88, -87.63),
  city("road", "ALLENTOWN", "Allentown (Lehigh Valley)", "US", 40.6, -75.47),
  city("road", "COLUMBUS", "Columbus", "US", 39.96, -83.0),
  city("road", "NASHVILLE", "Nashville", "US", 36.16, -86.78),
  city("road", "ATLANTA", "Atlanta", "US", 33.75, -84.39),
  city("road", "DALLAS", "Dallas", "US", 32.78, -96.8),
  city("road", "HOUSTON", "Houston", "US", 29.76, -95.37),
  city("road", "PHOENIX", "Phoenix", "US", 33.45, -112.07),
  city("road", "LOS_ANGELES", "Los Angeles", "US", 34.05, -118.24),
  city("road", "SEATTLE", "Seattle", "US", 47.61, -122.33),
  city("road", "TORONTO", "Toronto", "CA", 43.65, -79.38),
  city("road", "MONTREAL", "Montreal", "CA", 45.5, -73.57),
  city("road", "WINDSOR", "Windsor", "CA", 42.31, -83.04),
  city("road", "VANCOUVER", "Vancouver", "CA", 49.28, -123.12),
  city("road", "ISTANBUL", "Istanbul", "TR", 41.01, 28.98),
  city("road", "BURSA", "Bursa", "TR", 40.19, 29.06),
  city("road", "LONDON", "London", "GB", 51.51, -0.13),
  city("road", "BIRMINGHAM", "Birmingham", "GB", 52.49, -1.89),
  city("road", "PARIS", "Paris", "FR", 48.86, 2.35),
  city("road", "LYON", "Lyon", "FR", 45.76, 4.84),
  city("road", "MUNICH", "Munich", "DE", 48.14, 11.58),
  city("road", "STUTTGART", "Stuttgart", "DE", 48.78, 9.18),
  city("road", "COLOGNE", "Cologne", "DE", 50.94, 6.96),
  city("road", "ROTTERDAM", "Rotterdam", "NL", 51.92, 4.48),
  city("road", "WARSAW", "Warsaw", "PL", 52.23, 21.01),
  city("road", "MILAN", "Milan", "IT", 45.46, 9.19),
  city("road", "TURIN", "Turin", "IT", 45.07, 7.69),
  city("road", "MADRID", "Madrid", "ES", 40.42, -3.7),
  city("road", "BARCELONA", "Barcelona", "ES", 41.39, 2.17),
  // rail
  city("rail", "XIAN", "Xi'an", "CN", 34.27, 108.94),
  city("rail", "CHONGQING", "Chongqing", "CN", 29.56, 106.55),
  city("rail", "DUISBURG", "Duisburg", "DE", 51.43, 6.76),
  city("rail", "LODZ", "Łódź", "PL", 51.76, 19.46),
  city("rail", "HAMBURG", "Hamburg", "DE", 53.55, 10.0),
  city("rail", "ISTANBUL", "Istanbul", "TR", 41.01, 28.98),
  city("rail", "CHICAGO", "Chicago", "US", 41.88, -87.63),
  city("rail", "LOS_ANGELES", "Los Angeles", "US", 34.05, -118.24),
  city("rail", "NEWARK", "Newark (New York area)", "US", 40.74, -74.17),
  city("rail", "DETROIT", "Detroit", "US", 42.33, -83.05),
  city("rail", "DALLAS", "Dallas", "US", 32.78, -96.8),
  city("rail", "KANSAS_CITY", "Kansas City", "US", 39.1, -94.58),
  city("rail", "TORONTO", "Toronto", "CA", 43.65, -79.38),
  city("rail", "MONTREAL", "Montreal", "CA", 45.5, -73.57),
  city("rail", "VANCOUVER", "Vancouver", "CA", 49.28, -123.12),
  city("rail", "MONTERREY", "Monterrey", "MX", 25.69, -100.32),
  city("rail", "MEXICO_CITY", "Mexico City", "MX", 19.43, -99.13),
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export function placesFor(mode: Mode): Place[] {
  return PLACES.filter((p) => p.mode === mode).sort((a, b) => a.name.localeCompare(b.name));
}

// --- geometry -------------------------------------------------------------------------------

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Points along the great circle from a to b, ends included, as [lon, lat]. */
export function greatCircle(a: { lat: number; lon: number }, b: { lat: number; lon: number }, n = 24): [number, number][] {
  const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
  const d = haversineKm(a, b) / R_KM;
  if (d < 1e-9) return [[a.lon, a.lat]];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return out;
}

function inPolygon([x, y]: [number, number], poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* Rough outlines (lon, lat) of the airspace a direct flight path is checked against. */
export const AIRSPACE: Record<string, [number, number][]> = {
  RU_AIRSPACE: [
    [27.5, 57.5], [28.5, 60.5], [30.5, 69.5], [40, 69], [60, 70], [70, 73], [100, 78], [140, 73], [180, 70], [180, 65],
    [170, 60], [160, 52], [143, 46], [135, 43.5], [131, 42.6], [121, 53.3], [116, 49.8], [97, 49.7], [87.5, 49.2], [80, 51],
    [69, 55], [61, 51], [50, 47.5], [47.5, 42], [40, 43.5], [37.5, 46.5], [39.5, 48.5], [34.5, 52], [31.5, 53], [28, 56],
  ],
  UA_AIRSPACE: [[22.2, 48.4], [24, 51.6], [32, 52.3], [40.2, 49.6], [38.2, 47.1], [36.5, 45.2], [33.5, 44.4], [30.2, 45.6], [28.2, 48.1]],
  IR_AIRSPACE: [[44, 39.4], [48, 38.8], [54, 37.5], [61, 36.6], [61.5, 31], [63, 25.3], [57, 25.5], [52, 27.3], [48.5, 29.8], [46, 33], [44, 37.5]],
  IQ_SY_AIRSPACE: [[35.8, 32.5], [35.8, 36.8], [42.3, 37.3], [44.8, 37.2], [46, 33], [48.5, 29.8], [46.5, 29.1], [42, 31], [39, 32.3]],
  LEVANT_AIRSPACE: [[34.2, 29.5], [34.3, 31.3], [35, 33.1], [35.6, 34.6], [36.6, 34.4], [36.3, 33], [37.2, 32.3], [39, 32.3], [37.5, 29.3], [35, 29.4]],
};

function airspaceCrossed(path: [number, number][]): string[] {
  const hit: string[] = [];
  for (const [lon, lat] of path) {
    for (const [id, poly] of Object.entries(AIRSPACE)) {
      if (!hit.includes(id) && inPolygon([lon, lat], poly)) hit.push(id);
    }
  }
  return hit;
}

// --- routes ---------------------------------------------------------------------------------

export interface Route {
  id: string; // stable within a lane: mode + the points it passes
  mode: Mode;
  label: string; // "Via Suez Canal"
  points: string[]; // taggable route points in travel order, origin and destination ends included where they are points
  path: [number, number][]; // [lon, lat] for drawing
  km: number;
  days: number; // typical door-to-door transit, a starting value
  costIndex: number; // relative cost estimate, cheapest route of the lane = 1
  notes: string[]; // standing conditions along the route
}

export interface Lane {
  origin: Place;
  destination: Place;
  mode: Mode;
  routes: Route[];
}

type Draft = Omit<Route, "id" | "costIndex" | "notes"> & { cost: number };

function finish(mode: Mode, drafts: Draft[], max = 4): Route[] {
  const seen = new Set<string>();
  const uniq = drafts.filter((d) => {
    const k = d.points.join(">");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const kept = uniq.slice(0, max);
  const minCost = Math.min(...kept.map((d) => d.cost));
  return kept.map((d) => ({
    id: `${mode}:${d.points.join("-")}`, // unique within the lane: drafts with the same points were merged above
    mode,
    label: d.label,
    points: d.points,
    path: d.path,
    km: Math.round(d.km),
    days: Math.round(d.days * 2) / 2,
    costIndex: Math.round((d.cost / minCost) * 100) / 100,
    notes: [...new Set(d.points.map((p) => POINT_BY_ID[p]?.standing).filter((s): s is string => Boolean(s)))],
  }));
}

const coord = (p: { lat: number; lon: number }) => ({ lat: p.lat, lon: p.lon });

function drawThrough(stops: { lat: number; lon: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const seg = greatCircle(stops[i], stops[i + 1], 16);
    out.push(...(i ? seg.slice(1) : seg));
  }
  return out;
}

// sea --------------------------------------------------------------------------------------

const SEA_EDGES: [string, string][] = [
  // East Asia
  ["SHANGHAI", "TAIWAN_STRAIT"], ["SHANGHAI", "W_EAST_TAIWAN"], ["SHANGHAI", "W_JAPAN_SW"],
  ["BUSAN", "TAIWAN_STRAIT"], ["BUSAN", "W_EAST_TAIWAN"], ["BUSAN", "W_JAPAN_SW"],
  ["YOKOHAMA", "W_NPAC_JAPAN"], ["YOKOHAMA", "W_JAPAN_SW"],
  ["W_JAPAN_SW", "W_NPAC_JAPAN"], ["W_JAPAN_SW", "TAIWAN_STRAIT"], ["W_JAPAN_SW", "W_EAST_TAIWAN"],
  ["TAIWAN_STRAIT", "SOUTH_CHINA_SEA"], ["TAIWAN_STRAIT", "YANTIAN"], ["TAIWAN_STRAIT", "KAOHSIUNG"],
  ["W_EAST_TAIWAN", "LUZON_STRAIT"], ["LUZON_STRAIT", "SOUTH_CHINA_SEA"], ["LUZON_STRAIT", "KAOHSIUNG"],
  ["LUZON_STRAIT", "W_NPAC_JAPAN"], ["YANTIAN", "SOUTH_CHINA_SEA"], ["YANTIAN", "LUZON_STRAIT"], ["KAOHSIUNG", "SOUTH_CHINA_SEA"],
  ["SOUTH_CHINA_SEA", "HCMC"], ["SOUTH_CHINA_SEA", "SINGAPORE"], ["SOUTH_CHINA_SEA", "W_GULF_TH"], ["SOUTH_CHINA_SEA", "MALACCA"],
  ["LAEMCHABANG", "W_GULF_TH"], ["W_GULF_TH", "SINGAPORE"], ["W_GULF_TH", "MALACCA"], ["HCMC", "SINGAPORE"],
  // Indian Ocean and the Gulf
  ["SINGAPORE", "MALACCA"], ["MALACCA", "W_DONDRA"], ["MALACCA", "W_INDIAN_S"],
  ["W_DONDRA", "CHENNAI"], ["W_DONDRA", "NHAVA"], ["W_DONDRA", "BAB_EL_MANDEB"], ["W_DONDRA", "W_ARABIAN"], ["W_DONDRA", "W_MADAGASCAR_S"],
  ["NHAVA", "W_ARABIAN"], ["NHAVA", "BAB_EL_MANDEB"], ["NHAVA", "W_SEYCHELLES"],
  ["JEBELALI", "HORMUZ"], ["HORMUZ", "W_ARABIAN"], ["W_ARABIAN", "BAB_EL_MANDEB"], ["W_ARABIAN", "W_SEYCHELLES"],
  ["W_SEYCHELLES", "W_MADAGASCAR_S"], ["W_INDIAN_S", "W_MADAGASCAR_S"], ["W_MADAGASCAR_S", "CAPE_GOOD_HOPE"],
  // Red Sea, Suez and the Mediterranean
  ["BAB_EL_MANDEB", "RED_SEA"], ["RED_SEA", "SUEZ"], ["SUEZ", "W_CRETE"],
  ["W_CRETE", "W_AEGEAN"], ["W_AEGEAN", "PIRAEUS"], ["W_AEGEAN", "ISTANBUL_PORT"], ["W_CRETE", "W_SICILY_CH"],
  ["W_SICILY_CH", "GENOA"], ["W_SICILY_CH", "W_MED_W"], ["W_MED_W", "GENOA"], ["W_MED_W", "VALENCIA"], ["W_MED_W", "GIBRALTAR"],
  ["VALENCIA", "GIBRALTAR"],
  // North-west Europe
  ["GIBRALTAR", "W_SVINCENT"], ["W_SVINCENT", "W_FINISTERRE"], ["W_SVINCENT", "W_CANARIES"], ["W_SVINCENT", "W_AZORES"],
  ["W_FINISTERRE", "W_USHANT"], ["W_USHANT", "ENGLISH_CHANNEL"], ["W_USHANT", "W_NATL"],
  ["ENGLISH_CHANNEL", "FELIXSTOWE"], ["ENGLISH_CHANNEL", "ANTWERP"], ["ENGLISH_CHANNEL", "W_NORTHSEA"],
  ["W_NORTHSEA", "ROTTERDAM"], ["W_NORTHSEA", "FELIXSTOWE"], ["W_NORTHSEA", "W_GERMAN_BIGHT"], ["W_GERMAN_BIGHT", "HAMBURG"],
  ["W_GERMAN_BIGHT", "DANISH_STRAITS"], ["DANISH_STRAITS", "W_BALTIC"], ["W_GERMAN_BIGHT", "KIEL_CANAL"], ["KIEL_CANAL", "W_BALTIC"], ["W_BALTIC", "GDANSK"],
  // Atlantic
  ["CAPE_GOOD_HOPE", "W_GUINEA"], ["W_GUINEA", "W_CAPEVERDE"], ["W_CAPEVERDE", "W_CANARIES"], ["W_CANARIES", "W_FINISTERRE"],
  ["CAPE_GOOD_HOPE", "SANTOS"], ["CAPE_GOOD_HOPE", "W_SOUTH_ATL"], ["W_SOUTH_ATL", "W_ANTILLES"], ["W_SOUTH_ATL", "W_BRAZIL_NE"],
  ["SANTOS", "W_BRAZIL_NE"], ["W_BRAZIL_NE", "W_CAPEVERDE"], ["W_BRAZIL_NE", "W_ANTILLES"],
  ["W_ANTILLES", "NYNJ"], ["W_ANTILLES", "SAVANNAH"], ["W_ANTILLES", "W_WINDWARD"], ["W_ANTILLES", "W_AZORES"],
  ["W_AZORES", "NYNJ"], ["W_AZORES", "SAVANNAH"], ["W_AZORES", "W_FLORIDA"], ["W_AZORES", "W_CANARIES"],
  ["W_NATL", "NYNJ"], ["W_NATL", "W_CABOT"], ["W_CABOT", "MONTREAL"], ["NYNJ", "SAVANNAH"],
  // Caribbean, Gulf of Mexico and Panama
  ["PANAMA", "W_WINDWARD"], ["PANAMA", "W_YUCATAN"], ["W_WINDWARD", "NYNJ"], ["W_WINDWARD", "SAVANNAH"],
  ["W_YUCATAN", "HOUSTON"], ["W_YUCATAN", "VERACRUZ"], ["W_YUCATAN", "W_FLORIDA"], ["W_FLORIDA", "SAVANNAH"], ["HOUSTON", "VERACRUZ"],
  // Pacific
  ["W_NPAC_JAPAN", "LALB"], ["W_NPAC_JAPAN", "SEATTLE"], ["W_NPAC_JAPAN", "VANCOUVER"], ["W_NPAC_JAPAN", "MANZANILLO"], ["W_NPAC_JAPAN", "PANAMA"],
  ["LALB", "SEATTLE"], ["SEATTLE", "VANCOUVER"], ["LALB", "W_PACIFIC_CA"], ["MANZANILLO", "W_PACIFIC_CA"], ["LALB", "MANZANILLO"], ["W_PACIFIC_CA", "PANAMA"],
];

const SEA_DETOUR = 1.08; // ships do not sail perfect great circles
const SEA_KM_PER_DAY = 15 * 1.852 * 24; // 15 knots, slow steaming
const CANAL_DAYS: Record<string, number> = { SUEZ: 1, PANAMA: 1, KIEL_CANAL: 0.5 };
const CANAL_FEE: Record<string, number> = { SUEZ: 3, PANAMA: 3, KIEL_CANAL: 0.5 }; // in sea-day equivalents

const seaAdj: Record<string, { to: string; km: number }[]> = {};
for (const [a, b] of SEA_EDGES) {
  const km = haversineKm(POINT_BY_ID[a], POINT_BY_ID[b]) * SEA_DETOUR;
  (seaAdj[a] ??= []).push({ to: b, km });
  (seaAdj[b] ??= []).push({ to: a, km });
}

function seaPath(from: string, to: string, avoid: Set<string>): { nodes: string[]; km: number } | null {
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set([from]);
  const done = new Set<string>();
  while (open.size) {
    let u = "";
    let best = Infinity;
    for (const n of open) if (dist[n] < best) { best = dist[n]; u = n; }
    open.delete(u);
    if (u === to) break;
    done.add(u);
    for (const { to: v, km } of seaAdj[u] ?? []) {
      if (done.has(v) || (avoid.has(v) && v !== to)) continue;
      // ports other than the two ends are not sailed through
      if (POINT_BY_ID[v].kind === "port" && v !== to) continue;
      const nd = best + km;
      if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; open.add(v); }
    }
  }
  if (dist[to] === undefined) return null;
  const nodes = [to];
  while (nodes[0] !== from) nodes.unshift(prev[nodes[0]]);
  return { nodes, km: dist[to] };
}

const AVOID_SETS: Record<string, string[]> = {
  suez: ["SUEZ", "RED_SEA", "BAB_EL_MANDEB"],
  panama: ["PANAMA"],
  cape: ["CAPE_GOOD_HOPE"],
};
const ASIA_PORTS = new Set(["SHANGHAI", "YANTIAN", "BUSAN", "YOKOHAMA", "KAOHSIUNG", "HCMC", "LAEMCHABANG", "SINGAPORE"]);
const US_EAST_GULF = new Set(["NYNJ", "SAVANNAH", "HOUSTON"]);

function seaLabel(nodes: string[], extra = ""): string {
  const has = (id: string) => nodes.includes(id);
  const parts: string[] = [];
  if (has("SUEZ")) parts.push("Suez Canal");
  if (has("CAPE_GOOD_HOPE")) parts.push("Cape of Good Hope");
  if (has("PANAMA")) parts.push("Panama Canal");
  if (extra) parts.push(extra);
  if (!parts.length) return has("W_NPAC_JAPAN") ? "Direct across the Pacific" : has("W_NATL") || has("W_AZORES") ? "Direct across the Atlantic" : "Direct";
  return `Via ${parts.join(" and ")}`;
}

function seaDraft(nodes: string[], km: number, label: string, extraDays = 0, extraCost = 0, tail: { lat: number; lon: number }[] = [], tailPoints: string[] = []): Draft {
  const canals = nodes.filter((n) => CANAL_DAYS[n]);
  const seaDays = km / SEA_KM_PER_DAY;
  const days = seaDays + 3 + canals.reduce((s, c) => s + CANAL_DAYS[c], 0) + extraDays;
  const cost = seaDays + 2 + canals.reduce((s, c) => s + CANAL_FEE[c], 0) + extraCost;
  const stops = [...nodes.map((n) => coord(POINT_BY_ID[n])), ...tail];
  return {
    mode: "sea",
    label,
    points: [...nodes.filter((n) => POINT_BY_ID[n].kind !== "waypoint"), ...tailPoints],
    path: drawThrough(stops),
    km: km + tail.reduce((s, t, i) => s + haversineKm(i ? tail[i - 1] : POINT_BY_ID[nodes[nodes.length - 1]], t), 0),
    days,
    cost,
  };
}

function seaRoutes(o: Place, d: Place): Route[] {
  const from = o.node!, to = d.node!;
  const drafts: { draft: Draft; sig: string }[] = [];
  const combos: string[][] = [[], ["suez"], ["panama"], ["suez", "panama"], ["cape"], ["cape", "panama"]];
  for (const combo of combos) {
    const avoid = new Set(combo.flatMap((c) => AVOID_SETS[c]));
    const p = seaPath(from, to, avoid);
    if (!p) continue;
    const sig = ["SUEZ", "PANAMA", "CAPE_GOOD_HOPE"].filter((n) => p.nodes.includes(n)).join("+");
    drafts.push({ draft: seaDraft(p.nodes, p.km, seaLabel(p.nodes)), sig });
  }
  // Asia to the US East or Gulf coast (and back): West Coast port, then rail
  const intermodal = (port: string, rail: string, label: string) => {
    const asiaEnd = ASIA_PORTS.has(from) ? from : to;
    const inland = ASIA_PORTS.has(from) ? d : o;
    const p = seaPath(asiaEnd, port, new Set());
    if (!p) return;
    const railKm = haversineKm(POINT_BY_ID[port], inland) * 1.2;
    const draft = seaDraft(p.nodes, p.km, label, 2 + railKm / 900, railKm / 450, [coord(POINT_BY_ID[rail]), coord(inland)], [rail, inland.node!]);
    if (!ASIA_PORTS.has(from)) {
      draft.points = [...draft.points].reverse();
      draft.path = [...draft.path].reverse();
    }
    drafts.push({ draft, sig: `rail:${port}` });
  };
  if ((ASIA_PORTS.has(from) && US_EAST_GULF.has(to)) || (ASIA_PORTS.has(to) && US_EAST_GULF.has(from))) intermodal("LALB", "US_RAIL", "Via US West Coast and rail");
  if ((ASIA_PORTS.has(from) && to === "MONTREAL") || (ASIA_PORTS.has(to) && from === "MONTREAL")) intermodal("VANCOUVER", "CA_RAIL", "Via Vancouver and rail");

  // one route per way round (canal, cape, rail), shortest first, within twice the shortest
  drafts.sort((a, b) => a.draft.km - b.draft.km);
  const water = drafts.filter((x) => !x.sig.startsWith("rail:"));
  const minKm = (water.length ? water : drafts)[0]?.draft.km ?? 0;
  const bySig = new Map<string, Draft>();
  for (const { draft, sig } of drafts) if (!bySig.has(sig) && draft.km <= minKm * 2.1) bySig.set(sig, draft);
  const kept = [...bySig.values()];
  // the Taiwan Strait has a way round east of Taiwan: offer it for the shortest route
  const first = kept[0];
  if (first && first.points.includes("TAIWAN_STRAIT") && kept.length < 4) {
    const avoid = new Set(["TAIWAN_STRAIT", ...(["SUEZ", "PANAMA", "CAPE_GOOD_HOPE"].filter((n) => !first.points.includes(n)))]);
    const p = seaPath(from, to, avoid);
    if (p && !p.nodes.includes("TAIWAN_STRAIT")) kept.push(seaDraft(p.nodes, p.km, seaLabel(p.nodes, "east of Taiwan")));
  }
  return finish("sea", kept);
}

// road -------------------------------------------------------------------------------------

const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const pairs = (list: string[]) => list.flatMap((p) => {
  const [a, b] = p.split("-");
  const as = a === "EU" ? EU : [a];
  const bs = b === "EU" ? EU : [b];
  return as.flatMap((x) => bs.map((y) => `${x}-${y}`));
});

// which country pairs each crossing serves (either direction); dwell = typical days lost at it
export const ROAD_CROSSINGS: { id: string; serves: string[]; dwell: number }[] = [
  { id: "LAREDO", serves: ["US-MX"], dwell: 0.5 },
  { id: "PHARR", serves: ["US-MX"], dwell: 0.5 },
  { id: "EAGLE_PASS", serves: ["US-MX"], dwell: 0.5 },
  { id: "EL_PASO", serves: ["US-MX"], dwell: 0.5 },
  { id: "NOGALES", serves: ["US-MX"], dwell: 0.5 },
  { id: "OTAY_MESA", serves: ["US-MX"], dwell: 0.5 },
  { id: "AMBASSADOR", serves: ["US-CA"], dwell: 0.25 },
  { id: "BLUE_WATER", serves: ["US-CA"], dwell: 0.25 },
  { id: "PEACE_BRIDGE", serves: ["US-CA"], dwell: 0.25 },
  { id: "CHAMPLAIN", serves: ["US-CA"], dwell: 0.25 },
  { id: "BLAINE", serves: ["US-CA"], dwell: 0.25 },
  { id: "KAPIKULE", serves: pairs(["TR-EU"]), dwell: 1 },
  { id: "RORO_TRIESTE", serves: pairs(["TR-EU"]), dwell: 3 },
  { id: "DOVER_CALAIS", serves: pairs(["GB-EU"]), dwell: 0.5 },
  { id: "CHANNEL_TUNNEL", serves: pairs(["GB-EU"]), dwell: 0.4 },
  { id: "HOOK_HARWICH", serves: pairs(["GB-NL", "GB-DE", "GB-PL", "GB-DK", "GB-SE"]), dwell: 0.75 },
  { id: "BRENNER", serves: pairs(["DE-IT", "AT-IT", "CZ-IT", "PL-IT", "NL-IT", "DK-IT", "SE-IT"]), dwell: 0.25 },
  { id: "GOTTHARD", serves: pairs(["DE-IT", "NL-IT", "BE-IT", "CH-IT"]), dwell: 0.4 },
  { id: "MONT_BLANC", serves: pairs(["FR-IT", "BE-IT", "NL-IT", "DE-IT"]), dwell: 0.25 },
  { id: "FREJUS", serves: pairs(["FR-IT", "ES-IT"]), dwell: 0.25 },
  { id: "LA_JONQUERA", serves: pairs(["ES-FR", "ES-DE", "ES-BE", "ES-NL", "ES-IT", "PT-FR", "PT-DE", "ES-PL"]), dwell: 0.1 },
  { id: "IRUN", serves: pairs(["ES-FR", "ES-DE", "ES-BE", "ES-NL", "PT-FR", "PT-DE", "PT-BE", "PT-NL", "ES-PL"]), dwell: 0.1 },
];
const ROAD_FACTOR = 1.25; // roads are longer than the great circle
const ROAD_KM_PER_DAY = 650;

function crossingRoutes(mode: "road" | "rail", o: Place, d: Place, list: { id: string; serves: string[]; dwell: number }[], extra: (o: Place, d: Place) => { before: string[]; after: string[] }, kmPerDay: number, fixedDays: number, costPerKm: number): Route[] {
  const key = `${o.country}-${d.country}`;
  const rev = `${d.country}-${o.country}`;
  const drafts: Draft[] = [];
  for (const c of list) {
    if (!c.serves.includes(key) && !c.serves.includes(rev)) continue;
    const cp = POINT_BY_ID[c.id];
    const km = (haversineKm(o, cp) + haversineKm(cp, d)) * ROAD_FACTOR;
    const { before, after } = extra(o, d);
    drafts.push({
      mode,
      label: `Via ${cp.name.replace(/ crossings?$| crossing$/, "")}`,
      points: [...before, c.id, ...after],
      path: drawThrough([coord(o), coord(cp), coord(d)]),
      km,
      days: km / kmPerDay + fixedDays + c.dwell,
      cost: km * costPerKm + c.dwell * 300,
    });
  }
  drafts.sort((a, b) => a.cost - b.cost);
  return finish(mode, drafts, 3);
}

function roadRoutes(o: Place, d: Place): Route[] {
  return crossingRoutes("road", o, d, ROAD_CROSSINGS, () => ({ before: [], after: [] }), ROAD_KM_PER_DAY, 0.5, 1);
}

// rail -------------------------------------------------------------------------------------

const RAIL_NET: Record<string, string> = { US: "US_RAIL", CA: "CA_RAIL", MX: "MX_RAIL" };
export const RAIL_CROSSINGS: { id: string; serves: string[]; dwell: number }[] = [
  { id: "LAREDO_RAIL", serves: ["US-MX"], dwell: 0.5 },
  { id: "EAGLE_PASS_RAIL", serves: ["US-MX"], dwell: 0.5 },
  { id: "EL_PASO_RAIL", serves: ["US-MX"], dwell: 0.5 },
  { id: "DETROIT_RAIL", serves: ["US-CA"], dwell: 0.3 },
  { id: "SARNIA_RAIL", serves: ["US-CA"], dwell: 0.3 },
  { id: "NIAGARA_RAIL", serves: ["US-CA"], dwell: 0.3 },
];
const CN_EU_NORTH = ["ALASHANKOU", "KZ_RAIL", "RU_RAIL", "BY_RAIL", "MALASZEWICZE"];
const CN_EU_MIDDLE = ["KHORGOS", "KZ_RAIL", "CASPIAN_FERRY", "GE_RAIL", "TR_RAIL", "KAPIKULE"];

function corridor(o: Place, d: Place, chain: string[], label: string, kmPerDay: number, fixedDays: number, costPerKm: number): Draft {
  const stops = [coord(o), ...chain.map((c) => coord(POINT_BY_ID[c])), coord(d)];
  let km = 0;
  for (let i = 0; i < stops.length - 1; i++) km += haversineKm(stops[i], stops[i + 1]);
  km *= 1.15;
  return { mode: "rail", label, points: chain, path: drawThrough(stops), km, days: km / kmPerDay + fixedDays, cost: km * costPerKm + fixedDays * 150 };
}

function railRoutes(o: Place, d: Place): Route[] {
  const asia = (c: string) => c === "CN";
  const europe = (c: string) => EU.includes(c) || c === "TR";
  if ((asia(o.country) && europe(d.country)) || (europe(o.country) && asia(d.country))) {
    const eastward = asia(d.country);
    const [cn, eu] = eastward ? [d, o] : [o, d];
    const turkey = eu.country === "TR";
    const middle = turkey ? CN_EU_MIDDLE.slice(0, -1) : CN_EU_MIDDLE;
    const drafts = [
      ...(turkey ? [] : [corridor(cn, eu, CN_EU_NORTH, "Northern corridor via Russia and Belarus", 650, 3, 1)]),
      corridor(cn, eu, middle, "Middle Corridor via the Caspian Sea", 500, 6, 1.15),
    ];
    if (eastward) for (const dr of drafts) { dr.points = [...dr.points].reverse(); dr.path = [...dr.path].reverse(); }
    return finish("rail", drafts);
  }
  const na = ["US", "CA", "MX"];
  if (!na.includes(o.country) || !na.includes(d.country)) return [];
  if (o.country === d.country) {
    const net = RAIL_NET[o.country];
    const km = haversineKm(o, d) * 1.2;
    return finish("rail", [{ mode: "rail", label: "Direct by rail", points: [net], path: drawThrough([coord(o), coord(d)]), km, days: km / 700 + 1.5, cost: km }]);
  }
  return crossingRoutes("rail", o, d, RAIL_CROSSINGS, (a, b) => ({ before: [RAIL_NET[a.country]], after: [RAIL_NET[b.country]] }), 700, 1.5, 0.8);
}

// air --------------------------------------------------------------------------------------

const AIR_HUBS = ["ANC", "DXB", "DOH", "IST", "FRA", "LEJ", "ICN", "HKG"];

function airDraft(stops: string[], label: string): Draft {
  const pts = stops.map((s) => POINT_BY_ID[s]);
  const path = drawThrough(pts.map(coord));
  let km = 0;
  for (let i = 0; i < pts.length - 1; i++) km += haversineKm(pts[i], pts[i + 1]);
  // airspace crossed, in the order the path meets it, between the airports
  const points: string[] = [stops[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    points.push(...airspaceCrossed(greatCircle(pts[i], pts[i + 1], 60)).filter((a) => !points.includes(a)));
    points.push(stops[i + 1]);
  }
  const hubs = stops.length - 2;
  // standing closures: EU, UK, US and Canadian airlines fly around Russia, and nobody flies over
  // Ukraine, so a path drawn across them costs the detour real flights make
  const detour = (points.includes("RU_AIRSPACE") ? 0.12 : 0) + (points.includes("UA_AIRSPACE") ? 0.04 : 0);
  return { mode: "air", label, points, path, km, days: 2 + (km * (1 + detour)) / 800 / 24 + hubs * 0.5 + (detour ? 0.15 : 0), cost: km * (1 + detour) * (1 - 0.05 * hubs) + 500 };
}

function airRoutes(o: Place, d: Place): Route[] {
  const a = o.node!, b = d.node!;
  const direct = haversineKm(POINT_BY_ID[a], POINT_BY_ID[b]);
  const drafts: Draft[] = [airDraft([a, b], "Direct flight")];
  // a hub next door to either end is no stop at all (Leipzig on a Frankfurt flight)
  const hubs = AIR_HUBS.filter((h) => haversineKm(POINT_BY_ID[h], POINT_BY_ID[a]) > 700 && haversineKm(POINT_BY_ID[h], POINT_BY_ID[b]) > 700)
    .map((h) => ({ h, ratio: (haversineKm(POINT_BY_ID[a], POINT_BY_ID[h]) + haversineKm(POINT_BY_ID[h], POINT_BY_ID[b])) / direct }))
    .filter((x) => x.ratio <= 1.25)
    .sort((x, y) => x.ratio - y.ratio)
    .slice(0, 2);
  for (const { h } of hubs) drafts.push(airDraft([a, h, b], `Via ${POINT_BY_ID[h].name.replace(/ airport$/, "")}`));
  const routes = finish("air", drafts);
  for (const r of routes) {
    if (r.points.includes("RU_AIRSPACE")) r.notes.unshift("This path crosses Russian airspace: only some carriers can fly it as drawn. Cost and time include the detour other airlines fly.");
  }
  return routes;
}

// --- the lane -------------------------------------------------------------------------------

export function laneFor(originId: string, destinationId: string): Lane | null {
  const origin = PLACE_BY_ID[originId];
  const destination = PLACE_BY_ID[destinationId];
  if (!origin || !destination || origin.mode !== destination.mode || origin.id === destination.id) return null;
  const mode = origin.mode;
  const routes = mode === "sea" ? seaRoutes(origin, destination) : mode === "road" ? roadRoutes(origin, destination) : mode === "rail" ? railRoutes(origin, destination) : airRoutes(origin, destination);
  return { origin, destination, mode, routes };
}
