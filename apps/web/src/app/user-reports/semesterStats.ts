// Estadística del equipo para la evaluación semestral.
// Dos medidas por persona:
//   - Calificación (calidad): promedio ponderado de sus calificaciones, 0 a 100.
//   - Puntos obtenidos (productividad): suma de horas × ponderación × calificación ÷ 100.
// Para compararlas entre sí y con el grupo se usan puntuaciones z (cuántas
// desviaciones estándar está cada persona arriba o abajo de la media).

export type Summary = {
  n: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
};

export type Band = "muy_arriba" | "arriba" | "media" | "abajo" | "muy_abajo";

export type Profile =
  | "alto_desempeno"
  | "productivo"
  | "calidad"
  | "atencion";

export type MemberInput = {
  userId: string;
  fullName: string;
  finalGrade: number | null;
  earnedPoints: number;
  manuallyGradedCount: number;
};

export type MemberStats = {
  userId: string;
  fullName: string;
  grade: number;
  gradeDiff: number;
  gradeZ: number;
  gradeBand: Band;
  points: number;
  /** Calificación por puntos: puntos ÷ máximo del grupo × 100. */
  pointsScore: number;
  /** Puntos como % de la media del grupo (100 = igual a la media). */
  pointsIndex: number;
  pointsZ: number;
  pointsBand: Band;
  pointsPercentile: number;
  pointsRank: number;
  profile: Profile;
};

export const summarize = (values: number[]): Summary | null => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const middle = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  // Desviación estándar muestral (n - 1): el equipo es una muestra del desempeño.
  const variance = n > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, median, stdDev: Math.sqrt(variance), min: sorted[0], max: sorted[n - 1] };
};

export const zScore = (value: number, summary: Summary) =>
  summary.stdDev > 0 ? (value - summary.mean) / summary.stdDev : 0;

export const bandFor = (z: number): Band => {
  if (z >= 1) return "muy_arriba";
  if (z >= 0.5) return "arriba";
  if (z > -0.5) return "media";
  if (z > -1) return "abajo";
  return "muy_abajo";
};

/** Percentil (0-100): % del grupo con un valor menor, contando empates a la mitad. */
export const percentileRank = (value: number, values: number[]) => {
  if (values.length === 0) return 0;
  const below = values.filter((other) => other < value).length;
  const equal = values.filter((other) => other === value).length;
  return ((below + equal / 2) / values.length) * 100;
};

/** Cuadrante calidad × productividad respecto a la media del grupo. */
export const profileFor = (gradeZ: number, pointsZ: number): Profile => {
  if (gradeZ >= 0 && pointsZ >= 0) return "alto_desempeno";
  if (pointsZ >= 0) return "productivo";
  if (gradeZ >= 0) return "calidad";
  return "atencion";
};

/**
 * Solo entran a la estadística las personas con al menos una calificación
 * capturada y un resultado final mayor que cero. Quienes tienen 0 permanecen
 * visibles en el reporte individual, pero no afectan la comparación.
 */
export const buildTeamStats = (allMembers: MemberInput[]) => {
  const members = allMembers.filter(
    (member): member is MemberInput & { finalGrade: number } =>
      member.manuallyGradedCount > 0 &&
      member.finalGrade !== null &&
      member.finalGrade > 0,
  );
  const excluded = allMembers.length - members.length;
  const grades = members.map((member) => member.finalGrade);
  const points = members.map((member) => member.earnedPoints);
  const gradeSummary = summarize(grades);
  const pointsSummary = summarize(points);
  const maxPoints = pointsSummary?.max ?? 0;
  const totalPoints = points.reduce((sum, value) => sum + value, 0);

  const byPoints = [...members].sort(
    (a, b) => b.earnedPoints - a.earnedPoints || a.fullName.localeCompare(b.fullName, "es"),
  );
  const pointsRankById = new Map(byPoints.map((member, index) => [member.userId, index + 1]));

  const rows: MemberStats[] = members.map((member) => {
    const pointsZ = pointsSummary ? zScore(member.earnedPoints, pointsSummary) : 0;
    const gradeZ = gradeSummary ? zScore(member.finalGrade, gradeSummary) : 0;
    return {
      userId: member.userId,
      fullName: member.fullName,
      grade: member.finalGrade,
      gradeDiff: gradeSummary ? member.finalGrade - gradeSummary.mean : 0,
      gradeZ,
      gradeBand: bandFor(gradeZ),
      points: member.earnedPoints,
      pointsScore: maxPoints > 0 ? (member.earnedPoints / maxPoints) * 100 : 0,
      pointsIndex: pointsSummary && pointsSummary.mean > 0 ? (member.earnedPoints / pointsSummary.mean) * 100 : 0,
      pointsZ,
      pointsBand: bandFor(pointsZ),
      pointsPercentile: percentileRank(member.earnedPoints, points),
      pointsRank: pointsRankById.get(member.userId) ?? 0,
      profile: profileFor(gradeZ, pointsZ),
    };
  });

  return { gradeSummary, pointsSummary, totalPoints, excluded, rows };
};
