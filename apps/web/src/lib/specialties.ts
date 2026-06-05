export const LEAD_SPECIALTIES = [
  'paa',
  'exani_ii',
  'piense',
  'unam',
  'modulos',
] as const;

export type LeadSpecialty = (typeof LEAD_SPECIALTIES)[number];

export const specialtyLabels: Record<LeadSpecialty, string> = {
  paa: 'PAA',
  exani_ii: 'EXANI-II',
  piense: 'PIENSE',
  unam: 'UNAM',
  modulos: 'Módulos',
};

const leadSpecialtyAliases: Record<string, LeadSpecialty> = {
  paa: 'paa',
  exani_ii: 'exani_ii',
  piense: 'piense',
  unam: 'unam',
  modulos: 'modulos',
};

export function normalizeLeadSpecialtyInput(value?: string | null): LeadSpecialty | "" {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  return leadSpecialtyAliases[normalized] ?? "";
}
