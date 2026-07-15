export const LEAD_SPECIALTIES = [
  'paa',
  'exani_ii',
  'piense',
  'unam',
  'modulos',
] as const;

export const LEAD_SPECIALTY_INPUTS = LEAD_SPECIALTIES;

export type LeadSpecialty = (typeof LEAD_SPECIALTIES)[number];
export type LeadSpecialtyInput = (typeof LEAD_SPECIALTY_INPUTS)[number];

export const PROJECT_SCOPES = LEAD_SPECIALTIES;
export type ProjectScope = LeadSpecialty;

export function normalizeLeadSpecialty(
  value?: string | null,
): LeadSpecialty | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if ((LEAD_SPECIALTIES as readonly string[]).includes(normalized)) {
    return normalized as LeadSpecialty;
  }

  return undefined;
}

export function isLeadSpecialty(value?: string | null): value is LeadSpecialty {
  return !!normalizeLeadSpecialty(value);
}

export function normalizeLeadSpecialties(
  values?: Array<string | null | undefined> | string | null,
): LeadSpecialty[] {
  if (typeof values === 'undefined' || values === null) {
    return [];
  }

  const rawValues = Array.isArray(values) ? values : [values];
  const normalized: LeadSpecialty[] = [];

  for (const item of rawValues) {
    const specialty = normalizeLeadSpecialty(item);
    if (specialty && !normalized.includes(specialty)) {
      normalized.push(specialty);
    }
  }

  return normalized;
}
