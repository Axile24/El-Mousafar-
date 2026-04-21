export const AUTH_TOKEN_KEY = "el-mousafar-auth-token";

export function readAuthToken() {
  try {
    return String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}
