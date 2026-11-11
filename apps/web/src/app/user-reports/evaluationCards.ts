// Lógica de las tarjetas de evaluación: lectura de las encuestas de Google
// Forms (CSV), reconocimiento de nombres y estadística por persona.
// La columna de quien evalúa nunca se lee: los comentarios son anónimos.

export type SurveyType = "lider" | "profesor";
export type SurveyTextField = "strengths" | "improvements" | "comments";

export const surveyTypeLabels: Record<SurveyType, string> = {
  lider: "Evaluación como líder",
  profesor: "Evaluación como profesor",
};

export const surveyTypeHints: Record<SurveyType, string> = {
  lider: "La responde su equipo",
  profesor: "La responden sus líderes",
};

export const textFieldLabels: Record<SurveyTextField, string> = {
  strengths: "Fortalezas",
  improvements: "Aspectos a mejorar",
  comments: "Comentarios adicionales",
};

export const textFields: SurveyTextField[] = ["strengths", "improvements", "comments"];

// ---------------------------------------------------------------- CSV

/** Lee un CSV (RFC 4180): comillas, comas y saltos de línea dentro de celdas. */
export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((current) => current.some((value) => value.trim() !== ""));
};

// ---------------------------------------------------------------- nombres

export const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshtein = (a: string, b: string) => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
};

/** Tolera errores de dedo: "Chistopher" = "Christopher", "Murguía" = "Munguía". */
const tokensMatch = (a: string, b: string) => {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 4) return false;
  return levenshtein(a, b) <= (shorter >= 7 ? 2 : 1);
};

export type Person = { userId: string; fullName: string };

/**
 * Busca a la persona cuyo nombre contiene todas las palabras escritas en la
 * encuesta ("Veloz" → "Sinuhe Veloz"). Si hay empate, no adivina.
 */
export const matchPerson = (raw: string, people: Person[]): Person | null => {
  const tokens = normalizeName(raw).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  let best: Person | null = null;
  let bestScore = 0;
  let tie = false;
  for (const person of people) {
    const personTokens = normalizeName(person.fullName).split(" ").filter(Boolean);
    const allFound = tokens.every((token) => personTokens.some((candidate) => tokensMatch(token, candidate)));
    if (!allFound) continue;
    const exact = tokens.filter((token) => personTokens.includes(token)).length;
    // Más palabras coinciden = mejor; a igualdad, gana el nombre más corto (más específico).
    const score = tokens.length * 10 + exact - personTokens.length * 0.1;
    if (score > bestScore + 1e-9) {
      best = person;
      bestScore = score;
      tie = false;
    } else if (Math.abs(score - bestScore) < 1e-9) {
      tie = true;
    }
  }
  return tie ? null : best;
};

const IGNORED_NAMES = new Set(["", "otro", "otra", "otros", "na", "n a", "ninguno", "anonimo", "anonima"]);
export const isIgnorableName = (raw: string) => IGNORED_NAMES.has(normalizeName(raw));

const titleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());

// ---------------------------------------------------------------- columnas

/** "5 Excelente" → 5; "4" → 4. Fuera de 1 a 5 → null. */
export const parseScore = (value: string): number | null => {
  const match = /^\s*(\d+(?:[.,]\d+)?)/.exec(value ?? "");
  if (!match) return null;
  const score = Number(match[1].replace(",", "."));
  return score >= 1 && score <= 5 ? score : null;
};

/** "Califique cada criterio [Proactividad]" → "Proactividad". */
export const criterionLabel = (header: string) => {
  const bracket = /\[([^\]]+)\]\s*$/.exec(header);
  return (bracket ? bracket[1] : header).replace(/\s+/g, " ").trim();
};

const NOISE_HEADER = /marca temporal|timestamp|correo|e-?mail/i;
const EVALUATOR_HEADER = /evaluador|nombre/i;
const SUBJECT_HEADER = /encargad|evaluad[oa]\b|l[ií]der|profesor|colaborador|persona/i;

export type SurveyLayout = {
  headers: string[];
  subjectColumn: number;
  criteria: Array<{ column: number; label: string }>;
  text: Partial<Record<SurveyTextField, number>>;
  suggestedType: SurveyType | null;
};

export const detectLayout = (rows: string[][], people: Person[]): SurveyLayout => {
  const headers = rows[0] ?? [];
  const data = rows.slice(1);
  const criteria: SurveyLayout["criteria"] = [];
  const text: SurveyLayout["text"] = {};
  const candidates: Array<{ column: number; score: number }> = [];

  headers.forEach((header, column) => {
    if (NOISE_HEADER.test(header)) return;
    const values = data.map((row) => (row[column] ?? "").trim()).filter(Boolean);
    const numeric = values.length
      ? values.filter((value) => parseScore(value) !== null).length / values.length
      : 0;
    if (numeric >= 0.8) {
      criteria.push({ column, label: criterionLabel(header) });
      return;
    }
    const plain = normalizeName(header);
    if (/fortaleza/.test(plain) && text.strengths === undefined) {
      text.strengths = column;
      return;
    }
    if (/mejorar|mejora|debilidad|oportunidad/.test(plain) && text.improvements === undefined) {
      text.improvements = column;
      return;
    }
    if (/comentario|observacion/.test(plain) && text.comments === undefined) {
      text.comments = column;
      return;
    }
    if (values.length === 0) return;
    const averageLength = values.reduce((sum, value) => sum + value.length, 0) / values.length;
    if (averageLength > 60) return;
    const matched = values.filter((value) => matchPerson(value, people) !== null).length / values.length;
    const score =
      matched + (SUBJECT_HEADER.test(header) ? 1 : 0) - (EVALUATOR_HEADER.test(header) ? 2 : 0);
    candidates.push({ column, score });
  });

  candidates.sort((a, b) => b.score - a.score || a.column - b.column);
  const subjectColumn = candidates[0]?.column ?? -1;

  const allHeaders = normalizeName(headers.join(" "));
  const subjectHeader = normalizeName(headers[subjectColumn] ?? "");
  const suggestedType: SurveyType | null =
    /encargad|lider/.test(subjectHeader) || /\blider\b/.test(allHeaders)
      ? "lider"
      : /profesor/.test(allHeaders)
        ? "profesor"
        : null;

  return { headers, subjectColumn, criteria, text, suggestedType };
};

// ---------------------------------------------------------------- importación

export type NameResolution =
  | { kind: "user"; userId: string }
  | { kind: "name"; name: string }
  | { kind: "skip" };

export type RawName = { key: string; raw: string; count: number; auto: NameResolution };

/** Nombres distintos de la columna "evaluado" con su reconocimiento automático. */
export const collectNames = (rows: string[][], subjectColumn: number, people: Person[]): RawName[] => {
  const byKey = new Map<string, RawName>();
  for (const row of rows.slice(1)) {
    const raw = (row[subjectColumn] ?? "").trim();
    const key = normalizeName(raw);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const person = isIgnorableName(raw) ? null : matchPerson(raw, people);
    byKey.set(key, {
      key,
      raw: raw || "(vacío)",
      count: 1,
      auto: person
        ? { kind: "user", userId: person.userId }
        : isIgnorableName(raw)
          ? { kind: "skip" }
          : { kind: "name", name: titleCase(raw) },
    });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw, "es"));
};

export type ImportedResponse = {
  subjectKey: string;
  subjectName: string;
  subjectUserId: string | null;
  scores: Record<string, number>;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
};

export const subjectKeyFor = (resolution: NameResolution) =>
  resolution.kind === "user"
    ? `user:${resolution.userId}`
    : resolution.kind === "name"
      ? `name:${normalizeName(resolution.name)}`
      : "";

export const buildImport = (
  rows: string[][],
  layout: SurveyLayout,
  resolutions: Map<string, NameResolution>,
  people: Person[],
): ImportedResponse[] => {
  const nameById = new Map(people.map((person) => [person.userId, person.fullName]));
  const responses: ImportedResponse[] = [];
  for (const row of rows.slice(1)) {
    const resolution = resolutions.get(normalizeName(row[layout.subjectColumn] ?? ""));
    if (!resolution || resolution.kind === "skip") continue;
    if (resolution.kind === "name" && !normalizeName(resolution.name)) continue;
    const scores: Record<string, number> = {};
    for (const { column, label } of layout.criteria) {
      const score = parseScore(row[column] ?? "");
      if (score !== null) scores[label] = score;
    }
    const textOf = (field: SurveyTextField) => {
      const column = layout.text[field];
      const value = column === undefined ? "" : (row[column] ?? "").trim();
      return value || null;
    };
    const response: ImportedResponse = {
      subjectKey: subjectKeyFor(resolution),
      subjectName:
        resolution.kind === "user" ? nameById.get(resolution.userId) ?? resolution.userId : resolution.name.trim(),
      subjectUserId: resolution.kind === "user" ? resolution.userId : null,
      scores,
      strengths: textOf("strengths"),
      improvements: textOf("improvements"),
      comments: textOf("comments"),
    };
    const hasContent =
      Object.keys(scores).length > 0 || response.strengths || response.improvements || response.comments;
    if (hasContent) responses.push(response);
  }
  return responses;
};

// ---------------------------------------------------------------- tarjetas

export type StoredResponse = ImportedResponse & {
  id: string;
  surveyType: SurveyType;
  hiddenFields: SurveyTextField[];
};

const EMPTY_COMMENT =
  /^(ninguno|ninguna|nada|na|n a|no|ok|sin comentarios?|no aplica|no tengo|ningun[oa]? (por el momento|por ahora|en particular))$/;

/** Descarta respuestas vacías como "Ninguno", "N/A" o "---". */
export const isMeaningfulComment = (value: string | null | undefined) => {
  const plain = normalizeName(value ?? "");
  return plain.length >= 2 && !EMPTY_COMMENT.test(plain);
};

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const sampleStdDev = (values: number[]) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
};

export type CriterionResult = { label: string; mean: number; groupMean: number; diff: number; n: number };
export type CardComment = { responseId: string; field: SurveyTextField; text: string; hidden: boolean };

export type SurveyCard = {
  surveyType: SurveyType;
  subjectKey: string;
  subjectName: string;
  subjectUserId: string | null;
  n: number;
  overall: number;
  groupOverall: number;
  /** Desviación estándar entre evaluadores: alta = opiniones divididas. */
  spread: number;
  rank: number;
  rankOf: number;
  criteria: CriterionResult[];
  strongest: CriterionResult[];
  weakest: CriterionResult[];
  comments: Record<SurveyTextField, CardComment[]>;
  smallSample: boolean;
  divided: boolean;
};

export const SMALL_SAMPLE = 3;
export const DIVIDED_SPREAD = 1;
/** Diferencias menores a esto respecto al equipo se consideran empate. */
export const MEANINGFUL_DIFF = 0.05;

/**
 * Resultados de una encuesta por persona. La media del equipo es el promedio
 * de las medias de cada persona, para que quien recibió más respuestas no pese más.
 */
export const buildSurveyCards = (responses: StoredResponse[], surveyType: SurveyType): SurveyCard[] => {
  const ofType = responses.filter((response) => response.surveyType === surveyType);
  const criteriaOrder: string[] = [];
  for (const response of ofType) {
    for (const label of Object.keys(response.scores)) if (!criteriaOrder.includes(label)) criteriaOrder.push(label);
  }

  const bySubject = new Map<string, StoredResponse[]>();
  for (const response of ofType) {
    bySubject.set(response.subjectKey, [...(bySubject.get(response.subjectKey) ?? []), response]);
  }

  const partial = [...bySubject.entries()].map(([subjectKey, items]) => {
    const criterionMeans = new Map<string, { mean: number; n: number }>();
    for (const label of criteriaOrder) {
      const values = items.map((item) => item.scores[label]).filter((value): value is number => typeof value === "number");
      if (values.length) criterionMeans.set(label, { mean: mean(values), n: values.length });
    }
    const perResponse = items
      .map((item) => Object.values(item.scores))
      .filter((values) => values.length > 0)
      .map(mean);
    return { subjectKey, items, criterionMeans, overall: mean(perResponse), spread: sampleStdDev(perResponse), scored: perResponse.length };
  });

  const scoredSubjects = partial.filter((subject) => subject.scored > 0);
  const groupOverall = mean(scoredSubjects.map((subject) => subject.overall));
  const groupCriterion = new Map(
    criteriaOrder.map((label) => [
      label,
      mean(partial.flatMap((subject) => (subject.criterionMeans.has(label) ? [subject.criterionMeans.get(label)!.mean] : []))),
    ]),
  );
  const ranking = [...scoredSubjects].sort((a, b) => b.overall - a.overall);

  return partial
    .map((subject) => {
      const first = subject.items[0];
      const criteria: CriterionResult[] = criteriaOrder
        .filter((label) => subject.criterionMeans.has(label))
        .map((label) => {
          const result = subject.criterionMeans.get(label)!;
          const groupMean = groupCriterion.get(label) ?? 0;
          return { label, mean: result.mean, groupMean, diff: result.mean - groupMean, n: result.n };
        });
      const byDiff = [...criteria].sort((a, b) => b.diff - a.diff || b.mean - a.mean);
      // Fortalezas: criterios sobre la media del equipo; si no hay, sus mejores
      // criterios. Áreas de oportunidad: solo criterios debajo de la media.
      const above = byDiff.filter((item) => item.diff > MEANINGFUL_DIFF);
      const strongest = (above.length ? above : [...criteria].sort((a, b) => b.mean - a.mean)).slice(0, 2);
      const weakest = byDiff
        .filter((item) => item.diff < -MEANINGFUL_DIFF && !strongest.includes(item))
        .reverse()
        .slice(0, 2);
      const comments = Object.fromEntries(
        textFields.map((field) => [
          field,
          subject.items
            .filter((item) => isMeaningfulComment(item[field]))
            .map((item) => ({
              responseId: item.id,
              field,
              text: (item[field] ?? "").trim(),
              hidden: item.hiddenFields.includes(field),
            }))
            // Orden alfabético independiente por lista: así no se puede unir la
            // fortaleza y el aspecto a mejorar que escribió la misma persona.
            .sort((a, b) => a.text.localeCompare(b.text, "es")),
        ]),
      ) as Record<SurveyTextField, CardComment[]>;
      const rankIndex = ranking.findIndex((ranked) => ranked.subjectKey === subject.subjectKey);
      return {
        surveyType,
        subjectKey: subject.subjectKey,
        subjectName: first.subjectName,
        subjectUserId: first.subjectUserId,
        n: subject.items.length,
        overall: subject.overall,
        groupOverall,
        spread: subject.spread,
        rank: rankIndex + 1,
        rankOf: ranking.length,
        criteria,
        strongest,
        weakest,
        comments,
        smallSample: subject.items.length < SMALL_SAMPLE,
        divided: subject.spread >= DIVIDED_SPREAD,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "es"));
};
