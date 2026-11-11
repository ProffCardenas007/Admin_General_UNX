"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../../lib/api";
import { extractErrorMessage } from "../../../lib/http";
import {
  columnProgress,
  sectionProgress,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_STYLES,
  type CellStatus,
  type LinkedTaskStatus,
  type PlanCell,
  type PlanDetail,
  type PlanRow,
  type PlanSection,
} from "../types";
import { statusLabels as taskStatusLabels } from "../../tasks/labels";
import { taskDueSemaforo, toDateKey } from "../../tasks/taskLogic";

type Editing = {
  section: PlanSection;
  row: PlanRow;
  columnId: string | null;
  columnLabel: string;
  cell?: PlanCell;
};

type CellSelection = {
  section: PlanSection;
  row: PlanRow;
  startIndex: number;
  endIndex: number;
};

type UserOption = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
  isActive: boolean;
};

type ProjectOption = {
  id: string;
  code: string;
  name: string;
};

type TaskActivityType =
  | "revision"
  | "edicion"
  | "creacion"
  | "presentaciones"
  | "grabacion"
  | "plataforma"
  | "administrativo";

type TaskPriority = "low" | "medium" | "high" | "urgent";

const AVAILABLE_TASK = "__available__";

const activityTypeOptions: Array<{ value: TaskActivityType; label: string }> = [
  { value: "creacion", label: "Creación" },
  { value: "revision", label: "Revisión" },
  { value: "edicion", label: "Edición" },
  { value: "presentaciones", label: "Presentaciones" },
  { value: "grabacion", label: "Grabación" },
  { value: "plataforma", label: "Plataforma" },
  { value: "administrativo", label: "Administrativo" },
];

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const roleLabels: Record<UserOption["role"], string> = {
  manager: "Gerencia",
  lead: "Líder",
  worker: "Colaborador",
};

const taskStatusDots: Record<LinkedTaskStatus, string> = {
  todo: "bg-slate-400",
  doing: "bg-sky-500",
  paused: "bg-amber-500",
  blocked: "bg-red-500",
  done: "bg-emerald-500",
};

function inferActivityType(editing: Editing): TaskActivityType {
  const label = `${editing.section.title} ${editing.row.label}`.toLowerCase();
  if (label.includes("revisi")) return "revision";
  if (label.includes("correcci") || label.includes("edici")) return "edicion";
  if (label.includes("presentaci")) return "presentaciones";
  if (label.includes("graba")) return "grabacion";
  if (label.includes("plataforma") || label.includes("kajabi")) return "plataforma";
  return "creacion";
}

function InlineText({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (!editing) {
    return (
      <button
        type="button"
        title="Clic para renombrar"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`text-left hover:underline ${className}`}
      >
        {value}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      maxLength={160}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-full rounded border border-[var(--accent)] bg-white px-1 py-0.5 text-[var(--foreground)]"
    />
  );
}

function CellModal({
  editing,
  users,
  planHasProject,
  onClose,
  onSave,
  onMerge,
  onCreateTask,
}: {
  editing: Editing;
  users: UserOption[];
  planHasProject: boolean;
  onClose: () => void;
  onSave: (patch: Partial<PlanCell>) => Promise<void>;
  onMerge: (columnSpan: number) => Promise<void>;
  onCreateTask: (input: {
    assigneeId?: string;
    activityType: TaskActivityType;
    title: string;
    description: string;
    priority: TaskPriority;
    dueDate: string;
    estimatedHours: number;
    startDate: string | null;
    endDate: string | null;
    note: string | null;
  }) => Promise<void>;
}) {
  const { cell } = editing;
  const [status, setStatus] = useState<CellStatus>(cell?.status ?? "unassigned");
  const [startDate, setStartDate] = useState(cell?.startDate?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(cell?.endDate?.slice(0, 10) ?? "");
  const [note, setNote] = useState(cell?.note ?? "");
  const [plannedAssigneeId, setPlannedAssigneeId] = useState(
    () => users.find((user) => user.fullName === cell?.suggestedAssignee)?.id ?? "",
  );
  const [assignment, setAssignment] = useState("");
  const [activityType, setActivityType] = useState<TaskActivityType>(() => inferActivityType(editing));
  const [taskTitle, setTaskTitle] = useState(`${editing.row.label} - ${editing.columnLabel}`);
  const [taskDescription, setTaskDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState(cell?.endDate?.slice(0, 10) ?? "");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = Boolean(cell?.taskId);
  const columnSpan = cell?.columnSpan ?? 1;
  const createsTask = !locked && status === "assigned";
  const taskDue = cell?.taskStatus
    ? taskDueSemaforo(
        {
          status: cell.taskStatus,
          dueDate: cell.taskDueDate ?? undefined,
          completionOutcome: cell.taskCompletionOutcome,
        },
        toDateKey(new Date()),
      )
    : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    if (createsTask) {
      await onCreateTask({
        assigneeId: assignment === AVAILABLE_TASK ? undefined : assignment,
        activityType,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        priority,
        dueDate,
        estimatedHours: Number(estimatedHours),
        startDate: startDate || null,
        endDate: endDate || null,
        note: note || null,
      });
    } else {
      const suggestedAssignee =
        status === "unassigned" || status === "assigned"
          ? users.find((user) => user.id === plannedAssigneeId)?.fullName ?? null
          : null;
      await onSave({
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        suggestedAssignee,
        note: note || null,
      });
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className={`glass-panel flex max-h-[calc(100dvh-1rem)] w-full flex-col gap-4 overflow-y-auto bg-white p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-6 ${
          createsTask ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--ink-muted)]">
            {editing.section.title} · {editing.columnLabel}
          </p>
          <h2 className="break-words text-xl font-semibold tracking-tight">{editing.row.label}</h2>
        </div>

        <div>
          <p className="mb-2 text-sm">Estado</p>
          {cell?.taskStatus ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${taskStatusDots[cell.taskStatus]}`} />
                {taskStatusLabels[cell.taskStatus] ?? cell.taskStatus}
              </span>
              {taskDue && (
                <span className={`inline-flex items-center gap-2 text-sm font-semibold ${taskDue.textClass}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${taskDue.dotClass}`} />
                  {taskDue.label}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s);
                    if (s === "assigned") {
                      setAssignment(plannedAssigneeId || AVAILABLE_TASK);
                    }
                  }}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                    status === s ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--line)]"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
          {locked && (
            <p className="mt-2 text-xs text-[var(--ink-muted)]">Ya tiene tarea asignada; el estado lo controla la tarea.</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Inicio
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-[var(--line)] px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Fin
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-[var(--line)] px-3 py-2"
            />
          </label>
        </div>

        {!locked && (status === "unassigned" || status === "assigned") && (
          <label className="flex flex-col gap-1 text-sm">
            Persona prevista
            <select
              value={plannedAssigneeId}
              onChange={(event) => {
                setPlannedAssigneeId(event.target.value);
                if (status === "assigned") {
                  setAssignment(event.target.value || AVAILABLE_TASK);
                }
              }}
              required={status === "assigned"}
              className="min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2"
            >
              <option value="">Selecciona la persona pensada para esta tarea</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} ({roleLabels[user.role]})
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--ink-muted)]">
              {status === "assigned"
                ? "Esta persona será responsable de la tarea."
                : "Puedes registrar a la persona contemplada; todavía no se crea ni asigna una tarea."}
            </span>
          </label>
        )}

        {!locked && !planHasProject && (
          <span className="text-xs text-[var(--danger)]">
            Vincula este plan con un proyecto para poder crear tareas.
          </span>
        )}

        {createsTask && (
          <div className="grid gap-3 rounded-xl border border-[var(--accent)]/30 bg-sky-50/50 p-4">
            <p className="text-sm font-semibold">
              Crear tarea
            </p>
            <label className="flex flex-col gap-1 text-sm">
              Responsable
              <select
                value={assignment}
                onChange={(event) => setAssignment(event.target.value)}
                required
                className="min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              >
                <option value={AVAILABLE_TASK}>Tarea disponible (sin responsable)</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({roleLabels[user.role]})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Actividad
              <select
                value={activityType}
                onChange={(event) => setActivityType(event.target.value as TaskActivityType)}
                required
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              >
                {activityTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Título de la tarea
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                maxLength={220}
                required
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Descripción
              <textarea
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                rows={3}
                maxLength={4000}
                required
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                Prioridad
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  required
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Fecha límite
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  required
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Horas estimadas
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={estimatedHours}
                  onChange={(event) => setEstimatedHours(event.target.value)}
                  required
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
                />
              </label>
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Nota
          <textarea
            value={note}
            rows={3}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-lg border border-[var(--line)] px-3 py-2"
          />
        </label>

        {editing.columnId && columnSpan > 1 && (
          <div className="rounded-lg border border-[var(--line)] bg-slate-50 p-3">
            <p className="text-sm font-medium">Combinar celdas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || locked}
                onClick={async () => {
                  setSaving(true);
                  await onMerge(1);
                  setSaving(false);
                }}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Separar celdas
              </button>
            </div>
          </div>
        )}

        <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-white p-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PlanGridPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newSection, setNewSection] = useState("");
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const dragRangeRef = useRef<{ rowId: string; startIndex: number; endIndex: number } | null>(null);

  const base = `${API_URL}/work-plans`;

  const load = useCallback(async () => {
    try {
      const headers = authHeaders();
      const [planResponse, usersResponse, projectsResponse] = await Promise.all([
        axios.get<PlanDetail>(`${base}/${id}`, { headers }),
        axios.get<UserOption[]>(`${API_URL}/users`, { headers }),
        axios.get<ProjectOption[]>(`${API_URL}/projects`, { headers }),
      ]);
      setPlan(planResponse.data);
      setUsers(usersResponse.data.filter((user) => user.isActive));
      setProjects(projectsResponse.data);
      if (!planResponse.data.projectId) {
        const matchingProjects = projectsResponse.data.filter(
          (project) => project.name.trim().toLowerCase() === planResponse.data.name.trim().toLowerCase(),
        );
        setSelectedProjectId((current) => current || (matchingProjects.length === 1 ? matchingProjects[0].id : ""));
      }
      setError("");
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo cargar el plan"));
    }
  }, [base, id]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    if (getStoredRole() === "worker") {
      router.replace("/tasks");
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    const stopSelecting = () => setSelecting(false);
    window.addEventListener("pointerup", stopSelecting);
    return () => window.removeEventListener("pointerup", stopSelecting);
  }, []);

  // Ejecuta una mutación y recarga el plan completo.
  const mutate = async (request: () => Promise<unknown>, fallback: string) => {
    try {
      await request();
      await load();
    } catch (caught) {
      setError(extractErrorMessage(caught, fallback));
    }
  };

  const confirmDelete = (message: string, url: string) => {
    if (window.confirm(message)) void mutate(() => axios.delete(url, { headers: authHeaders() }), "No se pudo eliminar");
  };

  const rename = (url: string, field: "label" | "title" | "name", value: string) =>
    mutate(() => axios.patch(url, { [field]: value }, { headers: authHeaders() }), "No se pudo renombrar");

  const bulkTargets = () => {
    if (!plan) return [];
    const selectedRows = plan.sections.flatMap((section) =>
      section.rows
        .filter((row) => selectedRowIds.includes(row.id))
        .map((row) => ({ section, row })),
    );
    return selectedRows.flatMap(({ section, row }) =>
      section.spansAll
        ? [{ rowId: row.id }]
        : selectedColumnIds.map((columnId) => ({ rowId: row.id, columnId })),
    );
  };

  const saveCell = async (patch: Partial<PlanCell>) => {
    if (!editing) return;
    try {
      if (bulkEditing) {
        await axios.put(
          `${base}/cells/bulk`,
          { targets: bulkTargets(), ...patch },
          { headers: authHeaders() },
        );
      } else {
        await axios.put(
          `${base}/cells`,
          { rowId: editing.row.id, columnId: editing.columnId ?? undefined, ...patch },
          { headers: authHeaders() },
        );
      }
      setEditing(null);
      setBulkEditing(false);
      if (bulkEditing) {
        setSelectedRowIds([]);
        setSelectedColumnIds([]);
      }
      await load();
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo guardar la celda"));
    }
  };

  const mergeCell = async (columnSpan: number) => {
    if (!editing?.columnId) return;
    try {
      await axios.put(
        `${base}/cells/merge`,
        { rowId: editing.row.id, columnId: editing.columnId, columnSpan },
        { headers: authHeaders() },
      );
      setEditing(null);
      await load();
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudieron combinar las celdas"));
    }
  };

  const createCellTask = async (input: {
    assigneeId?: string;
    activityType: TaskActivityType;
    title: string;
    description: string;
    priority: TaskPriority;
    dueDate: string;
    estimatedHours: number;
    startDate: string | null;
    endDate: string | null;
    note: string | null;
  }) => {
    if (!editing) return;
    try {
      if (bulkEditing) {
        await axios.post(
          `${base}/cells/tasks`,
          { targets: bulkTargets(), ...input },
          { headers: authHeaders() },
        );
      } else {
        await axios.post(
          `${base}/cells/task`,
          {
            rowId: editing.row.id,
            columnId: editing.columnId ?? undefined,
            ...input,
          },
          { headers: authHeaders() },
        );
      }
      setEditing(null);
      setBulkEditing(false);
      if (bulkEditing) {
        setSelectedRowIds([]);
        setSelectedColumnIds([]);
      }
      await load();
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo crear la tarea"));
    }
  };

  const mergeSelection = async (columnSpan?: number) => {
    if (!selection || !plan) return;
    const startIndex = Math.min(selection.startIndex, selection.endIndex);
    const endIndex = Math.max(selection.startIndex, selection.endIndex);
    const column = plan.columns[startIndex];
    if (!column || endIndex <= startIndex) return;

    try {
      await axios.put(
        `${base}/cells/merge`,
        {
          rowId: selection.row.id,
          columnId: column.id,
          columnSpan: columnSpan ?? endIndex - startIndex + 1,
        },
        { headers: authHeaders() },
      );
      setSelection(null);
      await load();
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudieron combinar las celdas seleccionadas"));
    }
  };

  const findCell = (row: PlanRow, columnId: string | null) =>
    row.cells.find((c) => (c.columnId ?? null) === columnId);

  const renderCell = (
    section: PlanSection,
    row: PlanRow,
    columnId: string | null,
    columnLabel: string,
    columnIndex: number,
    columnSpan: number,
  ) => {
    const cell = findCell(row, columnId);
    const status = cell?.status ?? "unassigned";
    const taskDue = cell?.taskStatus
      ? taskDueSemaforo(
          {
            status: cell.taskStatus,
            dueDate: cell.taskDueDate ?? undefined,
            completionOutcome: cell.taskCompletionOutcome,
          },
          toDateKey(new Date()),
        )
      : null;
    const statusLabel = cell?.taskStatus
      ? taskStatusLabels[cell.taskStatus] ?? cell.taskStatus
      : STATUS_LABELS[status];
    const hasInfo = Boolean(cell?.note || cell?.suggestedAssignee || cell?.startDate || cell?.endDate);
    const dates = [cell?.startDate, cell?.endDate].filter(Boolean).map((d) => String(d).slice(5, 10).replace("-", "/"));
    const selectionStart = selection ? Math.min(selection.startIndex, selection.endIndex) : -1;
    const selectionEnd = selection ? Math.max(selection.startIndex, selection.endIndex) : -1;
    const selected =
      columnIndex >= 0 &&
      selection?.row.id === row.id &&
      columnIndex <= selectionEnd &&
      columnIndex + columnSpan - 1 >= selectionStart;
    const bulkSelected =
      selectedRowIds.includes(row.id) &&
      (section.spansAll ||
        (columnId !== null && selectedColumnIds.includes(columnId)));

    return (
      <button
        type="button"
        onPointerDown={(event) => {
          if (columnIndex < 0 || event.button !== 0) return;
          dragRangeRef.current = {
            rowId: row.id,
            startIndex: columnIndex,
            endIndex: columnIndex + columnSpan - 1,
          };
          setSelection({ section, row, startIndex: columnIndex, endIndex: columnIndex + columnSpan - 1 });
          setSelecting(true);
        }}
        onPointerEnter={() => {
          if (!selecting || !selection || selection.row.id !== row.id || columnIndex < 0) return;
          const nextEndIndex = columnIndex + columnSpan - 1;
          if (nextEndIndex === selection.endIndex) return;
          if (dragRangeRef.current) {
            dragRangeRef.current.endIndex = nextEndIndex;
          }
          setSelection((current) =>
            current
              ? { ...current, endIndex: nextEndIndex }
              : current,
          );
        }}
        onPointerUp={() => {
          const dragRange = dragRangeRef.current;
          const selectionStart = dragRange
            ? Math.min(dragRange.startIndex, dragRange.endIndex)
            : columnIndex;
          const selectionEnd = dragRange
            ? Math.max(dragRange.startIndex, dragRange.endIndex)
            : columnIndex + columnSpan - 1;
          setSelecting(false);
          if (
            dragRange?.rowId === row.id &&
            (selectionStart !== columnIndex || selectionEnd !== columnIndex + columnSpan - 1)
          ) {
            return;
          }
          dragRangeRef.current = null;
          setSelection(null);
          setEditing({ section, row, columnId, columnLabel, cell });
        }}
        title={`${statusLabel}${taskDue ? ` · ${taskDue.label}` : ""}${cell?.suggestedAssignee ? ` · ${cell.suggestedAssignee}` : ""}${cell?.note ? ` · ${cell.note}` : ""}`}
        className={`flex h-full min-h-[34px] w-full touch-none select-none flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] leading-tight transition-colors ${
          selected || bulkSelected ? "bg-blue-200 ring-2 ring-inset ring-blue-600" : STATUS_STYLES[status].cell
        }`}
      >
        {(status !== "unassigned" || taskDue) && (
          <span className={`h-2 w-2 rounded-full ${taskDue?.dotClass ?? STATUS_STYLES[status].dot}`} />
        )}
        {dates.length > 0 && <span className="font-mono">{dates.join("–")}</span>}
        {cell?.suggestedAssignee && <span className="max-w-full truncate">{cell.suggestedAssignee}</span>}
        {hasInfo && !dates.length && !cell?.suggestedAssignee && <span>•</span>}
      </button>
    );
  };

  if (!plan) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-8">
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : <p className="text-sm">Cargando…</p>}
        <Link href="/planning" className="mt-4 inline-block text-sm underline">
          Volver a planes
        </Link>
      </main>
    );
  }

  const colCount = plan.columns.length;
  const selectionStartIndex = selection
    ? Math.min(selection.startIndex, selection.endIndex)
    : -1;
  const selectionEndIndex = selection
    ? Math.max(selection.startIndex, selection.endIndex)
    : -1;
  const selectedAnchor =
    selection && selectionStartIndex >= 0
      ? selection.row.cells.find(
          (cell) => cell.columnId === plan.columns[selectionStartIndex]?.id,
        )
      : undefined;
  const selectionIsMergedCell =
    Boolean(selectedAnchor && selectedAnchor.columnSpan > 1) &&
    selectedAnchor?.columnSpan === selectionEndIndex - selectionStartIndex + 1;
  const allRows = plan.sections.flatMap((section) => section.rows);
  const allRowsSelected =
    allRows.length > 0 && selectedRowIds.length === allRows.length;
  const allColumnsSelected =
    plan.columns.length > 0 &&
    selectedColumnIds.length === plan.columns.length;
  const bulkTargetCount = plan.sections.reduce(
    (total, section) =>
      total +
      section.rows.filter((row) => selectedRowIds.includes(row.id)).length *
        (section.spansAll ? 1 : selectedColumnIds.length),
    0,
  );
  const openBulkEditor = () => {
    const selected = plan.sections
      .flatMap((section) =>
        section.rows.map((row) => ({ section, row })),
      )
      .find(({ row }) => selectedRowIds.includes(row.id));
    if (!selected || selectedColumnIds.length === 0) return;
    const column = selected.section.spansAll
      ? null
      : plan.columns.find((item) => item.id === selectedColumnIds[0]) ?? null;
    setBulkEditing(true);
    setEditing({
      section: selected.section,
      row: selected.row,
      columnId: column?.id ?? null,
      columnLabel: `${bulkTargetCount} celdas seleccionadas`,
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6">
        <Link href="/planning" className="text-sm text-[var(--ink-muted)] hover:underline">
          ← Planes de trabajo
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <InlineText
              value={plan.name}
              onSave={(v) => rename(`${base}/${plan.id}`, "name", v)}
              className="text-3xl font-semibold tracking-tight"
            />
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-emerald-500" style={{ width: `${plan.progress.percent}%` }} />
              </div>
              <span className="font-mono text-xs text-[var(--ink-muted)]">
                {plan.progress.percent}% · {plan.progress.done}/{plan.progress.total} listas
              </span>
            </div>
          </div>
          <ul className="flex flex-wrap gap-3 text-xs">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                {STATUS_LABELS[s]}
              </li>
            ))}
          </ul>
        </div>
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        {!plan.projectId && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-sm">
              Proyecto para este plan
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              >
                <option value="">Selecciona un proyecto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedProjectId}
              onClick={() =>
                void mutate(
                  () =>
                    axios.patch(
                      `${base}/${plan.id}`,
                      { projectId: selectedProjectId },
                      { headers: authHeaders() },
                    ),
                  "No se pudo vincular el proyecto",
                )
              }
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Vincular proyecto
            </button>
            <p className="w-full text-xs text-amber-800">
              Este plan fue creado antes de la vinculación automática. Debes elegir su proyecto para crear tareas.
            </p>
          </div>
        )}
      </section>

      {selection && Math.abs(selection.endIndex - selection.startIndex) >= 1 && (
        <section className="glass-panel fade-up flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">
              {Math.abs(selection.endIndex - selection.startIndex) + 1} celdas seleccionadas
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
              {selection.row.label}: arrastra nuevamente para cambiar la selección.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void mergeSelection(selectionIsMergedCell ? 1 : undefined)}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              {selectionIsMergedCell ? "Separar celdas" : "Combinar celdas"}
            </button>
          </div>
        </section>
      )}

      {selectedRowIds.length > 0 || selectedColumnIds.length > 0 ? (
        <section className="glass-panel fade-up flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">Edición masiva</p>
            <p className="text-xs text-[var(--ink-muted)]">
              {selectedRowIds.length} fila(s) × {selectedColumnIds.length} columna(s) · {bulkTargetCount} celda(s)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedRowIds([]);
                setSelectedColumnIds([]);
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              Limpiar selección
            </button>
            <button
              type="button"
              disabled={bulkTargetCount === 0 || selectedColumnIds.length === 0}
              onClick={openBulkEditor}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Editar selección
            </button>
          </div>
        </section>
      ) : null}

      <section className="glass-panel fade-up overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#0b4f6c] text-white">
              <th className="sticky left-0 z-10 min-w-[220px] bg-[#0b4f6c] px-3 py-2 text-left font-medium">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allRowsSelected}
                    onChange={(event) =>
                      setSelectedRowIds(
                        event.target.checked ? allRows.map((row) => row.id) : [],
                      )
                    }
                  />
                  Etapa
                </label>
              </th>
              {plan.columns.map((col) => (
                <th key={col.id} className="group min-w-[96px] border-l border-white/30 px-2 py-2 font-medium">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar columna ${col.label}`}
                      checked={selectedColumnIds.includes(col.id)}
                      onChange={(event) =>
                        setSelectedColumnIds((current) =>
                          event.target.checked
                            ? [...current, col.id]
                            : current.filter((id) => id !== col.id),
                        )
                      }
                    />
                    <InlineText value={col.label} onSave={(v) => rename(`${base}/columns/${col.id}`, "label", v)} />
                    <button
                      type="button"
                      aria-label={`Eliminar ${col.label}`}
                      onClick={() =>
                        confirmDelete(`¿Eliminar la columna "${col.label}" con sus celdas?`, `${base}/columns/${col.id}`)
                      }
                      className="opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full bg-emerald-300" style={{ width: `${columnProgress(plan, col.id).percent}%` }} />
                  </div>
                </th>
              ))}
              <th className="min-w-[70px] border-l border-white/30 px-2 py-2">
                <label className="mb-1 flex cursor-pointer items-center justify-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las columnas"
                    checked={allColumnsSelected}
                    onChange={(event) =>
                      setSelectedColumnIds(
                        event.target.checked
                          ? plan.columns.map((column) => column.id)
                          : [],
                      )
                    }
                  />
                  Todas
                </label>
                <button
                  type="button"
                  onClick={() =>
                    mutate(
                      () =>
                        axios.post(`${base}/${plan.id}/columns`, { label: `Tema ${colCount + 1}` }, { headers: authHeaders() }),
                      "No se pudo agregar la columna",
                    )
                  }
                  className="rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25"
                >
                  + Tema
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.sections.map((section) => {
              const sp = sectionProgress(section, colCount);
              return (
                <SectionRows
                  key={section.id}
                  section={section}
                  colCount={colCount}
                  percent={sp.percent}
                  columns={plan.columns}
                  renderCell={renderCell}
                  onRenameSection={(v) => rename(`${base}/sections/${section.id}`, "title", v)}
                  onDeleteSection={() =>
                    confirmDelete(`¿Eliminar la sección "${section.title}" y sus filas?`, `${base}/sections/${section.id}`)
                  }
                  onRenameRow={(rowId, v) => rename(`${base}/rows/${rowId}`, "label", v)}
                  onDeleteRow={(row) => confirmDelete(`¿Eliminar la fila "${row.label}"?`, `${base}/rows/${row.id}`)}
                  onAddRow={() =>
                    mutate(
                      () => axios.post(`${base}/sections/${section.id}/rows`, { label: "Nueva etapa" }, { headers: authHeaders() }),
                      "No se pudo agregar la fila",
                    )
                  }
                  selectedRowIds={selectedRowIds}
                  onToggleRow={(rowId, selected) =>
                    setSelectedRowIds((current) =>
                      selected
                        ? [...current, rowId]
                        : current.filter((id) => id !== rowId),
                    )
                  }
                />
              );
            })}
          </tbody>
        </table>
      </section>

      <form
        className="glass-panel flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const title = newSection.trim();
          if (!title) return;
          void mutate(async () => {
            await axios.post(`${base}/${plan.id}/sections`, { title }, { headers: authHeaders() });
            setNewSection("");
          }, "No se pudo agregar la sección");
        }}
      >
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
          Nueva sección
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Ej. Grabación"
            maxLength={160}
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={!newSection.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Agregar sección
        </button>
      </form>

      {editing && (
        <CellModal
          editing={editing}
          users={users}
          planHasProject={Boolean(plan.projectId)}
          onClose={() => {
            setEditing(null);
            setBulkEditing(false);
          }}
          onSave={saveCell}
          onMerge={mergeCell}
          onCreateTask={createCellTask}
        />
      )}
    </main>
  );
}

function SectionRows({
  section,
  colCount,
  percent,
  columns,
  renderCell,
  onRenameSection,
  onDeleteSection,
  onRenameRow,
  onDeleteRow,
  onAddRow,
  selectedRowIds,
  onToggleRow,
}: {
  section: PlanSection;
  colCount: number;
  percent: number;
  columns: PlanDetail["columns"];
  renderCell: (
    section: PlanSection,
    row: PlanRow,
    columnId: string | null,
    columnLabel: string,
    columnIndex: number,
    columnSpan: number,
  ) => React.ReactNode;
  onRenameSection: (value: string) => void;
  onDeleteSection: () => void;
  onRenameRow: (rowId: string, value: string) => void;
  onDeleteRow: (row: PlanRow) => void;
  onAddRow: () => void;
  selectedRowIds: string[];
  onToggleRow: (rowId: string, selected: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-[#0b4f6c]/90 text-white">
        <td colSpan={colCount + 2} className="px-3 py-1.5">
          <div className="flex items-center gap-3">
            <InlineText value={section.title} onSave={onRenameSection} className="font-semibold" />
            <span className="font-mono text-xs opacity-80">{percent}%</span>
            <button type="button" onClick={onAddRow} className="rounded bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25">
              + Fila
            </button>
            <button type="button" onClick={onDeleteSection} className="ml-auto text-xs opacity-80 hover:opacity-100">
              Eliminar sección
            </button>
          </div>
        </td>
      </tr>
      {section.rows.map((row) => (
        <tr key={row.id} className="group border-b border-[var(--line)]">
          <td className="sticky left-0 z-10 bg-sky-100 px-3 py-1 font-medium text-[#0b4f6c]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Seleccionar fila ${row.label}`}
                  checked={selectedRowIds.includes(row.id)}
                  onChange={(event) => onToggleRow(row.id, event.target.checked)}
                />
                <InlineText value={row.label} onSave={(v) => onRenameRow(row.id, v)} />
              </div>
              <button
                type="button"
                aria-label={`Eliminar ${row.label}`}
                onClick={() => onDeleteRow(row)}
                className="opacity-0 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          </td>
          {section.spansAll ? (
            <td colSpan={colCount + 1} className="border-l border-[var(--line)] p-0">
              {renderCell(section, row, null, "Toda la fila", -1, 1)}
            </td>
          ) : (
            <>
              {columns.map((col, columnIndex) => {
                const coveringCell = row.cells.find((cell) => {
                  if (!cell.columnId || cell.columnSpan <= 1) return false;
                  const startIndex = columns.findIndex((item) => item.id === cell.columnId);
                  return startIndex >= 0 && startIndex < columnIndex && startIndex + cell.columnSpan > columnIndex;
                });
                if (coveringCell) return null;

                const cell = row.cells.find((item) => item.columnId === col.id);
                const columnSpan = Math.min(cell?.columnSpan ?? 1, columns.length - columnIndex);
                const endColumn = columns[columnIndex + columnSpan - 1];
                const columnLabel =
                  columnSpan > 1 ? `${col.label} – ${endColumn.label}` : col.label;

                return (
                  <td key={col.id} colSpan={columnSpan} className="border-l border-[var(--line)] p-0">
                    {renderCell(
                      section,
                      row,
                      col.id,
                      columnLabel,
                      columnIndex,
                      columnSpan,
                    )}
                  </td>
                );
              })}
              <td className="border-l border-[var(--line)] bg-slate-50" />
            </>
          )}
        </tr>
      ))}
    </>
  );
}
