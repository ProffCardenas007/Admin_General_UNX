export const LEAD_SPECIALTIES = [
  'paa_mate',
  'paa_espanol',
  'exani_ii_mate',
  'exani_ii_espanol',
  'modulos_especificos',
  'unam_mate',
  'unam_espanol',
] as const;

export type LeadSpecialty = (typeof LEAD_SPECIALTIES)[number];

export const PROJECT_SCOPES = LEAD_SPECIALTIES;
export type ProjectScope = LeadSpecialty;

export function isLeadSpecialty(value?: string | null): value is LeadSpecialty {
  return !!value && (LEAD_SPECIALTIES as readonly string[]).includes(value);
}
