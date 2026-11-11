// Exportación de las tarjetas de evaluación: texto para mandar por mensaje y PDF.
// Solo incluye comentarios visibles (los ocultos en pantalla no salen).
import {
  surveyTypeHints,
  surveyTypeLabels,
  textFieldLabels,
  textFields,
  type SurveyCard,
} from "./evaluationCards.ts";

export type PlatformSummary = {
  finalGrade: number | null;
  gradeMean: number | null;
  points: number;
  pointsMean: number | null;
  gradeRank: number | null;
  pointsRank: number | null;
  rankOf: number;
  taskCount: number;
  gradedCount: number;
  onTimeCount: number;
  lateCount: number;
  notDeliveredCount: number;
  profileLabel: string | null;
};

export type CardModel = {
  key: string;
  name: string;
  roleLabel: string | null;
  platform: PlatformSummary | null;
  surveys: SurveyCard[];
  directorNote: string;
};

export type ExportOptions = { periodLabel: string; includeRanks: boolean };

const fmt = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "-" : ""}${fmt(Math.abs(value), digits)}`;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const deliveriesLine = (platform: PlatformSummary) =>
  [
    plural(platform.onTimeCount, "a tiempo", "a tiempo"),
    plural(platform.lateCount, "tardía", "tardías"),
    plural(platform.notDeliveredCount, "no entregada", "no entregadas"),
  ].join(" · ");

export const surveyHeadline = (survey: SurveyCard) =>
  `${fmt(survey.overall, 2)} de 5 (equipo: ${fmt(survey.groupOverall, 2)})`;

export const surveyNotes = (survey: SurveyCard) =>
  [
    survey.smallSample ? `pocas respuestas (${survey.n}), tómalo como referencia` : "",
    survey.divided ? "las opiniones están divididas entre quienes respondieron" : "",
  ].filter(Boolean);

const visibleComments = (survey: SurveyCard) =>
  textFields
    .map((field) => ({
      field,
      items: survey.comments[field].filter((comment) => !comment.hidden).map((comment) => comment.text),
    }))
    .filter((group) => group.items.length > 0);

const platformLines = (platform: PlatformSummary, options: ExportOptions) => {
  const lines: string[] = [];
  if (platform.finalGrade !== null) {
    lines.push(
      `Calificación final: ${fmt(platform.finalGrade)}${platform.gradeMean !== null ? ` (equipo: ${fmt(platform.gradeMean)})` : ""}${
        options.includeRanks && platform.gradeRank ? ` · lugar ${platform.gradeRank} de ${platform.rankOf}` : ""
      }`,
    );
    lines.push(
      `Puntos obtenidos: ${fmt(platform.points)}${platform.pointsMean !== null ? ` (equipo: ${fmt(platform.pointsMean)})` : ""}${
        options.includeRanks && platform.pointsRank ? ` · lugar ${platform.pointsRank} de ${platform.rankOf}` : ""
      }`,
    );
  } else {
    lines.push("Calificación final: sin tareas calificadas");
  }
  lines.push(`Tareas: ${platform.taskCount} (${platform.gradedCount} calificadas)`);
  lines.push(`Entregas: ${deliveriesLine(platform)}`);
  if (platform.profileLabel) lines.push(`Perfil: ${platform.profileLabel}`);
  return lines;
};

/** Texto con formato de WhatsApp (*negritas*) listo para pegar en un mensaje. */
export const buildCardText = (card: CardModel, options: ExportOptions) => {
  const out: string[] = [`*Tarjeta de evaluación · ${card.name}*`, `Semestre: ${options.periodLabel}`];
  if (card.platform) {
    out.push("", "*Desempeño en la plataforma*", ...platformLines(card.platform, options).map((line) => `• ${line}`));
  }
  for (const survey of card.surveys) {
    out.push(
      "",
      `*${surveyTypeLabels[survey.surveyType]}* (${surveyTypeHints[survey.surveyType].toLowerCase()} · ${plural(survey.n, "respuesta", "respuestas")})`,
      `• Promedio: ${surveyHeadline(survey)}`,
    );
    if (survey.strongest.length) {
      out.push(`• Lo más valorado: ${survey.strongest.map((item) => `${item.label} (${fmt(item.mean)})`).join(", ")}`);
    }
    if (survey.weakest.length) {
      out.push(`• Áreas de oportunidad: ${survey.weakest.map((item) => `${item.label} (${fmt(item.mean)})`).join(", ")}`);
    }
    for (const note of surveyNotes(survey)) out.push(`• Nota: ${note}`);
    for (const group of visibleComments(survey)) {
      out.push("", `_${textFieldLabels[group.field]}_`, ...group.items.map((text) => `- ${text.replace(/\s*\n\s*/g, " ")}`));
    }
  }
  if (card.directorNote.trim()) {
    out.push("", "*Comentarios de dirección*", card.directorNote.trim());
  }
  out.push("", "_Los comentarios del equipo son anónimos._");
  return out.join("\n");
};

// ---------------------------------------------------------------- PDF

/** Las fuentes estándar de PDF no tienen emojis ni otros símbolos: se quitan. */
const pdfSafe = (value: string) =>
  value
    .replace(/[•●▪]/g, "-")
    .replace(/[−–—]/g, "-")
    .replace(/[^\n\x20-\x7E -ÿ“”‘’…]/g, "")
    .replace(/[ \t]+/g, " ");

type Rgb = [number, number, number];
const ACCENT: Rgb = [47, 111, 237];
const MUTED: Rgb = [100, 116, 139];
const INK: Rgb = [15, 23, 42];

export const downloadCardsPdf = async (cards: CardModel[], options: ExportOptions, fileName: string) => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 44;
  const contentWidth = pageWidth - marginX * 2;
  let y = 0;

  const lastTableY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const ensure = (space: number) => {
    if (y + space > pageHeight - 48) {
      doc.addPage();
      y = 54;
    }
  };
  const write = (text: string, size: number, color: Rgb = INK, style: "normal" | "bold" | "italic" = "normal", gap = 4) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfSafe(text), contentWidth) as string[];
    for (const line of lines) {
      ensure(size + gap);
      doc.text(line, marginX, y);
      y += size + gap;
    }
  };
  const heading = (text: string) => {
    ensure(40);
    y += 10;
    write(text, 12.5, ACCENT, "bold", 6);
  };

  cards.forEach((card, index) => {
    if (index > 0) doc.addPage();
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, pageWidth, 6, "F");
    y = 50;
    write("TARJETA DE EVALUACIÓN", 9, ACCENT, "bold", 6);
    write(card.name, 20, INK, "bold", 6);
    write([card.roleLabel, `Semestre ${options.periodLabel}`].filter(Boolean).join(" · "), 10, MUTED, "normal", 4);

    if (card.platform) {
      heading("Desempeño en la plataforma");
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        body: platformLines(card.platform, options).map((line) => {
          const [label, ...rest] = line.split(": ");
          return [pdfSafe(label), pdfSafe(rest.join(": "))];
        }),
        theme: "plain",
        styles: { fontSize: 9.5, cellPadding: 4, textColor: INK },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
      });
      y = lastTableY() + 8;
    }

    for (const survey of card.surveys) {
      heading(`${surveyTypeLabels[survey.surveyType]} · ${surveyTypeHints[survey.surveyType].toLowerCase()}`);
      write(`Promedio general: ${surveyHeadline(survey)} · ${plural(survey.n, "respuesta", "respuestas")}`, 10, INK, "bold");
      for (const note of surveyNotes(survey)) write(`Nota: ${note}.`, 9, MUTED, "italic");
      autoTable(doc, {
        startY: y + 2,
        margin: { left: marginX, right: marginX },
        head: [["Criterio", "Promedio", "Equipo", "Diferencia"]],
        body: survey.criteria.map((item) => [pdfSafe(item.label), fmt(item.mean), fmt(item.groupMean), signed(item.diff)]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: ACCENT },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 3) {
            const diff = survey.criteria[data.row.index]?.diff ?? 0;
            if (diff >= 0.3) data.cell.styles.textColor = [4, 120, 87];
            else if (diff <= -0.3) data.cell.styles.textColor = [185, 28, 28];
          }
        },
      });
      y = lastTableY() + 14;
      for (const group of visibleComments(survey)) {
        write(textFieldLabels[group.field], 10, INK, "bold", 5);
        for (const text of group.items) write(`- ${text.replace(/\s*\n\s*/g, " ")}`, 9.5, INK, "normal", 3.5);
        y += 6;
      }
    }

    if (card.directorNote.trim()) {
      heading("Comentarios de dirección");
      write(card.directorNote.trim(), 10, INK, "normal", 4);
    }

    ensure(24);
    y += 10;
    write("Los comentarios del equipo son anónimos.", 8.5, MUTED, "italic");
  });

  doc.save(fileName);
};
