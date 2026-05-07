export const AUTH_TOKEN_KEY = "el-mousafar-auth-token";

export function readAuthToken() {
  try {
    return String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeAuthToken(token) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, String(token || "").trim());
  } catch {
    /* ignore */
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
