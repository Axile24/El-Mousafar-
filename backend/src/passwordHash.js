import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 64);
  return Buffer.concat([salt, hash]).toString("base64");
}

export function verifyPassword(plain, storedB64) {
  try {
    const encoded =
      typeof storedB64 === "string"
        ? storedB64
        : Buffer.isBuffer(storedB64)
          ? storedB64.toString("utf8")
          : String(storedB64 ?? "");
    const buf = Buffer.from(encoded, "base64");
    if (buf.length < 17) return false;
    const salt = buf.subarray(0, 16);
    const expected = buf.subarray(16);
    const actual = scryptSync(String(plain), salt, 64);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
