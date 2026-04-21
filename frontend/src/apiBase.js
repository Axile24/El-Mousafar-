/**
 * Bygg API-URL. Relativ `/api` mot Vite utan proxy ger index.html → JSON-parsefel.
 * På localhost (förutom port 4000 / vanlig prod-webb) pekar vi direkt mot Node-API.
 */
export function apiUrl(path) {
  const explicit = import.meta.env.VITE_API_BASE;
  if (explicit != null && String(explicit).trim() !== "") {
    return `${String(explicit).replace(/\/$/, "")}${path}`;
  }

  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;
    const loopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
    const p = port || "";
    /** 8080 = ofta Docker-webb med egen /api-proxy — relativ URL. Övriga lokala portar → API 4000 */
    if (loopback && p && !["4000", "80", "443", "8080"].includes(p)) {
      return `http://127.0.0.1:4000${path}`;
    }
  }

  return path;
}

export async function fetchApiJson(url) {
  const res = await fetch(url);
  const raw = await res.text();
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error(
      "Le serveur a renvoyé du HTML au lieu de JSON (souvent index.html). Démarrez l’API sur le port 4000, ou définissez VITE_API_BASE vers l’URL de l’API."
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Réponse JSON invalide du serveur.");
  }
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}
