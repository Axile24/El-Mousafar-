/** Local synthetic “email” for conductor / admin sans compte e-mail réel. */
export function conductorKey(name, aftername) {
  const n = String(name || "conducteur").trim().toLowerCase() || "conducteur";
  const a = String(aftername || "bus").trim().toLowerCase() || "bus";
  return `${n}.${a}@local`;
}
