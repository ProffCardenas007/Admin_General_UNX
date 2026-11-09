export type LabeledHours = {
  label: string;
  hours: number;
};

const cleanLabel = (label: string) => label.trim().replace(/\s+/g, " ").normalize("NFC");

export const normalizeDistributionLabel = (label: string) =>
  cleanLabel(label).toLocaleLowerCase("es-MX");

const isAllUppercase = (label: string) =>
  label === label.toLocaleUpperCase("es-MX") &&
  label !== label.toLocaleLowerCase("es-MX");

export const groupHoursByLabel = (rows: LabeledHours[]) => {
  const grouped = new Map<string, LabeledHours>();

  rows.forEach((row) => {
    const label = cleanLabel(row.label);
    const key = normalizeDistributionLabel(label);
    const hours = Number.isFinite(row.hours) ? row.hours : 0;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, { label, hours });
      return;
    }

    current.hours += hours;
    if (isAllUppercase(current.label) && !isAllUppercase(label)) {
      current.label = label;
    }
  });

  return [...grouped.values()].sort((first, second) => second.hours - first.hours);
};
