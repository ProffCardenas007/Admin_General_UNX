export const LEAD_SPECIALTIES = [
  'paa',
  'exani_ii',
  'piense',
  'unam',
  'modulos',
] as const;

export const LEGACY_LEAD_SPECIALTY_ALIASES = {
  paa_mate: 'paa',
  paa_espanol: 'paa',
  exani_mate: 'exani_ii',
  exani_espanol: 'exani_ii',
  exani_ii_mate: 'exani_ii',
  exani_ii_espanol: 'exani_ii',
  unam_mate: 'unam',
  unam_espanol: 'unam',
  modulos_especificos: 'modulos',
} as const;

export const LEAD_SPECIALTY_INPUTS = [
  ...LEAD_SPECIALTIES,
  ...Object.keys(LEGACY_LEAD_SPECIALTY_ALIASES),
] as const;

export type LeadSpecialty = (typeof LEAD_SPECIALTIES)[number];
export type LeadSpecialtyInput = (typeof LEAD_SPECIALTY_INPUTS)[number];

export const PROJECT_SCOPES = LEAD_SPECIALTIES;
export type ProjectScope = LeadSpecialty;

export function normalizeLeadSpecialty(value?: string | null): LeadSpecialty | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if ((LEAD_SPECIALTIES as readonly string[]).includes(normalized)) {
    return normalized as LeadSpecialty;
  }

  return (LEGACY_LEAD_SPECIALTY_ALIASES as Record<string, LeadSpecialty>)[normalized];
}

export function isLeadSpecialty(value?: string | null): value is LeadSpecialty {
  return !!normalizeLeadSpecialty(value);
}
