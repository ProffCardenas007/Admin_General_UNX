export const LEAD_SPECIALTIES = [
  'paa',
  'exani_ii',
  'piense',
  'unam',
  'modulos',
] as const;

export type LeadSpecialty = (typeof LEAD_SPECIALTIES)[number];

export const PROJECT_SCOPES = LEAD_SPECIALTIES;
export type ProjectScope = LeadSpecialty;

export function isLeadSpecialty(value?: string | null): value is LeadSpecialty {
  return !!value && (LEAD_SPECIALTIES as readonly string[]).includes(value);
}
