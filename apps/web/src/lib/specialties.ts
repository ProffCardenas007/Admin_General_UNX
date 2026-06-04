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

const legacySpecialtyByCurrent: Partial<Record<LeadSpecialty, string>> = {
  paa: 'paa_mate',
  exani_ii: 'exani_ii_mate',
  unam: 'unam_mate',
  modulos: 'modulos_especificos',
};

export function toLegacyLeadSpecialty(specialty: LeadSpecialty): string | undefined {
  return legacySpecialtyByCurrent[specialty];
}
