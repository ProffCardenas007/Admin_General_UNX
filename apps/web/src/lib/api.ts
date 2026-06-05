export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const SPECIALTY_ALIAS: Record<string, string> = {
  paa: "paa",
  exani_ii: "exani_ii",
  piense: "piense",
  unam: "unam",
  modulos: "modulos",
};

function normalizeStoredSpecialty(value: string) {
  const normalized = value.trim().toLowerCase();
  return SPECIALTY_ALIAS[normalized] ?? "";
}

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
  const normalizedDirectSpecialty = normalizeStoredSpecialty(directSpecialty);
  if (normalizedDirectSpecialty) {
    return normalizedDirectSpecialty;
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
    return normalizeStoredSpecialty(parsed.specialty ?? "");
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