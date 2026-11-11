"use client";

import axios from "axios";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { API_URL, authHeaders } from "../../lib/api";
import { buildCardText, downloadCardsPdf, type CardModel } from "./cardExport";
import {
  buildImport,
  buildSurveyCards,
  collectNames,
  detectLayout,
  parseCsv,
  surveyTypeHints,
  surveyTypeLabels,
  textFieldLabels,
  textFields,
  type CardComment,
  type NameResolution,
  type StoredResponse,
  type SurveyCard,
  type SurveyLayout,
  type SurveyTextField,
  type SurveyType,
} from "./evaluationCards";
import type { MemberStats, Summary } from "./semesterStats";

export type CardMember = {
  userId: string;
  fullName: string;
  role?: string;
  taskCount: number;
  gradedCount: number;
  onTimeCount: number;
  lateCount: number;
  notDeliveredCount: number;
  earnedPoints: number;
  finalGrade: number | null;
};

type Props = {
  year: number;
  semester: 1 | 2;
  periodLabel: string;
  members: CardMember[];
  statsByUser: Map<string, MemberStats>;
  gradeSummary: Summary | null;
  pointsSummary: Summary | null;
  rankedCount: number;
  profileLabels: Record<MemberStats["profile"], string>;
};

type StoredNote = { subjectKey: string; subjectName: string; comments: string; updatedAt: string };
type CardsData = { responses: StoredResponse[]; notes: StoredNote[] };

type ImportDraft = {
  source: string;
  rows: string[][];
  layout: SurveyLayout;
  surveyType: SurveyType | "";
  /** Nombre normalizado → cómo se resuelve; si falta, se usa el reconocimiento automático. */
  overrides: Record<string, NameResolution>;
};

const roleLabels: Record<string, string> = { lead: "Líder", worker: "Colaborador", manager: "Gerencia" };

const fmt = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value))}`;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return typeof message === "string" ? message : Array.isArray(message) ? message.join(". ") : fallback;
};

const resolutionValue = (resolution: NameResolution) =>
  resolution.kind === "user" ? `user:${resolution.userId}` : resolution.kind;

const fileSafe = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export default function EvaluationCardsPanel({
  year,
  semester,
  periodLabel,
  members,
  statsByUser,
  gradeSummary,
  pointsSummary,
  rankedCount,
  profileLabels,
}: Props) {
  const [data, setData] = useState<CardsData>({ responses: [], notes: [] });
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState(false);
  const [includeRanks, setIncludeRanks] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const people = useMemo(
    () => members.map((member) => ({ userId: member.userId, fullName: member.fullName })),
    [members],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await axios.get<CardsData>(`${API_URL}/evaluation-cards`, {
          headers: authHeaders(),
          params: { year, semester },
        });
        if (cancelled) return;
        setData(response.data);
        setNoteDrafts(Object.fromEntries(response.data.notes.map((note) => [note.subjectKey, note.comments])));
      } catch (caughtError) {
        if (!cancelled) setError(getErrorMessage(caughtError, "No se pudieron cargar las tarjetas de evaluación."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [year, semester]);

  // ------------------------------------------------------------ tarjetas

  const surveyCards = useMemo(
    () => ({
      lider: buildSurveyCards(data.responses, "lider"),
      profesor: buildSurveyCards(data.responses, "profesor"),
    }),
    [data.responses],
  );

  const surveyCounts = useMemo(() => {
    const counts: Record<SurveyType, number> = { lider: 0, profesor: 0 };
    for (const response of data.responses) counts[response.surveyType] += 1;
    return counts;
  }, [data.responses]);

  const cards = useMemo<CardModel[]>(() => {
    const byKey = new Map<string, CardModel>();
    const notes = new Map(data.notes.map((note) => [note.subjectKey, note]));
    for (const member of members) {
      const stats = statsByUser.get(member.userId);
      const key = `user:${member.userId}`;
      byKey.set(key, {
        key,
        name: member.fullName,
        roleLabel: member.role ? roleLabels[member.role] ?? null : null,
        platform: {
          finalGrade: member.finalGrade,
          gradeMean: gradeSummary?.mean ?? null,
          points: member.earnedPoints,
          pointsMean: pointsSummary?.mean ?? null,
          gradeRank: stats ? [...statsByUser.values()].filter((row) => row.grade > stats.grade).length + 1 : null,
          pointsRank: stats?.pointsRank ?? null,
          rankOf: rankedCount,
          taskCount: member.taskCount,
          gradedCount: member.gradedCount,
          onTimeCount: member.onTimeCount,
          lateCount: member.lateCount,
          notDeliveredCount: member.notDeliveredCount,
          profileLabel: stats ? profileLabels[stats.profile] : null,
        },
        surveys: [],
        directorNote: notes.get(key)?.comments ?? "",
      });
    }
    for (const survey of [...surveyCards.lider, ...surveyCards.profesor]) {
      const existing = byKey.get(survey.subjectKey);
      if (existing) {
        existing.surveys.push(survey);
      } else {
        byKey.set(survey.subjectKey, {
          key: survey.subjectKey,
          name: survey.subjectName,
          roleLabel: null,
          platform: null,
          surveys: [survey],
          directorNote: notes.get(survey.subjectKey)?.comments ?? "",
        });
      }
    }
    return [...byKey.values()]
      .map((card) => ({ ...card, directorNote: noteDrafts[card.key] ?? card.directorNote }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [members, statsByUser, gradeSummary, pointsSummary, rankedCount, profileLabels, surveyCards, data.notes, noteDrafts]);

  const activeKey = cards.some((card) => card.key === selectedKey) ? selectedKey : cards[0]?.key ?? "";
  const activeIndex = cards.findIndex((card) => card.key === activeKey);
  const card = activeIndex >= 0 ? cards[activeIndex] : null;
  const savedNote = data.notes.find((note) => note.subjectKey === activeKey);
  const noteDirty = card ? (noteDrafts[card.key] ?? "") !== (savedNote?.comments ?? "") : false;

  const exportOptions = { periodLabel, includeRanks };

  // ------------------------------------------------------------ acciones

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const toggleHidden = async (comment: CardComment) => {
    const response = data.responses.find((item) => item.id === comment.responseId);
    if (!response) return;
    const hiddenFields: SurveyTextField[] = comment.hidden
      ? response.hiddenFields.filter((field) => field !== comment.field)
      : [...response.hiddenFields, comment.field];
    const previous = data.responses;
    setData((current) => ({
      ...current,
      responses: current.responses.map((item) => (item.id === response.id ? { ...item, hiddenFields } : item)),
    }));
    try {
      await axios.put(`${API_URL}/evaluation-cards/responses/${response.id}/hidden`, { hiddenFields }, { headers: authHeaders() });
    } catch (caughtError) {
      setData((current) => ({ ...current, responses: previous }));
      setError(getErrorMessage(caughtError, "No se pudo actualizar el comentario."));
    }
  };

  const saveNote = async () => {
    if (!card) return;
    setSavingNote(true);
    setError("");
    try {
      const userId = card.key.startsWith("user:") ? card.key.slice(5) : null;
      const response = await axios.put<{ subjectKey: string; comments: string; updatedAt: string }>(
        `${API_URL}/evaluation-cards/notes`,
        {
          year,
          semester,
          subjectKey: card.key,
          subjectName: card.name,
          subjectUserId: userId,
          comments: noteDrafts[card.key] ?? "",
        },
        { headers: authHeaders() },
      );
      setData((current) => ({
        ...current,
        notes: [
          ...current.notes.filter((note) => note.subjectKey !== card.key),
          { subjectKey: card.key, subjectName: card.name, comments: response.data.comments, updatedAt: response.data.updatedAt },
        ],
      }));
      setNoteDrafts((current) => ({ ...current, [card.key]: response.data.comments }));
      flash("Comentarios de dirección guardados.");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudieron guardar los comentarios."));
    } finally {
      setSavingNote(false);
    }
  };

  const copyText = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(buildCardText(card, exportOptions));
      flash("Texto copiado. Pégalo en el mensaje.");
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  };

  const downloadPdf = async (all: boolean) => {
    const targets = all ? cards : card ? [card] : [];
    if (targets.length === 0) return;
    setError("");
    try {
      const period = `${year}-S${semester}`;
      await downloadCardsPdf(
        targets,
        exportOptions,
        all ? `tarjetas-evaluacion-${period}.pdf` : `tarjeta-${fileSafe(targets[0].name)}-${period}.pdf`,
      );
    } catch {
      setError("No se pudo generar el PDF.");
    }
  };

  // ------------------------------------------------------------ importación

  const startDraft = (csv: string, source: string) => {
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      setError("La hoja no tiene respuestas.");
      return;
    }
    const layout = detectLayout(rows, people);
    if (layout.subjectColumn < 0 || layout.criteria.length === 0) {
      setError("No reconocí la encuesta: debe tener una columna con el nombre de la persona evaluada y criterios de 1 a 5.");
      return;
    }
    setError("");
    setDraft({ source, rows, layout, surveyType: layout.suggestedType ?? "", overrides: {} });
  };

  const loadFromUrl = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await axios.post<{ csv: string }>(
        `${API_URL}/evaluation-cards/fetch-sheet`,
        { url: sheetUrl },
        { headers: authHeaders() },
      );
      startDraft(response.data.csv, "Google Sheets");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudo leer la hoja."));
    } finally {
      setBusy(false);
    }
  };

  const loadFromFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text().then((text) => startDraft(text, file.name));
  };

  const draftNames = useMemo(
    () => (draft ? collectNames(draft.rows, draft.layout.subjectColumn, people) : []),
    [draft, people],
  );

  const draftResolutions = useMemo(
    () => new Map(draftNames.map((name) => [name.key, draft?.overrides[name.key] ?? name.auto])),
    [draftNames, draft],
  );

  const draftResponses = useMemo(
    () => (draft ? buildImport(draft.rows, draft.layout, draftResolutions, people) : []),
    [draft, draftResolutions, people],
  );

  const setOverride = (key: string, raw: string, value: string) => {
    const resolution: NameResolution =
      value === "skip"
        ? { kind: "skip" }
        : value === "name"
          ? { kind: "name", name: raw }
          : { kind: "user", userId: value.slice(5) };
    setDraft((current) => (current ? { ...current, overrides: { ...current.overrides, [key]: resolution } } : current));
  };

  const saveImport = async () => {
    if (!draft || !draft.surveyType || draftResponses.length === 0) return;
    const replacing = surveyCounts[draft.surveyType];
    if (
      replacing > 0 &&
      !window.confirm(
        `Ya hay ${replacing} respuestas de la ${surveyTypeLabels[draft.surveyType].toLowerCase()} en este semestre. Se reemplazarán por las ${draftResponses.length} nuevas (los comentarios que ocultaste volverán a mostrarse). ¿Continuar?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await axios.put(
        `${API_URL}/evaluation-cards/surveys`,
        { year, semester, surveyType: draft.surveyType, responses: draftResponses },
        { headers: authHeaders() },
      );
      const response = await axios.get<CardsData>(`${API_URL}/evaluation-cards`, {
        headers: authHeaders(),
        params: { year, semester },
      });
      setData(response.data);
      setDraft(null);
      setImportOpen(false);
      setSheetUrl("");
      flash(`Encuesta importada: ${draftResponses.length} respuestas.`);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudo guardar la encuesta."));
    } finally {
      setBusy(false);
    }
  };

  const deleteSurvey = async (surveyType: SurveyType) => {
    if (!window.confirm(`¿Eliminar las ${surveyCounts[surveyType]} respuestas de la ${surveyTypeLabels[surveyType].toLowerCase()} de este semestre?`)) {
      return;
    }
    setBusy(true);
    try {
      await axios.delete(`${API_URL}/evaluation-cards/surveys`, {
        headers: authHeaders(),
        params: { year, semester, surveyType },
      });
      setData((current) => ({ ...current, responses: current.responses.filter((item) => item.surveyType !== surveyType) }));
      flash("Encuesta eliminada.");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudo eliminar la encuesta."));
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ vista

  return (
    <section className="kpi-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tarjetas de evaluación</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
            Une el desempeño en la plataforma con las encuestas 360 y tus comentarios. Los comentarios del equipo son
            anónimos: al importar, el nombre de quien respondió no se guarda.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(["lider", "profesor"] as SurveyType[]).map((type) => (
              <span key={type} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--background)] px-3 py-1">
                <span className="font-semibold">{surveyTypeLabels[type]}:</span>
                {surveyCounts[type] > 0 ? `${surveyCounts[type]} respuestas` : "sin importar"}
                {surveyCounts[type] > 0 ? (
                  <button
                    type="button"
                    onClick={() => void deleteSurvey(type)}
                    disabled={busy}
                    className="font-semibold text-[var(--danger)] hover:underline"
                  >
                    Eliminar
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setImportOpen((open) => !open);
            setDraft(null);
          }}
          className={`ui-btn ui-btn-sm ${importOpen ? "ui-btn-secondary" : "ui-btn-primary"}`}
        >
          {importOpen ? "Cerrar importación" : "Importar encuesta"}
        </button>
      </div>

      {error ? <p className="border-b border-[var(--line)] bg-red-50 px-5 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p className="border-b border-[var(--line)] bg-emerald-50 px-5 py-2 text-sm text-emerald-800">{notice}</p> : null}

      {importOpen ? (
        <div className="space-y-4 border-b border-[var(--line)] bg-[var(--background)] px-5 py-4">
          {!draft ? (
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="block text-sm">
                <span className="font-semibold">Enlace de la hoja de respuestas (Google Sheets)</span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(event) => setSheetUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="ui-control"
                  />
                  <button
                    type="button"
                    onClick={() => void loadFromUrl()}
                    disabled={busy || !sheetUrl.trim()}
                    className="ui-btn ui-btn-primary ui-btn-sm whitespace-nowrap"
                  >
                    {busy ? "Leyendo..." : "Leer hoja"}
                  </button>
                </div>
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                  La hoja debe estar compartida como “Cualquier persona con el enlace · Lector”.
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">o sube el CSV</span>
                <input type="file" accept=".csv,text/csv" onChange={loadFromFile} className="mt-1 block text-sm" />
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">Archivo → Descargar → CSV</span>
              </label>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-sm">
                  <span className="font-semibold">Tipo de encuesta</span>
                  <select
                    value={draft.surveyType}
                    onChange={(event) => setDraft({ ...draft, surveyType: event.target.value as SurveyType | "" })}
                    className="ui-control mt-1"
                  >
                    <option value="">Elige…</option>
                    {(["lider", "profesor"] as SurveyType[]).map((type) => (
                      <option key={type} value={type}>
                        {surveyTypeLabels[type]} ({surveyTypeHints[type].toLowerCase()})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="font-semibold">Columna de la persona evaluada</span>
                  <select
                    value={draft.layout.subjectColumn}
                    onChange={(event) =>
                      setDraft({ ...draft, overrides: {}, layout: { ...draft.layout, subjectColumn: Number(event.target.value) } })
                    }
                    className="ui-control mt-1"
                  >
                    {draft.layout.headers.map((header, column) =>
                      draft.layout.criteria.some((criterion) => criterion.column === column) ? null : (
                        <option key={column} value={column}>
                          {header.trim() || `Columna ${column + 1}`}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <p className="text-xs text-[var(--ink-muted)]">
                  Fuente: {draft.source} · {draft.rows.length - 1} filas
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="text-sm">
                  <p className="font-semibold">Criterios (escala 1 a 5)</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {draft.layout.criteria.map((criterion) => (
                      <span key={criterion.column} className="rounded-full bg-white px-2.5 py-1 text-xs shadow-sm">
                        {criterion.label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 font-semibold">Preguntas abiertas</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {textFields
                      .filter((field) => draft.layout.text[field] !== undefined)
                      .map((field) => textFieldLabels[field])
                      .join(" · ") || "No encontré preguntas abiertas."}
                  </p>
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Solo se guardan la persona evaluada, las calificaciones y los comentarios. Quién respondió no se guarda.
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">Personas evaluadas</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Revisa que cada nombre corresponda a la persona correcta. Quien no tiene usuario aparece igual, solo con la encuesta.
                  </p>
                  <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {draftNames.map((name) => {
                      const resolution = draftResolutions.get(name.key) ?? name.auto;
                      const unrecognized = name.auto.kind !== "user";
                      return (
                        <div key={name.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2">
                          <span className={unrecognized ? "font-semibold text-amber-700" : ""}>
                            {name.raw} <span className="text-xs text-[var(--ink-muted)]">({name.count})</span>
                          </span>
                          <select
                            value={resolutionValue(resolution)}
                            onChange={(event) => setOverride(name.key, name.raw, event.target.value)}
                            className="ui-control py-1 text-sm"
                          >
                            {people.map((person) => (
                              <option key={person.userId} value={`user:${person.userId}`}>
                                {person.fullName}
                              </option>
                            ))}
                            <option value="name">Sin usuario: {name.raw}</option>
                            <option value="skip">No importar</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setDraft(null)} disabled={busy} className="ui-btn ui-btn-secondary ui-btn-sm">
                  Cambiar archivo
                </button>
                <button
                  type="button"
                  onClick={() => void saveImport()}
                  disabled={busy || !draft.surveyType || draftResponses.length === 0}
                  className="ui-btn ui-btn-primary ui-btn-sm"
                >
                  {busy ? "Guardando..." : `Guardar ${draftResponses.length} respuestas`}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {loading ? (
        <p className="px-5 py-6 text-sm text-[var(--ink-muted)]">Cargando tarjetas...</p>
      ) : !card ? (
        <p className="px-5 py-6 text-sm text-[var(--ink-muted)]">No hay personas para este semestre.</p>
      ) : (
        <div className="space-y-5 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedKey(cards[(activeIndex - 1 + cards.length) % cards.length].key)}
              className="ui-btn ui-btn-secondary ui-btn-sm"
              aria-label="Persona anterior"
            >
              ←
            </button>
            <select value={activeKey} onChange={(event) => setSelectedKey(event.target.value)} className="ui-control max-w-xs">
              {cards.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                  {item.surveys.length > 0 ? ` · ${item.surveys.length} encuesta${item.surveys.length > 1 ? "s" : ""}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSelectedKey(cards[(activeIndex + 1) % cards.length].key)}
              className="ui-btn ui-btn-secondary ui-btn-sm"
              aria-label="Persona siguiente"
            >
              →
            </button>
            <span className="text-xs text-[var(--ink-muted)]">
              {activeIndex + 1} de {cards.length}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                <input type="checkbox" checked={includeRanks} onChange={(event) => setIncludeRanks(event.target.checked)} />
                Incluir lugares al exportar
              </label>
              <button type="button" onClick={() => void copyText()} className="ui-btn ui-btn-secondary ui-btn-sm">
                Copiar texto
              </button>
              <button type="button" onClick={() => void downloadPdf(false)} className="ui-btn ui-btn-secondary ui-btn-sm">
                PDF
              </button>
              <button type="button" onClick={() => void downloadPdf(true)} className="ui-btn ui-btn-primary ui-btn-sm">
                PDF de todas ({cards.length})
              </button>
            </div>
          </div>

          <article className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
            <header className="border-b border-[var(--line)] bg-gradient-to-r from-[var(--accent)]/10 to-transparent px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Tarjeta de evaluación</p>
              <h3 className="mt-1 text-2xl font-semibold">{card.name}</h3>
              <p className="text-sm text-[var(--ink-muted)]">
                {[card.roleLabel, `Semestre ${periodLabel}`].filter(Boolean).join(" · ")}
              </p>
            </header>

            <div className="space-y-6 px-5 py-5">
              {card.platform ? <PlatformBlock platform={card.platform} /> : (
                <p className="rounded-lg bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink-muted)]">
                  Sin usuario en el sistema: la tarjeta solo muestra la encuesta.
                </p>
              )}

              {card.surveys.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">Sin respuestas de encuestas en este semestre.</p>
              ) : (
                card.surveys.map((survey) => (
                  <SurveyBlock key={survey.surveyType} survey={survey} onToggle={(comment) => void toggleHidden(comment)} />
                ))
              )}

              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Comentarios de dirección</h4>
                <textarea
                  value={noteDrafts[card.key] ?? ""}
                  onChange={(event) => setNoteDrafts((current) => ({ ...current, [card.key]: event.target.value }))}
                  rows={4}
                  placeholder="Reconocimientos, acuerdos y metas para el siguiente semestre…"
                  className="ui-control mt-2 w-full"
                />
                <div className="mt-2 flex items-center justify-end gap-3">
                  {savedNote && !noteDirty ? (
                    <span className="text-xs text-[var(--ink-muted)]">
                      Guardado {new Date(savedNote.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveNote()}
                    disabled={savingNote || !noteDirty}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                  >
                    {savingNote ? "Guardando..." : "Guardar comentarios"}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function PlatformBlock({ platform }: { platform: NonNullable<CardModel["platform"]> }) {
  const tiles: Array<[string, string, string]> = [
    [
      "Calificación final",
      platform.finalGrade === null ? "—" : fmt(platform.finalGrade),
      platform.finalGrade !== null && platform.gradeMean !== null
        ? `${signed(platform.finalGrade - platform.gradeMean)} vs equipo (${fmt(platform.gradeMean)})`
        : "Sin tareas calificadas",
    ],
    [
      "Puntos obtenidos",
      fmt(platform.points),
      platform.pointsMean !== null && platform.finalGrade !== null
        ? `${platform.pointsMean > 0 ? fmt((platform.points / platform.pointsMean) * 100, 0) : "—"}% de la media del equipo`
        : "",
    ],
    ["Tareas", String(platform.taskCount), `${platform.gradedCount} calificadas`],
    [
      "Entregas",
      `${platform.onTimeCount} a tiempo`,
      `${platform.lateCount} tardías · ${platform.notDeliveredCount} no entregadas`,
    ],
  ];
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Desempeño en la plataforma</h4>
        <span className="text-xs text-[var(--ink-muted)]">
          {platform.profileLabel ? `Perfil: ${platform.profileLabel}` : ""}
          {platform.gradeRank ? ` · Lugar ${platform.gradeRank} en calificación y ${platform.pointsRank} en puntos de ${platform.rankOf}` : ""}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-[var(--line)] px-4 py-3">
            <p className="text-xs text-[var(--ink-muted)]">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            {hint ? <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SurveyBlock({ survey, onToggle }: { survey: SurveyCard; onToggle: (comment: CardComment) => void }) {
  const diff = survey.overall - survey.groupOverall;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
          {surveyTypeLabels[survey.surveyType]}
          <span className="ml-2 font-normal normal-case tracking-normal text-[var(--ink-muted)]">
            {surveyTypeHints[survey.surveyType]} · {survey.n} respuesta{survey.n === 1 ? "" : "s"}
          </span>
        </h4>
        <span className="text-xs text-[var(--ink-muted)]">
          Lugar {survey.rank} de {survey.rankOf} (solo visible aquí)
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-4xl font-semibold tabular-nums">{fmt(survey.overall, 2)}</p>
          <p className="text-xs text-[var(--ink-muted)]">de 5 · equipo {fmt(survey.groupOverall, 2)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            diff >= 0.3 ? "bg-emerald-100 text-emerald-800" : diff <= -0.3 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          {signed(diff)} vs equipo
        </span>
        {survey.smallSample ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Muestra chica</span>
        ) : null}
        {survey.divided ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800" title="Las calificaciones de los evaluadores varían mucho entre sí">
            Opiniones divididas
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {survey.criteria.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate" title={item.label}>
              {item.label}
            </span>
            <div className="relative h-2.5 rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${item.diff <= -0.3 ? "bg-amber-400" : "bg-[var(--accent)]"}`}
                style={{ width: `${(item.mean / 5) * 100}%` }}
              />
              <div
                className="absolute -top-1 h-[18px] w-0.5 bg-slate-700"
                style={{ left: `calc(${(item.groupMean / 5) * 100}% - 1px)` }}
                title={`Equipo: ${fmt(item.groupMean)}`}
              />
            </div>
            <span className="w-24 text-right tabular-nums">
              {fmt(item.mean)}{" "}
              <span className={`text-xs ${item.diff >= 0.3 ? "text-emerald-700" : item.diff <= -0.3 ? "text-red-700" : "text-[var(--ink-muted)]"}`}>
                ({signed(item.diff)})
              </span>
            </span>
          </div>
        ))}
        <p className="text-xs text-[var(--ink-muted)]">La línea oscura marca el promedio del equipo en cada criterio.</p>
      </div>

      {survey.strongest.length || survey.weakest.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {survey.strongest.length ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <p className="font-semibold text-emerald-800">Lo más valorado</p>
              <p className="mt-1 text-emerald-900">{survey.strongest.map((item) => item.label).join(" · ")}</p>
            </div>
          ) : null}
          {survey.weakest.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-800">Áreas de oportunidad</p>
              <p className="mt-1 text-amber-900">{survey.weakest.map((item) => item.label).join(" · ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {textFields.map((field) => (
          <div key={field}>
            <p className="text-sm font-semibold">{textFieldLabels[field]}</p>
            {survey.comments[field].length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Sin comentarios.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {survey.comments[field].map((comment) => (
                  <li
                    key={`${comment.responseId}-${field}`}
                    className={`group rounded-lg border px-3 py-2 text-sm ${
                      comment.hidden ? "border-dashed border-[var(--line)] text-[var(--ink-muted)] line-through" : "border-[var(--line)] bg-[var(--background)]"
                    }`}
                  >
                    <span className="whitespace-pre-line">{comment.text}</span>
                    <button
                      type="button"
                      onClick={() => onToggle(comment)}
                      className="ml-2 text-xs font-semibold text-[var(--accent)] no-underline opacity-70 hover:opacity-100"
                    >
                      {comment.hidden ? "Mostrar" : "Ocultar"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        Los comentarios ocultos no salen en el PDF ni en el texto. Úsalo si un comentario permite identificar a quien lo escribió.
      </p>
    </div>
  );
}

