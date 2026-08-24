export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const SPECIALTY_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function normalizeStoredSpecialty(value: string) {
  const normalized = value.trim().toLowerCase();
  return SPECIALTY_CODE_PATTERN.test(normalized) ? normalized : "";
}

function normalizeStoredSpecialties(values: Array<string | null | undefined>) {
  const normalized: string[] = [];

  values.forEach((value) => {
    if (!value) {
      return;
    }

    const specialty = normalizeStoredSpecialty(value);
    if (specialty && !normalized.includes(specialty)) {
      normalized.push(specialty);
    }
  });

  return normalized;
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
  return getStoredSpecialties()[0] ?? "";
}

export function getStoredSpecialties() {
  const rawSpecialties = window.localStorage.getItem("sistema_mvp_specialties");
  if (rawSpecialties) {
    try {
      const parsed = JSON.parse(rawSpecialties) as Array<string | null | undefined>;
      if (Array.isArray(parsed)) {
        const normalizedParsed = normalizeStoredSpecialties(parsed);
        if (normalizedParsed.length > 0) {
          return normalizedParsed;
        }
      }
    } catch {
      // Ignore malformed storage and fallback to legacy fields.
    }
  }

  const directSpecialty = window.localStorage.getItem("sistema_mvp_specialty") ?? "";
  const normalizedDirectSpecialty = normalizeStoredSpecialty(directSpecialty);
  if (normalizedDirectSpecialty) {
    return [normalizedDirectSpecialty];
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
    const parsed = JSON.parse(window.atob(padded)) as {
      specialty?: string;
      specialties?: string[];
    };
    const normalizedTokenSpecialties = normalizeStoredSpecialties([
      ...(Array.isArray(parsed.specialties) ? parsed.specialties : []),
      parsed.specialty,
    ]);
    return normalizedTokenSpecialties;
  } catch {
    return [];
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