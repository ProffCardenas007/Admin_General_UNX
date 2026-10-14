"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import { LEAD_SPECIALTIES, specialtyLabels, type LeadSpecialty } from "../../lib/specialties";
import ConsequenceModal from "./ConsequenceModal";
import EditTaskModal from "./EditTaskModal";
import ExtensionRequestModal from "./ExtensionRequestModal";
import FloatingTimerWidget from "./FloatingTimerWidget";
import NotCompletedModal from "./NotCompletedModal";
import { UNASSIGNED_SENTINEL, activityTypeLabels, priorityLabels, roleLabels, statusLabels } from "./labels";
import {
  buildDisplayTasks,
  buildWorkerTimeline,
  computeWorkerKpis,
  countPeopleWithTasks,
  dueSemaforo,
  filterActiveProjects,
  filterTasks,
  getQuincenaRange,
  groupConsequentTasks,
  listAvailableAcademies,
  peopleForProject,
  pickPriorityTasks,
  toDateKey,
} from "./taskLogic";
import { formatActiveDuration as formatDuration } from "./timer";
import type { HalfMonth, ProjectRow, TaskDraft, TaskRow, TaskUpdateRow, UserRow } from "./types";

export default function TasksPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [extensionTask, setExtensionTask] = useState<TaskRow | null>(null);
  const [savingTaskId, setSavingTaskId] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [loadingHistoryTaskId, setLoadingHistoryTaskId] = useState("");
  const [openedHistoryTaskId, setOpenedHistoryTaskId] = useState("");
  const [openedTrackingTaskId, setOpenedTrackingTaskId] = useState("");
  const [openedDescriptionTaskId, setOpenedDescriptionTaskId] = useState("");
  const [openedConsequenceTaskId, setOpenedConsequenceTaskId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [openedNotCompletedTaskId, setOpenedNotCompletedTaskId] = useState("");
  const [centerNoticeMessage, setCenterNoticeMessage] = useState("");
  const showCodeAndAssigneeColumns = role !== "worker";
  const isWorker = role === "worker";
  const canManagePlanning = role === "manager" || role === "lead";
  const [historyByTask, setHistoryByTask] = useState<Record<string, TaskUpdateRow[]>>({});
  const [historyYearMonth, setHistoryYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [historyHalfMonth, setHistoryHalfMonth] = useState<HalfMonth>(() =>
    new Date().getDate() <= 15 ? "first" : "second",
  );
  const historyQuincenaRange = useMemo(
    () => getQuincenaRange(historyYearMonth, historyHalfMonth),
    [historyYearMonth, historyHalfMonth],
  );
  // Applied filter is separate from the month/quincena picker above: it stays
  // empty (full history) until the user explicitly presses "Aplicar filtro",
  // so opening a task's history never hides updates outside the current quincena.
  const [appliedHistoryFrom, setAppliedHistoryFrom] = useState("");
  const [appliedHistoryTo, setAppliedHistoryTo] = useState("");

  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<"" | LeadSpecialty>("");
  const [selectedAcademy, setSelectedAcademy] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [activityYearMonth, setActivityYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [activityHalfMonth, setActivityHalfMonth] = useState<HalfMonth>(() =>
    new Date().getDate() <= 15 ? "first" : "second",
  );
  const [showAllActivityQuincenas, setShowAllActivityQuincenas] = useState(false);
  const activityQuincenaRange = useMemo(
    () => getQuincenaRange(activityYearMonth, activityHalfMonth),
    [activityHalfMonth, activityYearMonth],
  );
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [exportingActivity, setExportingActivity] = useState(false);
  const [exportError, setExportError] = useState("");
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [floatingTimers, setFloatingTimers] = useState<
    Record<string, { x: number; y: number; minimized: boolean }>
  >({});
  const [dismissedFloatingTimerIds, setDismissedFloatingTimerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [floatingTimerBasePos, setFloatingTimerBasePos] = useState(() => {
    if (typeof window === "undefined") {
      return { x: 24, y: 24 };
    }
    try {
      const raw = window.localStorage.getItem("tasksFloatingTimerPos");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed as { x: number; y: number };
        }
      }
    } catch {
      // ignore malformed/unavailable localStorage
    }
    return { x: 24, y: 24 };
  });
  const [widgetTick, setWidgetTick] = useState(() => Date.now());
  const dragStateRef = useRef<{
    taskId: string;
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const getNextFloatingTimerPosition = (existingCount: number) => {
    const cascade = existingCount * 32;
    const maxX = typeof window === "undefined" ? 9999 : Math.max(0, window.innerWidth - 48);
    const maxY = typeof window === "undefined" ? 9999 : Math.max(0, window.innerHeight - 48);
    return {
      x: Math.min(floatingTimerBasePos.x + cascade, maxX),
      y: Math.min(floatingTimerBasePos.y + cascade, maxY),
    };
  };

  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});

  const loadData = async (currentRole: string) => {
    try {
      setLoading(true);
      const headers = authHeaders();

      const [projectsResult, usersResult] = await Promise.allSettled([
        axios.get(`${API_URL}/projects`, { headers }),
        axios.get(`${API_URL}/users`, { headers }),
      ]);

      let loadedTasks: TaskRow[] = [];
      if (currentRole === "lead") {
        const [myTasksResponse, assignedTasksResponse] = await Promise.all([
          axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } }),
          axios.get(`${API_URL}/tasks`, { headers, params: { scope: "assigned" } }),
        ]);

        const deduped = new Map<string, TaskRow>();
        [...(myTasksResponse.data as TaskRow[]), ...(assignedTasksResponse.data as TaskRow[])].forEach((task) => {
          deduped.set(task.id, task);
        });
        loadedTasks = [...deduped.values()];
      } else if (currentRole === "worker") {
        const myTasksResponse = await axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } });
        loadedTasks = myTasksResponse.data as TaskRow[];
      } else {
        const tasksResponse = await axios.get(`${API_URL}/tasks`, { headers });
        loadedTasks = tasksResponse.data as TaskRow[];
      }

      setTasks(loadedTasks);
      setTaskDrafts(
        Object.fromEntries(
          loadedTasks.map((task) => [
            task.id,
            {
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId ?? "",
              description: task.description ?? "",
              dueDate: task.dueDate ?? "",
              estimatedHours: task.estimatedHours ?? "",
              handoffToUserId: "",
              handoffTitle: "",
              handoffMessage: "",
              nextActivityType: task.activityType,
              nextDueDate: task.dueDate ?? "",
              nextEstimatedHours: task.estimatedHours ?? "",
            },
          ]),
        ),
      );

      if (projectsResult.status === "fulfilled") {
        setProjects(projectsResult.value.data as ProjectRow[]);
      }

      if (usersResult.status === "fulfilled") {
        setUsers(usersResult.value.data as UserRow[]);
      }
    } catch {
      setError("No se pudo cargar la vista de tareas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const currentRole = getStoredRole();
    const currentUser = getStoredUserId();

    setEmail(getStoredEmail());
    setRole(currentRole);
    setCurrentUserId(currentUser);

  }, [router]);

  useEffect(() => {
    if (!role) {
      return;
    }

    void loadData(role);
  }, [role, currentUserId]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const projectIdFromQuery = query.get("projectId") ?? "";
    const showDoneFromQuery = query.get("showDone") === "1";
    const assigneeIdFromQuery = query.get("assigneeId") ?? "";

    if (projectIdFromQuery.length > 0) {
      setSelectedProjectId(projectIdFromQuery);
    }

    if (showDoneFromQuery) {
      setShowDoneTasks(true);
    }

    if (assigneeIdFromQuery.length > 0) {
      setSelectedAssigneeId(assigneeIdFromQuery);
    }
  }, []);

  useEffect(() => {
    const hasRunningTimer = tasks.some((task) => !!task.timerStartedAt);
    if (!hasRunningTimer) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [tasks]);

  useEffect(() => {
    window.localStorage.setItem("tasksFloatingTimerPos", JSON.stringify(floatingTimerBasePos));
  }, [floatingTimerBasePos]);

  useEffect(() => {
    const hasRunningFloatingTimer = Object.keys(floatingTimers).some((taskId) => {
      const task = tasks.find((item) => item.id === taskId);
      return !!task?.timerStartedAt;
    });

    if (!hasRunningFloatingTimer) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setWidgetTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [tasks, floatingTimers]);

  useEffect(() => {
    if (tasks.length === 0 || !currentUserId) {
      return;
    }

    const myRunningTasks = tasks.filter(
      (task) =>
        task.status === "doing" && task.assigneeId === currentUserId && !!task.timerStartedAt,
    );

    const missingTasks = myRunningTasks.filter(
      (task) => !floatingTimers[task.id] && !dismissedFloatingTimerIds.has(task.id),
    );
    if (missingTasks.length === 0) {
      return;
    }

    setFloatingTimers((current) => {
      const next = { ...current };
      missingTasks.forEach((task) => {
        if (next[task.id]) {
          return;
        }
        next[task.id] = { ...getNextFloatingTimerPosition(Object.keys(next).length), minimized: true };
      });
      return next;
    });
  }, [tasks, currentUserId, floatingTimers, dismissedFloatingTimerIds]);

  useEffect(() => {
    if (!centerNoticeMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCenterNoticeMessage("");
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [centerNoticeMessage]);

  useEffect(() => {
    setExportError("");
    if (!selectedAssigneeId || selectedAssigneeId === UNASSIGNED_SENTINEL) {
      return;
    }
    const range = getQuincenaRange(activityYearMonth, activityHalfMonth);
    setExportFromDate(range?.startKey ?? "");
    setExportToDate(range?.endKey ?? "");
  }, [selectedAssigneeId]);

  const onExportUserActivity = async () => {
    if (!selectedAssigneeId || selectedAssigneeId === UNASSIGNED_SENTINEL) {
      return;
    }

    if (!exportFromDate || !exportToDate) {
      setExportError("Selecciona la fecha inicial y la fecha final.");
      return;
    }

    if (exportFromDate > exportToDate) {
      setExportError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }

    setExportError("");
    setExportingActivity(true);

    try {
      const response = await axios.get(
        `${API_URL}/reports/users/${selectedAssigneeId}/activity.xlsx`,
        {
          headers: authHeaders(),
          params: { from: exportFromDate, to: exportToDate },
          responseType: "blob",
        },
      );

      const disposition = response.headers["content-disposition"] as string | undefined;
      const fileNameMatch = disposition?.match(/filename="?([^"]+)"?/);
      const fileName = fileNameMatch?.[1] ?? `actividades_${exportFromDate}_a_${exportToDate}.xlsx`;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setExportError("No se pudieron exportar las actividades.");
    } finally {
      setExportingActivity(false);
    }
  };

  const selectAssignee = (assigneeId: string) => {
    const nextAssigneeId = selectedAssigneeId === assigneeId ? "" : assigneeId;
    setSelectedAssigneeId(nextAssigneeId);

    if (nextAssigneeId) {
      const now = new Date();
      setActivityYearMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      setActivityHalfMonth(now.getDate() <= 15 ? "first" : "second");
      setShowAllActivityQuincenas(false);
    }
  };

  const filteredTasks = useMemo(
    () =>
      filterTasks(tasks, projects, {
        showDoneTasks,
        canManagePlanning,
        search,
        selectedSpecialty,
        selectedAcademy,
        selectedProjectId,
        selectedAssigneeId,
        showAllActivityQuincenas,
        activityRange: activityQuincenaRange,
      }),
    [
      tasks,
      search,
      canManagePlanning,
      projects,
      selectedSpecialty,
      selectedAcademy,
      selectedProjectId,
      selectedAssigneeId,
      activityQuincenaRange,
      showAllActivityQuincenas,
      showDoneTasks,
    ],
  );

  const availableAcademies = useMemo(
    () => listAvailableAcademies(projects, selectedSpecialty),
    [projects, selectedSpecialty],
  );

  const activeProjects = useMemo(
    () => filterActiveProjects(projects, tasks, { selectedSpecialty, selectedAcademy, selectedAssigneeId }),
    [projects, tasks, selectedSpecialty, selectedAcademy, selectedAssigneeId],
  );

  const peopleForSelectedProject = useMemo(
    () => peopleForProject(tasks, users, selectedProjectId),
    [tasks, users, selectedProjectId],
  );

  const peopleWithTaskCounts = useMemo(
    () => countPeopleWithTasks(tasks, projects, users, { selectedSpecialty, selectedAcademy }),
    [tasks, projects, users, selectedSpecialty, selectedAcademy],
  );

  const projectById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects],
  );

  const taskById = useMemo(
    () => Object.fromEntries(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const consequentTasksByParent = useMemo(() => groupConsequentTasks(tasks), [tasks]);

  const todayIso = useMemo(() => toDateKey(new Date()), []);

  const workerDisplayName = useMemo(() => {
    if (!email) {
      return "";
    }
    return email.split("@")[0];
  }, [email]);

  const workerHeaderDate = useMemo(
    () =>
      new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(new Date()),
    [],
  );

  const workerKpis = useMemo(() => computeWorkerKpis(filteredTasks, todayIso), [filteredTasks, todayIso]);

  const workerPriorityTasks = useMemo(
    () => pickPriorityTasks(filteredTasks, todayIso),
    [filteredTasks, todayIso],
  );

  const workerTimeline = useMemo(
    () => buildWorkerTimeline(filteredTasks, todayIso),
    [filteredTasks, todayIso],
  );

  const displayTasks = useMemo(
    () => buildDisplayTasks(filteredTasks, focusMode, todayIso),
    [filteredTasks, focusMode, todayIso],
  );

  const taskDueSemaforo = (task: TaskRow) => dueSemaforo(task, todayIso);

  const assigneeLabel = (assigneeId?: string) => {
    if (!assigneeId) {
      return "Sin asignar";
    }

    const user = users.find((item) => item.id === assigneeId);
    return user
      ? `${user.fullName} (${roleLabels[user.role] ?? user.role})`
      : assigneeId.slice(0, 8);
  };

  const projectLabel = (projectId: string) => {
    const project = projectById[projectId];
    if (!project) {
      return "Proyecto no encontrado";
    }

    const specialty = project.scope ? specialtyLabels[project.scope] : "Sin especialidad";
    return `${project.code} · ${project.name} · ${specialty}`;
  };

  const onOpenTaskEdit = (task: TaskRow) => {
    setEditingTaskId(task.id);
    setError("");
    setInfo("");
  };

  const onTaskEdited = (updatedTask: TaskRow) => {
    setTasks((current) =>
      current.map((item) => (item.id === updatedTask.id ? { ...item, ...updatedTask } : item)),
    );
    setTaskDrafts((current) => ({
      ...current,
      [updatedTask.id]: {
        ...current[updatedTask.id],
        status: updatedTask.status,
        priority: updatedTask.priority,
        assigneeId: updatedTask.assigneeId ?? "",
        description: updatedTask.description ?? "",
        dueDate: updatedTask.dueDate ?? "",
        estimatedHours: updatedTask.estimatedHours ?? "",
      },
    }));
    setEditingTaskId("");
    setInfo(`Tarea ${updatedTask.code} actualizada.`);
  };

  const onSaveTaskQuickEdit = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    const draft = taskDrafts[taskId];

    if (!task || !draft) {
      return;
    }

    setInfo("");
    setError("");
    setSavingTaskId(taskId);

    try {
      const willCreateConsequentTask =
        draft.status === "done" && draft.handoffToUserId.trim().length > 0;

      const payload = {
        status: draft.status,
        priority: canManagePlanning ? draft.priority : undefined,
        assigneeId: canManagePlanning ? draft.assigneeId || undefined : undefined,
        description: canManagePlanning ? draft.description || undefined : undefined,
        dueDate: canManagePlanning ? draft.dueDate || undefined : undefined,
        estimatedHours:
          canManagePlanning && draft.estimatedHours.trim().length > 0
            ? Number(draft.estimatedHours)
            : undefined,
        handoffToUserId:
          draft.status === "done" && draft.handoffToUserId
            ? draft.handoffToUserId
            : undefined,
        nextTitle:
          draft.status === "done" && draft.handoffTitle.trim().length > 0
            ? draft.handoffTitle
            : undefined,
        handoffMessage:
          draft.status === "done" && draft.handoffMessage.trim().length > 0
            ? draft.handoffMessage
            : undefined,
        nextActivityType:
          draft.status === "done" && draft.handoffToUserId
            ? draft.nextActivityType
            : undefined,
        nextDueDate:
          draft.status === "done" && draft.handoffToUserId && draft.nextDueDate.trim().length > 0
            ? draft.nextDueDate
            : undefined,
        nextEstimatedHours:
          draft.status === "done" && draft.handoffToUserId && draft.nextEstimatedHours.trim().length > 0
            ? Number(draft.nextEstimatedHours)
            : undefined,
      };

      const updated = await axios.patch(`${API_URL}/tasks/${taskId}`, payload, {
        headers: authHeaders(),
      });

      setTasks((current) =>
        current.map((item) =>
          item.id === taskId ? ({ ...item, ...(updated.data as TaskRow) } as TaskRow) : item,
        ),
      );
      setTaskDrafts((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {
            status: task.status,
            priority: task.priority,
            assigneeId: task.assigneeId ?? "",
            description: task.description ?? "",
            dueDate: task.dueDate ?? "",
            estimatedHours: task.estimatedHours ?? "",
            handoffToUserId: "",
            handoffTitle: "",
            handoffMessage: "",
            nextActivityType: task.activityType,
            nextDueDate: task.dueDate ?? "",
            nextEstimatedHours: task.estimatedHours ?? "",
          }),
          handoffToUserId: "",
          handoffTitle: "",
          handoffMessage: "",
          nextDueDate: "",
          nextEstimatedHours: task.estimatedHours ?? "",
        },
      }));

      if (willCreateConsequentTask) {
        setOpenedConsequenceTaskId("");
        setOpenedTrackingTaskId("");

        if (role) {
          await loadData(role);
        }

        setCenterNoticeMessage("Tarea consecuente creada correctamente.");
      }

      setInfo(`Tarea ${task.code} actualizada.`);
    } catch (caughtError) {
      setError(
        extractErrorMessage(caughtError, "No se pudo actualizar la tarea."),
      );
    } finally {
      setSavingTaskId("");
    }
  };

  const onTimerAction = async (
    taskId: string,
    targetStatus: "doing" | "paused" | "done",
  ) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    setInfo("");
    setError("");
    setSavingTaskId(taskId);

    try {
      if (targetStatus === "doing") {
        const othersToPause = Object.keys(floatingTimers).filter((id) => {
          if (id === taskId) {
            return false;
          }
          const otherTask = tasks.find((item) => item.id === id);
          return otherTask?.status === "doing";
        });

        for (const otherId of othersToPause) {
          try {
            const pausedResponse = await axios.patch(
              `${API_URL}/tasks/${otherId}`,
              { status: "paused" },
              { headers: authHeaders() },
            );
            const pausedTask = pausedResponse.data as TaskRow;
            setTasks((current) =>
              current.map((item) => (item.id === otherId ? { ...item, ...pausedTask } : item)),
            );
            setTaskDrafts((current) => ({
              ...current,
              [otherId]: { ...current[otherId], status: pausedTask.status },
            }));
          } catch {
            // best-effort: don't block starting the new task if pausing another one fails
          }
        }
      }

      const updated = await axios.patch(
        `${API_URL}/tasks/${taskId}`,
        { status: targetStatus },
        { headers: authHeaders() },
      );

      const updatedTask = updated.data as TaskRow;
      setTasks((current) =>
        current.map((item) => (item.id === taskId ? { ...item, ...updatedTask } : item)),
      );
      setTaskDrafts((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {
            status: task.status,
            priority: task.priority,
            assigneeId: task.assigneeId ?? "",
            description: task.description ?? "",
            dueDate: task.dueDate ?? "",
            estimatedHours: task.estimatedHours ?? "",
            handoffToUserId: "",
            handoffTitle: "",
            handoffMessage: "",
            nextActivityType: task.activityType,
            nextDueDate: task.dueDate ?? "",
            nextEstimatedHours: task.estimatedHours ?? "",
          }),
          status: updatedTask.status,
        },
      }));

      if (targetStatus === "doing") {
        setDismissedFloatingTimerIds((current) => {
          if (!current.has(taskId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
        setFloatingTimers((current) => {
          if (current[taskId]) {
            return { ...current, [taskId]: { ...current[taskId], minimized: false } };
          }
          return {
            ...current,
            [taskId]: { ...getNextFloatingTimerPosition(Object.keys(current).length), minimized: false },
          };
        });
      } else if (targetStatus === "done") {
        setFloatingTimers((current) => {
          if (!current[taskId]) {
            return current;
          }
          const next = { ...current };
          delete next[taskId];
          return next;
        });
      }

      const actionLabel =
        targetStatus === "doing" ? "iniciada" : targetStatus === "paused" ? "pausada" : "finalizada";
      setInfo(`Tarea ${task.code} ${actionLabel}.`);
    } catch (caughtError) {
      setError(
        extractErrorMessage(caughtError, "No se pudo actualizar el estado de la tarea."),
      );
    } finally {
      setSavingTaskId("");
    }
  };

  const formatActiveDuration = (task: TaskRow) => formatDuration(task, nowTick);

  const onFloatingTimerDragPointerDown = (taskId: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const entry = floatingTimers[taskId];
    if (!entry) {
      return;
    }

    dragStateRef.current = {
      taskId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: entry.x,
      origY: entry.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onFloatingTimerDragPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const maxX = Math.max(0, window.innerWidth - 48);
    const maxY = Math.max(0, window.innerHeight - 48);
    const nextX = Math.min(Math.max(dragState.origX + dx, 0), maxX);
    const nextY = Math.min(Math.max(dragState.origY + dy, 0), maxY);

    setFloatingTimers((current) => {
      if (!current[dragState.taskId]) {
        return current;
      }
      return {
        ...current,
        [dragState.taskId]: { ...current[dragState.taskId], x: nextX, y: nextY },
      };
    });
  };

  const onFloatingTimerDragPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      const entry = floatingTimers[dragState.taskId];
      if (entry) {
        setFloatingTimerBasePos({ x: entry.x, y: entry.y });
      }
    }
  };

  const onDeleteTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const canDeleteTask = role === "manager" || task.createdBy === currentUserId;
    if (!canDeleteTask) {
      return;
    }

    const confirmed = window.confirm(`Vas a borrar la tarea ${task.code}. Esta accion no se puede deshacer. Continuar?`);
    if (!confirmed) {
      return;
    }

    setInfo("");
    setError("");
    setDeletingTaskId(taskId);

    try {
      await axios.delete(`${API_URL}/tasks/${taskId}`, {
        headers: authHeaders(),
      });

      setTasks((current) => current.filter((item) => item.id !== taskId));
      setTaskDrafts((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      setFloatingTimers((current) => {
        if (!current[taskId]) {
          return current;
        }
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      setHistoryByTask((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${taskId}|`))),
      );
      if (openedHistoryTaskId === taskId) {
        setOpenedHistoryTaskId("");
      }
      if (openedTrackingTaskId === taskId) {
        setOpenedTrackingTaskId("");
      }
      if (openedConsequenceTaskId === taskId) {
        setOpenedConsequenceTaskId("");
      }
      setInfo(`Tarea ${task.code} eliminada.`);
    } catch (caughtError) {
      setError(
        extractErrorMessage(
          caughtError,
          "No se pudo borrar la tarea.",
        ),
      );
    } finally {
      setDeletingTaskId("");
    }
  };

  const closeNotCompletedModal = () => {
    setOpenedNotCompletedTaskId("");
  };

  const onNotCompletedDone = (updatedTask: TaskRow, wasReassigned: boolean) => {
    setTasks((current) =>
      current.map((item) => (item.id === updatedTask.id ? { ...item, ...updatedTask } : item)),
    );
    setTaskDrafts((current) => ({
      ...current,
      [updatedTask.id]: {
        ...current[updatedTask.id],
        status: updatedTask.status,
        assigneeId: updatedTask.assigneeId ?? "",
      },
    }));
    setFloatingTimers((current) => {
      if (!current[updatedTask.id]) {
        return current;
      }
      const next = { ...current };
      delete next[updatedTask.id];
      return next;
    });
    setHistoryByTask((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${updatedTask.id}|`)),
      ),
    );

    closeNotCompletedModal();
    setInfo(
      wasReassigned
        ? `Incumplimiento registrado y tarea ${updatedTask.code} reasignada.`
        : `Tarea ${updatedTask.code} cerrada como no completada.`,
    );
  };

  const floatingTimerEntries = Object.entries(floatingTimers)
    .map(([taskId, entry]) => {
      const task = tasks.find((item) => item.id === taskId && item.status !== "done");
      return task ? { task, entry } : null;
    })
    .filter((row): row is { task: TaskRow; entry: { x: number; y: number; minimized: boolean } } => row !== null);

  const canPlanConsequence = role === "manager" || role === "lead" || role === "worker";
  const canMarkNotCompleted = role === "manager" || role === "lead";
  const notCompletedTask = tasks.find((item) => item.id === openedNotCompletedTaskId);
  const editingTask = tasks.find((item) => item.id === editingTaskId);
  const consequenceTask = tasks.find((item) => item.id === openedConsequenceTaskId);
  const consequenceDraft = openedConsequenceTaskId
    ? taskDrafts[openedConsequenceTaskId]
    : undefined;
  const consequenceEnabled =
    consequenceTask && consequenceDraft
      ? (consequenceDraft.status ?? consequenceTask.status) === "done"
      : false;

  const historyKey = (taskId: string, from: string, to: string) =>
    `${taskId}|${from || "_"}|${to || "_"}`;

  const loadHistory = async (taskId: string, from: string, to: string) => {
    const key = historyKey(taskId, from, to);

    if (historyByTask[key]) {
      return;
    }

    setLoadingHistoryTaskId(taskId);
    try {
      const response = await axios.get(`${API_URL}/task-updates`, {
        headers: authHeaders(),
        params: {
          taskId,
          from: from || undefined,
          to: to || undefined,
        },
      });

      setHistoryByTask((current) => ({
        ...current,
        [key]: response.data as TaskUpdateRow[],
      }));
    } catch {
      setError("No se pudo cargar el historial de la tarea.");
    } finally {
      setLoadingHistoryTaskId("");
    }
  };

  const onToggleHistory = async (taskId: string) => {
    if (openedHistoryTaskId === taskId) {
      setOpenedHistoryTaskId("");
      return;
    }

    setOpenedHistoryTaskId(taskId);
    await loadHistory(taskId, appliedHistoryFrom, appliedHistoryTo);
  };

  const onApplyHistoryRange = async () => {
    if (!openedHistoryTaskId) {
      return;
    }

    if (!historyQuincenaRange) {
      setError("Selecciona un mes valido para filtrar el historial.");
      return;
    }

    setError("");
    setAppliedHistoryFrom(historyQuincenaRange.startKey);
    setAppliedHistoryTo(historyQuincenaRange.endKey);
    await loadHistory(openedHistoryTaskId, historyQuincenaRange.startKey, historyQuincenaRange.endKey);
  };

  const onClearHistoryRange = async () => {
    setError("");
    setAppliedHistoryFrom("");
    setAppliedHistoryTo("");

    if (openedHistoryTaskId) {
      await loadHistory(openedHistoryTaskId, "", "");
    }
  };

  const onOpenTaskFromTimeline = (taskId: string, target: "description" | "history") => {
    if (target === "description") {
      setOpenedDescriptionTaskId(taskId);
      return;
    }

    setOpenedHistoryTaskId(taskId);
    void loadHistory(taskId, appliedHistoryFrom, appliedHistoryTo);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              {isWorker ? "Mis tareas" : "Tareas individuales"}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {isWorker
                ? "Gestiona y actualiza tus tareas asignadas."
                : "Vista y filtrado detallado de todas las tareas."}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--line)] bg-gradient-to-r from-white via-[var(--background)] to-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {isWorker ? "Mi jornada" : "Vista operativa"}
                </p>
                <p className="mt-1 text-lg font-semibold capitalize">
                  {workerDisplayName ? `Hola, ${workerDisplayName}` : "Hola"}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">{workerHeaderDate}</p>
              </div>
              <button
                onClick={() => setFocusMode((current) => !current)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  focusMode
                    ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                }`}
              >
                {focusMode ? "Modo enfoque activo" : "Activar modo enfoque"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Pendientes</p>
                <p className="mt-1 text-2xl font-semibold">{workerKpis.active}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">En curso</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--accent)]">{workerKpis.doing}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Bloqueadas</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--danger)]">{workerKpis.blocked}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Vencen hoy</p>
                <p className="mt-1 text-2xl font-semibold text-amber-700">{workerKpis.dueToday}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Avance personal</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {workerKpis.done}/{workerKpis.total} finalizadas
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${workerKpis.progress}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {workerPriorityTasks.length === 0 ? (
                <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-muted)] md:col-span-2">
                  Excelente, no tienes tareas activas con los filtros actuales.
                </p>
              ) : (
                workerPriorityTasks.map((task) => {
                  const due = taskDueSemaforo(task);
                  return (
                    <div key={task.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                      <p className="text-sm font-semibold">{task.title}</p>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        {activityTypeLabels[task.activityType] ?? task.activityType} · {priorityLabels[task.priority]}
                      </p>
                      <p className={`mt-2 text-xs font-semibold ${due.textClass}`}>{due.label}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-3">
              <p className="text-sm font-semibold">Línea de tiempo rápida</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
                    Atrasadas ({workerTimeline.overdue.length})
                  </p>
                  <div className="mt-2 space-y-1">
                    {workerTimeline.overdue.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "description")}
                          className="text-left text-xs font-semibold text-red-700 underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "history")}
                          className="text-[11px] text-red-700/80 underline-offset-2 hover:underline"
                        >
                          Historial
                        </button>
                      </div>
                    ))}
                    {workerTimeline.overdue.length === 0 ? (
                      <p className="text-xs text-red-700/70">Sin tareas atrasadas.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                    Hoy ({workerTimeline.today.length})
                  </p>
                  <div className="mt-2 space-y-1">
                    {workerTimeline.today.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "description")}
                          className="text-left text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "history")}
                          className="text-[11px] text-amber-800/80 underline-offset-2 hover:underline"
                        >
                          Historial
                        </button>
                      </div>
                    ))}
                    {workerTimeline.today.length === 0 ? (
                      <p className="text-xs text-amber-800/70">Sin vencimientos para hoy.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Mañana ({workerTimeline.tomorrow.length})
                  </p>
                  <div className="mt-2 space-y-1">
                    {workerTimeline.tomorrow.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "description")}
                          className="text-left text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "history")}
                          className="text-[11px] text-emerald-700/80 underline-offset-2 hover:underline"
                        >
                          Historial
                        </button>
                      </div>
                    ))}
                    {workerTimeline.tomorrow.length === 0 ? (
                      <p className="text-xs text-emerald-700/70">Sin tareas programadas.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

        {canManagePlanning ? (
          <div className="mt-6 space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Vista personal
              </p>
              <button
                type="button"
                aria-pressed={selectedAssigneeId === currentUserId && selectedProjectId === ""}
                disabled={!currentUserId}
                onClick={() => {
                  const shouldShowMyTasks = selectedAssigneeId !== currentUserId || selectedProjectId !== "";
                  setSelectedAssigneeId(shouldShowMyTasks ? currentUserId : "");
                  setSelectedSpecialty("");
                  setSelectedAcademy("");
                  setSelectedProjectId("");
                  if (shouldShowMyTasks) {
                    setShowAllActivityQuincenas(true);
                  }
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selectedAssigneeId === currentUserId && selectedProjectId === ""
                    ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                }`}
              >
                Mis tareas
              </button>
            </div>

            {selectedAssigneeId && !selectedProjectId ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-sm">
                <span>
                  Filtrando por persona:{" "}
                  <strong>
                    {selectedAssigneeId === UNASSIGNED_SENTINEL
                      ? "Sin asignar"
                      : assigneeLabel(selectedAssigneeId)}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAssigneeId("")}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  Quitar
                </button>
              </div>
            ) : null}

            {role === "manager" ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Personas
                </p>
                {peopleWithTaskCounts.length === 0 ? (
                  <p className="ui-empty px-4 py-3 text-sm">
                    No hay personas con tareas para los filtros actuales.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAssigneeId("")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        selectedAssigneeId === ""
                          ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                      }`}
                    >
                      Todas las personas
                    </button>
                    {peopleWithTaskCounts.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          selectAssignee(person.id);
                          setSelectedProjectId("");
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          selectedAssigneeId === person.id
                            ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                        }`}
                      >
                        {person.label} ({person.count})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Especialidades
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSpecialty("");
                    setSelectedAcademy("");
                    setSelectedProjectId("");
                    setSelectedAssigneeId("");
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selectedSpecialty === ""
                      ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                  }`}
                >
                  Todas las especialidades
                </button>
                {LEAD_SPECIALTIES.map((specialty) => (
                  <button
                    key={specialty}
                    type="button"
                    onClick={() => {
                      setSelectedSpecialty((current) => (current === specialty ? "" : specialty));
                      setSelectedAcademy("");
                      setSelectedProjectId("");
                      setSelectedAssigneeId("");
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selectedSpecialty === specialty
                        ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                    }`}
                  >
                    {specialtyLabels[specialty]}
                  </button>
                ))}
              </div>
            </div>

            {role === "manager" && selectedSpecialty ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Academias
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAcademy("");
                      setSelectedProjectId("");
                      setSelectedAssigneeId("");
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selectedAcademy === ""
                        ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                    }`}
                  >
                    Todas las academias
                  </button>
                  {availableAcademies.map((academy) => (
                    <button
                      key={academy.key}
                      type="button"
                      onClick={() => {
                        setSelectedAcademy((current) => (current === academy.key ? "" : academy.key));
                        setSelectedProjectId("");
                        setSelectedAssigneeId("");
                      }}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        selectedAcademy === academy.key
                          ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                      }`}
                    >
                      {academy.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Proyectos
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectId("");
                    setSelectedAssigneeId("");
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selectedProjectId === ""
                      ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                  }`}
                >
                  Todos los proyectos
                </button>
                {activeProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId((current) => (current === project.id ? "" : project.id));
                      setSelectedAssigneeId("");
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selectedProjectId === project.id
                        ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                    }`}
                  >
                    {project.code} · {project.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedProjectId ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Personas con tareas en este proyecto
                </p>
                {peopleForSelectedProject.length === 0 ? (
                  <p className="ui-empty px-4 py-3 text-sm">Este proyecto no tiene tareas asignadas todavia.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAssigneeId("")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        selectedAssigneeId === ""
                          ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                      }`}
                    >
                      Todas las personas
                    </button>
                    {peopleForSelectedProject.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => selectAssignee(person.id)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          selectedAssigneeId === person.id
                            ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                        }`}
                      >
                        {person.label} ({person.count})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {selectedAssigneeId ? (
              <>
              <div className="border-t border-[var(--line)] pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Periodo de actividades
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs text-[var(--ink-muted)]">
                    Mes
                    <input
                      type="month"
                      value={activityYearMonth}
                      onChange={(event) => {
                        setActivityYearMonth(event.target.value);
                        setShowAllActivityQuincenas(false);
                      }}
                      className="mt-1 block rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Quincena de actividades">
                    <button
                      type="button"
                      aria-pressed={!showAllActivityQuincenas && activityHalfMonth === "first"}
                      onClick={() => {
                        setActivityHalfMonth("first");
                        setShowAllActivityQuincenas(false);
                      }}
                      className={`ui-btn ui-btn-sm ${
                        !showAllActivityQuincenas && activityHalfMonth === "first"
                          ? "ui-btn-primary"
                          : "ui-btn-secondary"
                      }`}
                    >
                      1 al 15
                    </button>
                    <button
                      type="button"
                      aria-pressed={!showAllActivityQuincenas && activityHalfMonth === "second"}
                      onClick={() => {
                        setActivityHalfMonth("second");
                        setShowAllActivityQuincenas(false);
                      }}
                      className={`ui-btn ui-btn-sm ${
                        !showAllActivityQuincenas && activityHalfMonth === "second"
                          ? "ui-btn-primary"
                          : "ui-btn-secondary"
                      }`}
                    >
                      16 al fin de mes
                    </button>
                    <button
                      type="button"
                      aria-pressed={showAllActivityQuincenas}
                      onClick={() => setShowAllActivityQuincenas(true)}
                      className={`ui-btn ui-btn-sm ${
                        showAllActivityQuincenas ? "ui-btn-primary" : "ui-btn-secondary"
                      }`}
                    >
                      Ver todas
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  {showAllActivityQuincenas
                    ? "Mostrando actividades de todas las quincenas."
                    : activityQuincenaRange
                      ? `Mostrando actividades con fecha de entrega del ${activityQuincenaRange.startKey} al ${activityQuincenaRange.endKey}.`
                      : "Selecciona un mes valido."}
                </p>
              </div>

              {selectedAssigneeId !== UNASSIGNED_SENTINEL ? (
                <div className="border-t border-[var(--line)] pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                    Exportar actividades
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-[var(--ink-muted)]">
                      Desde
                      <input
                        type="date"
                        value={exportFromDate}
                        onChange={(event) => setExportFromDate(event.target.value)}
                        className="mt-1 block rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-[var(--ink-muted)]">
                      Hasta
                      <input
                        type="date"
                        value={exportToDate}
                        onChange={(event) => setExportToDate(event.target.value)}
                        className="mt-1 block rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={onExportUserActivity}
                      disabled={exportingActivity}
                      className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {exportingActivity ? "Exportando…" : "Exportar a Excel"}
                    </button>
                  </div>
                  {exportError ? (
                    <p className="mt-2 text-xs text-[var(--danger)]">{exportError}</p>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                      Descarga un Excel con todas las tareas (principales y consecuentes, finalizadas y no
                      completadas) de {assigneeLabel(selectedAssigneeId)} con fecha límite o de cierre en el
                      rango elegido, incluyendo tipo de actividad, estado, resultado y horas.
                    </p>
                  )}
                </div>
              ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="mt-6">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ui-control"
              placeholder="Buscar tarea"
            />
          </div>
        )}

        <div className="mt-3">
          <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={showDoneTasks}
              onChange={(event) => setShowDoneTasks(event.target.checked)}
            />
            Mostrar tareas finalizadas
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-4 py-3 text-sm text-[var(--foreground)]">
            {info}
          </p>
        ) : null}

      </section>

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <div className="ui-skeleton h-6 w-40" />
          </div>
        ) : displayTasks.length === 0 ? (
          <p className="ui-empty m-4 px-4 py-3 text-sm">No hay tareas con esos filtros.</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="ui-table min-w-full w-full">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Actividad</th>
                  {showCodeAndAssigneeColumns ? <th className="px-4 py-3 font-semibold">Asignado</th> : null}
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Prioridad</th>
                  <th className="px-4 py-3 font-semibold">Semáforo</th>
                  <th className="px-4 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {displayTasks.map((task) => {
                  const due = taskDueSemaforo(task);
                  const canDeleteTask = role === "manager" || task.createdBy === currentUserId;
                  const consequentTasks = consequentTasksByParent[task.id] ?? [];
                  const parentTask = task.parentTaskId ? taskById[task.parentTaskId] : undefined;
                  const parentActivityLabel = parentTask
                    ? activityTypeLabels[parentTask.activityType] ?? parentTask.activityType
                    : "actividad";
                  const isPrincipalTask = !task.parentTaskId;
                  return (
                    <Fragment key={task.id}>
                      <tr className="border-b border-[var(--line)]/60 align-top">
                        <td className="px-4 py-3 break-words">
                          <p className="font-semibold break-words">{task.title}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                            {projectLabel(task.projectId)}
                          </p>
                          {!isPrincipalTask ? (
                            <p className="mt-1 text-[11px] font-semibold text-[var(--accent)]">
                              Seguimiento de {parentActivityLabel} de {parentTask ? parentTask.title : "tarea principal"}
                            </p>
                          ) : null}
                          {task.description ? (
                            <>
                              <button
                                onClick={() =>
                                  setOpenedDescriptionTaskId((current) =>
                                    current === task.id ? "" : task.id,
                                  )
                                }
                                className="ui-btn ui-btn-secondary ui-btn-sm mt-1"
                              >
                                {openedDescriptionTaskId === task.id
                                  ? "Ocultar descripción"
                                  : "Ver descripción"}
                              </button>
                              {openedDescriptionTaskId === task.id ? (
                                <p className="mt-2 text-xs text-[var(--ink-muted)]">{task.description}</p>
                              ) : null}
                            </>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">{activityTypeLabels[task.activityType] ?? task.activityType}</td>
                        {showCodeAndAssigneeColumns ? (
                          <td className="px-4 py-3 whitespace-normal break-words">
                            {assigneeLabel(task.assigneeId)}
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold">
                            {task.status === "done" && task.completionOutcome === "not_completed"
                              ? "no completada"
                              : statusLabels[task.status] ?? task.status}
                          </span>
                          <p className="mt-2 text-xs text-[var(--ink-muted)]">
                            Tiempo activo: {formatActiveDuration(task)}
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {priorityLabels[task.priority] ?? task.priority}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-2 text-xs font-semibold ${due.textClass}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${due.dotClass}`} />
                            {due.label}
                          </span>
                          <p className="mt-2 text-xs text-[var(--ink-muted)]">
                            Horas estimadas actuales: {task.estimatedHours ?? "0"}
                            {Number(task.authorizedExtraHours ?? 0) > 0
                              ? ` + ${Number(task.authorizedExtraHours).toFixed(2)} autorizadas`
                              : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 md:min-w-[220px]">
                          <div className="grid gap-2 lg:grid-cols-2">
                            {task.status === "todo" || task.status === "paused" ? (
                              <button
                                onClick={() => void onTimerAction(task.id, "doing")}
                                disabled={savingTaskId === task.id}
                                className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                Iniciar
                              </button>
                            ) : null}
                            {task.status === "doing" ? (
                              <button
                                onClick={() => void onTimerAction(task.id, "paused")}
                                disabled={savingTaskId === task.id}
                                className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                Pausar
                              </button>
                            ) : null}
                            {task.status === "doing" || task.status === "paused" ? (
                              <button
                                onClick={() => void onTimerAction(task.id, "done")}
                                disabled={savingTaskId === task.id}
                                className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                Finalizar
                              </button>
                            ) : null}
                            {canManagePlanning ? (
                              <button
                                onClick={() => onOpenTaskEdit(task)}
                                className="ui-btn ui-btn-primary ui-btn-sm"
                              >
                                Editar
                              </button>
                            ) : null}
                            <button
                              onClick={() => void onToggleHistory(task.id)}
                              disabled={loadingHistoryTaskId === task.id}
                              className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {loadingHistoryTaskId === task.id
                                ? "Cargando..."
                                : openedHistoryTaskId === task.id
                                  ? "Ocultar historial"
                                  : "Ver historial"}
                            </button>
                            {canPlanConsequence && isPrincipalTask ? (
                              <button
                                onClick={() =>
                                  setOpenedTrackingTaskId((current) =>
                                    current === task.id ? "" : task.id,
                                  )
                                }
                                className="ui-btn ui-btn-secondary ui-btn-sm"
                              >
                                {openedTrackingTaskId === task.id
                                  ? "Ocultar seguimiento"
                                  : `Seguimiento (${consequentTasks.length})`}
                              </button>
                            ) : null}
                            {canPlanConsequence ? (
                              <button
                                onClick={() => {
                                  setTaskDrafts((current) => ({
                                    ...current,
                                    [task.id]: {
                                      ...current[task.id],
                                      status: "done",
                                    },
                                  }));
                                  setOpenedConsequenceTaskId(task.id);
                                }}
                                className="ui-btn ui-btn-secondary ui-btn-sm"
                              >
                                Tarea consecuente
                              </button>
                            ) : null}
                            {canMarkNotCompleted && task.status !== "done" ? (
                              <button
                                onClick={() => setOpenedNotCompletedTaskId(task.id)}
                                className="ui-btn ui-btn-danger ui-btn-sm"
                              >
                                Tarea no completada
                              </button>
                            ) : null}
                            {canDeleteTask ? (
                              <button
                                onClick={() => void onDeleteTask(task.id)}
                                disabled={deletingTaskId === task.id}
                                className="ui-btn ui-btn-danger ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {deletingTaskId === task.id ? "Borrando..." : "Borrar"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {openedHistoryTaskId === task.id ? (
                        <tr className="border-b border-[var(--line)]/60">
                          <td colSpan={showCodeAndAssigneeColumns ? 7 : 6} className="bg-[var(--background)]/35 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                            Historial de updates
                          </p>

                          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white/70 p-3 md:flex-row md:items-end md:justify-between">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="text-xs text-[var(--ink-muted)]">
                                Mes
                                <input
                                  type="month"
                                  value={historyYearMonth}
                                  onChange={(event) => setHistoryYearMonth(event.target.value)}
                                  className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-xs text-[var(--ink-muted)]">
                                Quincena
                                <select
                                  value={historyHalfMonth}
                                  onChange={(event) => setHistoryHalfMonth(event.target.value as HalfMonth)}
                                  className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                                >
                                  <option value="first">1 al 15</option>
                                  <option value="second">16 al fin de mes</option>
                                </select>
                              </label>
                              <div className="flex items-end">
                                <p className="rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink-muted)]">
                                  {historyQuincenaRange
                                    ? `Rango: ${historyQuincenaRange.startKey} a ${historyQuincenaRange.endKey}`
                                    : "Selecciona un mes valido"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 md:items-end">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => void onApplyHistoryRange()}
                                  disabled={!!loadingHistoryTaskId}
                                  className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  Aplicar filtro al historial
                                </button>
                                <button
                                  onClick={() => void onClearHistoryRange()}
                                  disabled={(!appliedHistoryFrom && !appliedHistoryTo) || !!loadingHistoryTaskId}
                                  className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  Ver historial completo
                                </button>
                              </div>
                              <p className="text-xs text-[var(--ink-muted)]">
                                {appliedHistoryFrom && appliedHistoryTo
                                  ? `Filtro activo: ${appliedHistoryFrom} a ${appliedHistoryTo}`
                                  : "Mostrando historial completo"}
                              </p>
                            </div>
                          </div>

                          {historyByTask[historyKey(task.id, appliedHistoryFrom, appliedHistoryTo)] &&
                          historyByTask[historyKey(task.id, appliedHistoryFrom, appliedHistoryTo)].length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {historyByTask[historyKey(task.id, appliedHistoryFrom, appliedHistoryTo)].map((item) => (
                                <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <span className="font-mono">{item.updateDate}</span>
                                    <span title="Cronómetro + horas capturadas">
                                      {(Number(item.workedHours) + (item.timerSeconds ?? 0) / 3600).toFixed(2)} h
                                    </span>
                                    <span>{Number(item.progressPercent).toFixed(0)}%</span>
                                    <span className="text-[var(--ink-muted)]">
                                      {assigneeLabel(item.userId)}
                                    </span>
                                  </div>
                                  {item.comments ? (
                                    <p className="mt-2 text-sm text-[var(--foreground)]">{item.comments}</p>
                                  ) : null}
                                  {item.blockerReason ? (
                                    <p className="mt-1 text-xs text-[var(--danger)]">
                                      Detalle: {item.blockerReason}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-[var(--ink-muted)]">
                              Esta tarea no tiene updates todavía.
                            </p>
                          )}
                          </td>
                        </tr>
                      ) : null}

                      {isPrincipalTask && openedTrackingTaskId === task.id ? (
                        <tr className="border-b border-[var(--line)]/60">
                          <td colSpan={showCodeAndAssigneeColumns ? 7 : 6} className="bg-[var(--background)]/35 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                              Seguimiento de continuidad
                            </p>
                            {consequentTasks.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {consequentTasks.map((childTask) => (
                                  <div key={childTask.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                      <span className="font-semibold text-[var(--foreground)]">
                                        {childTask.code} · {childTask.title}
                                      </span>
                                      <span className="rounded-full border border-cyan-200 bg-cyan-100 px-3 py-1 font-semibold text-cyan-800">
                                        {childTask.status === "done" && childTask.completionOutcome === "not_completed"
                                          ? "no completada"
                                          : statusLabels[childTask.status] ?? childTask.status}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                                      {activityTypeLabels[childTask.activityType] ?? childTask.activityType} · prioridad {priorityLabels[childTask.priority] ?? childTask.priority} · fecha fin {childTask.dueDate ?? "-"}
                                    </p>
                                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                                      Responsable: {assigneeLabel(childTask.assigneeId)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                Esta tarea principal no tiene tareas consecuentes registradas.
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {centerNoticeMessage ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-2xl">
            <p className="text-sm uppercase tracking-[0.12em] text-emerald-700">Confirmacion</p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{centerNoticeMessage}</p>
            <button
              type="button"
              onClick={() => setCenterNoticeMessage("")}
              className="ui-btn ui-btn-primary ui-btn-sm mt-4"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      {editingTask && canManagePlanning ? (
        <EditTaskModal
          key={editingTask.id}
          task={editingTask}
          role={role}
          projects={projects}
          users={users}
          projectLabel={projectLabel}
          onClose={() => setEditingTaskId("")}
          onSaved={onTaskEdited}
        />
      ) : null}

      {canMarkNotCompleted && notCompletedTask ? (
        <NotCompletedModal
          key={notCompletedTask.id}
          task={notCompletedTask}
          users={users}
          assigneeLabel={assigneeLabel(notCompletedTask.assigneeId)}
          onClose={closeNotCompletedModal}
          onDone={onNotCompletedDone}
        />
      ) : null}

      {canPlanConsequence && consequenceTask && consequenceDraft ? (
        <ConsequenceModal
          key={consequenceTask.id}
          task={consequenceTask}
          draft={consequenceDraft}
          enabled={consequenceEnabled}
          users={users}
          saving={savingTaskId === consequenceTask.id}
          onChange={(patch) =>
            setTaskDrafts((current) => ({
              ...current,
              [consequenceTask.id]: { ...current[consequenceTask.id], ...patch },
            }))
          }
          onSave={() => void onSaveTaskQuickEdit(consequenceTask.id)}
          onClose={() => setOpenedConsequenceTaskId("")}
        />
      ) : null}

      {extensionTask ? (
        <ExtensionRequestModal
          task={extensionTask}
          onClose={() => setExtensionTask(null)}
          onSent={() => {
            setExtensionTask(null);
            setCenterNoticeMessage("Solicitud enviada a gerencia. Te avisaremos cuando la resuelva.");
          }}
        />
      ) : null}

      {floatingTimerEntries.map(({ task: floatingTask, entry }) => (
        <FloatingTimerWidget
          key={floatingTask.id}
          task={floatingTask}
          position={{ x: entry.x, y: entry.y }}
          minimized={entry.minimized}
          saving={savingTaskId === floatingTask.id}
          nowTick={widgetTick}
          onDragPointerDown={onFloatingTimerDragPointerDown(floatingTask.id)}
          onDragPointerMove={onFloatingTimerDragPointerMove}
          onDragPointerUp={onFloatingTimerDragPointerUp}
          onToggleMinimize={() =>
            setFloatingTimers((current) => ({
              ...current,
              [floatingTask.id]: {
                ...current[floatingTask.id],
                minimized: !current[floatingTask.id]?.minimized,
              },
            }))
          }
          onClose={() => {
            setFloatingTimers((current) => {
              if (!current[floatingTask.id]) {
                return current;
              }
              const next = { ...current };
              delete next[floatingTask.id];
              return next;
            });
            setDismissedFloatingTimerIds((current) => new Set(current).add(floatingTask.id));
          }}
          onStart={() => void onTimerAction(floatingTask.id, "doing")}
          onPause={() => void onTimerAction(floatingTask.id, "paused")}
          onFinish={() => void onTimerAction(floatingTask.id, "done")}
          onRequestExtension={() => setExtensionTask(floatingTask)}
        />
      ))}
    </div>
  );
}