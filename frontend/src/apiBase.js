/**
 * URL de l’API. Priorité : VITE_API_BASE → Vite (5173/4173) en relatif `/api…` (proxy) → sinon 127.0.0.1:4000 en local.
 * Le proxy Vite doit viser l’API : en Docker dev, VITE_PROXY_API=http://api:4000 sur le service web.
 */
export function apiUrl(path) {
  const explicit = import.meta.env.VITE_API_BASE;
  if (explicit != null && String(explicit).trim() !== "") {
    return `${String(explicit).replace(/\/$/, "")}${path}`;
  }

  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;
    const p = String(port || "");
    /** Dev / preview Vite : même origine pour que le proxy atteigne l’API (y compris depuis une IP LAN, ex. téléphone). */
    if (p === "5173" || p === "4173") {
      return path;
    }
    const loopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
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
