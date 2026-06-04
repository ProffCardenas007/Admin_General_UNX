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
  paa_mate: 'paa',
  paa_espanol: 'paa',
  exani_ii: 'exani_ii',
  exani_mate: 'exani_ii',
  exani_espanol: 'exani_ii',
  exani_ii_mate: 'exani_ii',
  exani_ii_espanol: 'exani_ii',
  piense: 'piense',
  unam: 'unam',
  unam_mate: 'unam',
  unam_espanol: 'unam',
  modulos: 'modulos',
  modulos_especificos: 'modulos',
};

const legacySpecialtyByCurrent: Partial<Record<LeadSpecialty, string>> = {
  paa: 'paa_mate',
  exani_ii: 'exani_ii_mate',
  unam: 'unam_mate',
  modulos: 'modulos_especificos',
};

export function toLegacyLeadSpecialty(specialty: LeadSpecialty): string | undefined {
  return legacySpecialtyByCurrent[specialty];
}

export function normalizeLeadSpecialtyInput(value?: string | null): LeadSpecialty | "" {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  return leadSpecialtyAliases[normalized] ?? "";
}
