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

export const specialtyLabels: Record<LeadSpecialty, string> = {
  paa_mate: 'PAA Mate',
  paa_espanol: 'PAA Español',
  exani_ii_mate: 'Exani II Mate',
  exani_ii_espanol: 'Exani II Español',
  modulos_especificos: 'Módulos Específicos',
  unam_mate: 'UNAM Mate',
  unam_espanol: 'UNAM Español',
};
