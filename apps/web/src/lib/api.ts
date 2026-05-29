export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const ALLOWED_SPECIALTIES = new Set([
  "paa_mate",
  "paa_espanol",
  "exani_ii_mate",
  "exani_ii_espanol",
  "modulos_especificos",
  "unam_mate",
  "unam_espanol",
]);

export function getStoredToken() {
  return window.localStorage.getItem("sistema_mvp_token") ?? "";
}

export function getStoredEmail() {
  return window.localStorage.getItem("sistema_mvp_email") ?? "";
}

export function getStoredRole() {
  const directRole = window.localStorage.getItem("sistema_mvp_role") ?? "";
  if (directRole) {
    return directRole;
  }

  const token = getStoredToken();
  if (!token) {
    return "";
  }

  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return "";
    }

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(padded)) as { role?: string };
    return parsed.role ?? "";
  } catch {
    return "";
  }
}

export function getStoredSpecialty() {
  const directSpecialty = window.localStorage.getItem("sistema_mvp_specialty") ?? "";
  if (directSpecialty && ALLOWED_SPECIALTIES.has(directSpecialty)) {
    return directSpecialty;
  }

  const token = getStoredToken();
  if (!token) {
    return "";
  }

  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return "";
    }

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(padded)) as { specialty?: string };
    const tokenSpecialty = parsed.specialty ?? "";
    return ALLOWED_SPECIALTIES.has(tokenSpecialty) ? tokenSpecialty : "";
  } catch {
    return "";
  }
}

export function getStoredUserId() {
  const token = getStoredToken();
  if (!token) {
    return "";
  }

  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return "";
    }

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(padded)) as {
      sub?: string;
      id?: string;
      userId?: string;
    };

    return parsed.sub ?? parsed.id ?? parsed.userId ?? "";
  } catch {
    return "";
  }
}

export function authHeaders() {
  const token = getStoredToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}