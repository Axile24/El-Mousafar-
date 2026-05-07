/** Same local-owner key as the frontend (conducteurs sans e-mail). */
export function conductorKey(name, aftername) {
  const n = String(name || "conducteur").trim().toLowerCase() || "conducteur";
  const a = String(aftername || "bus").trim().toLowerCase() || "bus";
  return `${n}.${a}@local`;
}
