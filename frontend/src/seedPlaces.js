/**
 * Alla fasta platser (samma som backend PLACES).
 * Används för seed-lista vid fokus och för att hitta gid utan API.
 */
export const LOCAL_LOCATION_RESULTS = [
  { name: "Tizi Ouzou (centre-ville)", gid: "dz-tizi-centre", lat: 36.7118, lon: 4.0457 },
  { name: "Gare routière Tizi Ouzou", gid: "dz-tizi-gare", lat: 36.7164, lon: 4.0489 },
  { name: "Alger", gid: "dz-alger", lat: 36.7538, lon: 3.0588 },
  { name: "Béjaïa", gid: "dz-bejaia", lat: 36.7511, lon: 5.0836 },
  { name: "Constantine", gid: "dz-constantine", lat: 36.365, lon: 6.6147 },
  { name: "Sétif", gid: "dz-setif", lat: 36.1911, lon: 5.4137 },
  { name: "Boumerdès", gid: "dz-boumerdes", lat: 36.7664, lon: 3.4778 },
  { name: "Blida", gid: "dz-blida", lat: 36.47, lon: 2.827 },
  { name: "Oran", gid: "dz-oran", lat: 35.697, lon: -0.633 },
  { name: "Jijel", gid: "dz-jijel", lat: 36.8206, lon: 5.7667 },
  { name: "Azazga", gid: "dz-azazga", lat: 36.7445, lon: 4.3694 },
  { name: "Draâ El Mizan", gid: "dz-draa-mizan", lat: 36.5361, lon: 3.8333 },
  {
    name: "Larbaâ Nath Irathen",
    gid: "dz-larbaa-nath-irathen",
    lat: 36.6347,
    lon: 4.2067,
  },
  { name: "Mekla", gid: "dz-mekla", lat: 36.6811, lon: 4.2636 },
  { name: "Aïn El Hammam", gid: "dz-ain-el-hammam", lat: 36.5689, lon: 4.3069 },
  { name: "Tizi Rached", gid: "dz-tizi-rached", lat: 36.6717, lon: 4.1919 },
  { name: "Freha", gid: "dz-freha", lat: 36.7528, lon: 4.3208 },
  { name: "Akbou", gid: "dz-akbou", lat: 36.5286, lon: 4.5344 },
  { name: "Timizart", gid: "dz-timizart", lat: 36.8, lon: 4.233 },
  { name: "Boghni", gid: "dz-boghni", lat: 36.543, lon: 3.953 },
];

/** Första raderna i rullisten vid fokus (kompakt). */
export const SEED_LOCATION_RESULTS = LOCAL_LOCATION_RESULTS.slice(0, 14);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2019/g, "'")
    .trim();
}

const gidOf = (r) => String(r.gid ?? r.id ?? "");

/**
 * Hitta gid för fritext mot känd lista (normaliserad query, samma logik som API-resolve).
 */
export function matchKnownPlaceGid(normalizedQuery, list = LOCAL_LOCATION_RESULTS) {
  const nt = normalizedQuery;
  if (!nt) return "";

  const exact = list.find((r) => norm(r.name) === nt);
  if (exact && gidOf(exact)) return gidOf(exact);

  const inDisplay = list.find((r) =>
    norm(r.display_name || r.name || "").includes(nt)
  );
  if (inDisplay && gidOf(inDisplay)) return gidOf(inDisplay);

  const prefix = list.find((r) => norm(r.name).startsWith(nt));
  if (prefix && gidOf(prefix)) return gidOf(prefix);

  const nameIncludes = list.find((r) => norm(r.name).includes(nt));
  if (nameIncludes && nt.length >= 2 && gidOf(nameIncludes)) return gidOf(nameIncludes);

  if (list.length === 1 && gidOf(list[0])) return gidOf(list[0]);
  return "";
}
