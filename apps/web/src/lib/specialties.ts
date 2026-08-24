export const LEAD_SPECIALTIES = [
  'paa',
  'exani_ii',
  'piense',
  'unam',
  'modulos',
] as const;

export type LeadSpecialty = string;

const defaultSpecialtyLabels: Record<string, string> = {
  paa: 'PAA',
  exani_ii: 'EXANI-II',
  piense: 'PIENSE',
  unam: 'UNAM',
  modulos: 'Módulos',
};

export const specialtyLabels: Record<string, string> = new Proxy(defaultSpecialtyLabels, {
  get(target, property: string) {
    return target[property] ?? property.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  },
});

const specialtyCodePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function normalizeLeadSpecialtyInput(value?: string | null): LeadSpecialty | "" {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  return specialtyCodePattern.test(normalized) ? normalized : "";
}

export function normalizeLeadSpecialtiesInput(values?: Array<string | null | undefined> | string | null): LeadSpecialty[] {
  if (typeof values === "undefined" || values === null) {
    return [];
  }

  const rawValues = Array.isArray(values) ? values : [values];
  const normalized: LeadSpecialty[] = [];

  rawValues.forEach((value) => {
    const specialty = normalizeLeadSpecialtyInput(value);
    if (specialty && !normalized.includes(specialty)) {
      normalized.push(specialty);
    }
  });

  return normalized;
}
