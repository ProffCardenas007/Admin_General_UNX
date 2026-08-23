"use client";

import { Fragment, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import {
  API_URL,
  authHeaders,
  getStoredEmail,
  getStoredRole,
  getStoredSpecialties,
  getStoredToken,
} from "../../lib/api";
import {
  LEAD_SPECIALTIES,
  normalizeLeadSpecialtiesInput,
  normalizeLeadSpecialtyInput,
  specialtyLabels,
  type LeadSpecialty,
} from "../../lib/specialties";

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
};

type UserOption = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  specialty?: string | null;
  specialties?: string[] | null;
  teamIds?: string[];
};

type TeamOption = {
  id: string;
  name: string;
  memberCount?: number;
};

type TaskOption = {
  id: string;
  code: string;
  title: string;
};

type TaskStatus = "todo" | "doing" | "blocked" | "done";
type TaskActivityType =
  | "revision"
  | "edicion"
  | "creacion"
  | "presentaciones"
  | "grabacion"
  | "plataforma"
  | "administrativo";

type TaskChainStepDraft = {
  stepKey: string;
  activityType: TaskActivityType;
  title: string;
  description: string;
  assigneeId: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string;
  estimatedHours: string;
};

type CreatedTaskChainStep = {
  id: string;
  code: string;
  title: string;
  description?: string;
  activityType: TaskActivityType;
  assigneeId?: string;
  status: TaskStatus;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours?: string;
  chainOrder?: number | null;
};

const statusOptions = [
  { value: "planned", label: "planificado" },
  { value: "active", label: "activo" },
  { value: "on_hold", label: "en pausa" },
  { value: "done", label: "finalizado" },
  { value: "cancelled", label: "cancelado" },
] as const;

const taskStatusOptions = [
  { value: "todo", label: "por hacer" },
  { value: "doing", label: "en curso" },
  { value: "blocked", label: "bloqueada" },
  { value: "done", label: "finalizada" },
] as const;

const activityTypeOptions = [
  { value: "revision", label: "revision" },
  { value: "edicion", label: "edicion" },
  { value: "creacion", label: "creacion" },
  { value: "presentaciones", label: "presentaciones" },
  { value: "grabacion", label: "grabacion" },
  { value: "plataforma", label: "plataforma" },
  { value: "administrativo", label: "administrativo" },
] as const;

const priorityOptions = [
  { value: "low", label: "baja" },
  { value: "medium", label: "media" },
  { value: "high", label: "alta" },
  { value: "urgent", label: "urgente" },
] as const;

const roleOptions = [
  { value: "manager", label: "gerencia" },
  { value: "lead", label: "líder" },
  { value: "worker", label: "colaborador" },
] as const;

const taskStatusVisuals: Record<TaskStatus, { label: string; icon: string; tone: string }> = {
  todo: { label: "pendiente", icon: "⏳", tone: "text-amber-600" },
  doing: { label: "en curso", icon: "🔄", tone: "text-sky-600" },
  blocked: { label: "bloqueada", icon: "🔒", tone: "text-zinc-500" },
  done: { label: "completada", icon: "✅", tone: "text-emerald-600" },
};

export default function CapturePage() {
  const router = useRouter();
  const getTodayDate = () => {
    const now = new Date();
    const timezoneOffsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
  };
  const [role, setRole] = useState("");
  const [specialties, setSpecialties] = useState<LeadSpecialty[]>([]);
  const [captureMode, setCaptureMode] = useState<"" | "project" | "task" | "task-chain">("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const projectCodeLabel = role === "manager" || role === "lead" ? "Academia" : "Código";

  const projectTaskSpecialtyLabel = (project?: ProjectOption) => {
    if (!project?.scope) {
      return "";
    }

    return specialtyLabels[project.scope];
  };

  const [projectForm, setProjectForm] = useState({
    code: "",
    name: "",
    scope: "",
    status: "active",
    startDate: "",
    endDate: "",
  });

  const [taskForm, setTaskForm] = useState({
    projectId: "",
    activityType: "creacion",
    title: "",
    description: "",
    assigneeId: "",
    teamId: "",
    status: "todo",
    priority: "medium",
    dueDate: "",
    estimatedHours: "",
  });

  const selectedTaskProject = projects.find((project) => project.id === taskForm.projectId);

  const [taskChainForm, setTaskChainForm] = useState({
    projectId: "",
    steps: [
      {
        stepKey: crypto.randomUUID(),
        activityType: "creacion" as TaskActivityType,
        title: "",
        description: "",
        assigneeId: "",
        status: "todo" as TaskStatus,
        priority: "medium" as const,
        dueDate: "",
        estimatedHours: "",
      },
      {
        stepKey: crypto.randomUUID(),
        activityType: "revision" as TaskActivityType,
        title: "",
        description: "",
        assigneeId: "",
        status: "blocked" as TaskStatus,
        priority: "medium" as const,
        dueDate: "",
        estimatedHours: "",
      },
    ] as TaskChainStepDraft[],
  });
  const [createdChainId, setCreatedChainId] = useState("");
  const [createdChainSteps, setCreatedChainSteps] = useState<CreatedTaskChainStep[]>([]);
  const selectedChainProject = projects.find((project) => project.id === taskChainForm.projectId);

  useEffect(() => {
    if (!createdChainId) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCreatedChainId("");
      setCreatedChainSteps([]);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [createdChainId]);

  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    role: "worker",
    specialties: [] as LeadSpecialty[],
    password: "",
    teamIds: [] as string[],
  });

  const [updateForm, setUpdateForm] = useState({
    taskId: "",
    userId: "",
    updateDate: getTodayDate(),
    workedHours: "",
    progressPercent: "",
    blockerReason: "",
    comments: "",
  });

  const loadLookups = async () => {
    try {
      setLoading(true);
      const headers = authHeaders();
      const [projectResponse, userResponse, taskResponse, teamsResponse] = await Promise.all([
        axios.get(`${API_URL}/projects`, { headers }),
        axios.get(`${API_URL}/users`, { headers }),
        axios.get(`${API_URL}/tasks`, { headers }),
        axios.get(`${API_URL}/teams`, { headers }),
      ]);

      setProjects(projectResponse.data as ProjectOption[]);
      setUsers(userResponse.data as UserOption[]);
      setTasks(taskResponse.data as TaskOption[]);
      setTeams(teamsResponse.data as TeamOption[]);

      const currentRole = getStoredRole();
      const currentEmail = getStoredEmail().toLowerCase();
      if (currentRole === "lead" && userResponse.data?.length > 0) {
        const currentLead = (userResponse.data as UserOption[]).find(
          (user) => user.email.toLowerCase() === currentEmail,
        );

        const resolvedSpecialties = normalizeLeadSpecialtiesInput([
          ...(Array.isArray(currentLead?.specialties) ? currentLead.specialties : []),
          currentLead?.specialty,
        ]);
        if (resolvedSpecialties.length > 0) {
          setSpecialties(resolvedSpecialties);
          setProjectForm((current) => ({ ...current, scope: resolvedSpecialties[0] }));
          setUserForm((current) => ({ ...current, specialties: resolvedSpecialties }));
        }
      }

      if (projectResponse.data?.length > 0) {
        setTaskForm((current) => {
          const hasSelectedProject = projectResponse.data.some(
            (project: ProjectOption) => project.id === current.projectId,
          );

          return hasSelectedProject
            ? current
            : { ...current, projectId: projectResponse.data[0].id };
        });

        setTaskChainForm((current) => {
          const hasSelectedProject = projectResponse.data.some(
            (project: ProjectOption) => project.id === current.projectId,
          );

          return hasSelectedProject
            ? current
            : { ...current, projectId: projectResponse.data[0].id };
        });
      }

      if (userResponse.data?.length > 0) {
        setTaskForm((current) => ({ ...current, assigneeId: userResponse.data[0].id }));
        setTaskChainForm((current) => ({
          ...current,
          steps: current.steps.map((step, index) =>
            step.assigneeId
              ? step
              : {
                  ...step,
                  assigneeId: userResponse.data[Math.min(index, userResponse.data.length - 1)].id,
                },
          ),
        }));
        setUpdateForm((current) => ({ ...current, userId: userResponse.data[0].id }));
      }

      if (taskResponse.data?.length > 0) {
        setUpdateForm((current) => ({ ...current, taskId: taskResponse.data[0].id }));
      }
    } catch {
      setMessage("No se pudieron cargar los datos de apoyo. Revisa tu sesión y permisos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = getStoredToken();

    if (!savedToken) {
      router.replace("/");
      return;
    }

    const savedRole = getStoredRole();
    if (savedRole === "worker") {
      router.replace("/tasks");
      return;
    }

    const savedSpecialties = normalizeLeadSpecialtiesInput(getStoredSpecialties());
    const savedSpecialty = savedSpecialties[0] ?? "";
    setRole(savedRole);
    setSpecialties(savedSpecialties);
    if (savedSpecialties.length > 0) {
      setProjectForm((current) => ({ ...current, scope: savedSpecialty }));
      setUserForm((current) => ({ ...current, specialties: savedSpecialties }));
    }
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    const requestedProjectId = new URLSearchParams(window.location.search).get("projectId");
    if (requestedMode === "project" || requestedMode === "task" || requestedMode === "task-chain") {
      setCaptureMode(requestedMode);
    }
    if (requestedProjectId) {
      setTaskForm((current) => ({ ...current, projectId: requestedProjectId }));
      setTaskChainForm((current) => ({ ...current, projectId: requestedProjectId }));
    }

    void loadLookups();
  }, [router]);

  const submitProject = async () => {
    setMessage("");

    const trimmedCode = projectForm.code.trim();
    const trimmedName = projectForm.name.trim();

    if (!trimmedCode || !trimmedName) {
      setMessage("No se pudo crear el proyecto: academia y nombre son obligatorios.");
      return;
    }

    const usedNames = new Set(
      projects.map((project) => project.name.trim().toLowerCase()),
    );

    if (usedNames.has(trimmedName.toLowerCase())) {
      let suggestedName = trimmedName;
      let suffix = 2;

      while (usedNames.has(suggestedName.toLowerCase())) {
        suggestedName = `${trimmedName} ${suffix}`;
        suffix += 1;
      }

      setMessage(`No se pudo crear el proyecto: el nombre ${trimmedName} ya existe. Prueba con ${suggestedName}.`);
      return;
    }

    if (role === "lead" && specialties.length === 0) {
      setMessage("No se pudo crear el proyecto: tu cuenta de lider no tiene especialidad asignada.");
      return;
    }

    try {
      const normalizedScope = normalizeLeadSpecialtyInput(
        role === "lead" ? projectForm.scope : projectForm.scope,
      );

      if (role === "lead" && (!normalizedScope || !specialties.includes(normalizedScope))) {
        setMessage("No se pudo crear el proyecto: selecciona una especialidad valida de tu perfil.");
        return;
      }

      const payload = {
        code: trimmedCode,
        name: trimmedName,
        scope: normalizedScope || undefined,
        status: projectForm.status,
        startDate: projectForm.startDate || undefined,
        endDate: projectForm.endDate || undefined,
      };

      await axios.post(`${API_URL}/projects`, payload, { headers: authHeaders() });
      setMessage(`Proyecto ${trimmedCode} creado.`);
      setProjectForm({
        code: "",
        name: "",
        scope: specialties[0] ?? "",
        status: "active",
        startDate: "",
        endDate: "",
      });
      await loadLookups();
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const rawMessage = caughtError.response?.data?.message;
        const backendMessage =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(". ")
              : "";

        if (backendMessage) {
          setMessage(`No se pudo crear el proyecto: ${backendMessage}`);
        } else {
          setMessage("No se pudo crear el proyecto. Revisa los campos requeridos.");
        }
      } else {
        setMessage("No se pudo crear el proyecto. Revisa los campos requeridos.");
      }
    }
  };

  const submitTask = async () => {
    setMessage("");

    if (!taskForm.dueDate) {
      setMessage("Selecciona una fecha de finalizacion para la tarea.");
      return;
    }

    try {
      const payload = {
        projectId: taskForm.projectId,
        activityType: taskForm.activityType,
        title: taskForm.title,
        description: taskForm.description,
        assigneeId: taskForm.teamId ? undefined : taskForm.assigneeId || undefined,
        teamId: taskForm.teamId || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate,
        estimatedHours: taskForm.estimatedHours ? Number(taskForm.estimatedHours) : undefined,
      };

      await axios.post(`${API_URL}/tasks`, payload, { headers: authHeaders() });
      setMessage(`Tarea ${taskForm.title} creada.`);
      setTaskForm((current) => ({ ...current, title: "", description: "", dueDate: "", estimatedHours: "" }));
      await loadLookups();
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const rawMessage = caughtError.response?.data?.message;
        const backendMessage =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(". ")
              : "";

        if (backendMessage) {
          setMessage(`No se pudo crear la tarea: ${backendMessage}`);
        } else {
          setMessage("No se pudo crear la tarea. Verifica proyecto, actividad, titulo y descripcion.");
        }
      } else {
        setMessage("No se pudo crear la tarea. Verifica proyecto, actividad, titulo y descripcion.");
      }
    }
  };

  const addTaskChainStep = () => {
    const newStep: TaskChainStepDraft = {
      stepKey: crypto.randomUUID(),
      activityType: "revision",
      title: "",
      description: "",
      assigneeId: users[0]?.id ?? "",
      status: "blocked",
      priority: "medium",
      dueDate: "",
      estimatedHours: "",
    };

    setTaskChainForm((current) => ({
      ...current,
      steps: [...current.steps, newStep].map((step, index) => ({
        ...step,
        status: index === 0 ? "todo" : "blocked",
      })),
    }));
  };

  const removeTaskChainStep = (stepKey: string) => {
    setTaskChainForm((current) => {
      if (current.steps.length <= 2) {
        return current;
      }

      return {
        ...current,
        steps: current.steps
          .filter((step) => step.stepKey !== stepKey)
          .map((step, index) => ({
            ...step,
            status: index === 0 ? "todo" : "blocked",
          })),
      };
    });
  };

  const moveTaskChainStep = (stepKey: string, direction: "up" | "down") => {
    setTaskChainForm((current) => {
      const index = current.steps.findIndex((step) => step.stepKey === stepKey);
      if (index < 0) {
        return current;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.steps.length) {
        return current;
      }

      const reordered = [...current.steps];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);
      return {
        ...current,
        steps: reordered.map((step, currentIndex) => ({
          ...step,
          status: currentIndex === 0 ? "todo" : "blocked",
        })),
      };
    });
  };

  const updateTaskChainStep = (
    stepKey: string,
    field:
      | "activityType"
      | "title"
      | "description"
      | "assigneeId"
      | "priority"
      | "dueDate"
      | "estimatedHours",
    value: string,
  ) => {
    setTaskChainForm((current) => ({
      ...current,
      steps: current.steps.map((step) => {
        if (step.stepKey !== stepKey) {
          return step;
        }

        if (field === "activityType") {
          return {
            ...step,
            activityType: value as TaskActivityType,
          };
        }

        if (field === "priority") {
          return {
            ...step,
            priority: value as "low" | "medium" | "high" | "urgent",
          };
        }

        return {
          ...step,
          [field]: value,
        };
      }),
    }));
  };

  const submitTaskChain = async () => {
    setMessage("");
    setCreatedChainId("");
    setCreatedChainSteps([]);

    if (!taskChainForm.projectId) {
      setMessage("Selecciona un proyecto para la cadena.");
      return;
    }

    if (taskChainForm.steps.length < 2) {
      setMessage("La tarea completa requiere al menos 2 pasos. Para 1 paso usa Crear tarea.");
      return;
    }

    if (taskChainForm.steps.some((step) => !step.assigneeId)) {
      setMessage("Todos los pasos de la cadena deben tener responsable asignado.");
      return;
    }

    if (taskChainForm.steps.some((step) => !step.title.trim() || !step.description.trim())) {
      setMessage("Todos los pasos deben tener titulo y descripcion.");
      return;
    }

    if (taskChainForm.steps.some((step) => !step.dueDate)) {
      setMessage("Todos los pasos deben tener fecha de finalizacion.");
      return;
    }

    if (taskChainForm.steps.some((step) => step.estimatedHours.trim().length > 0 && Number(step.estimatedHours) < 0)) {
      setMessage("Las horas estimadas no pueden ser negativas.");
      return;
    }

    try {
      const payload = {
        projectId: taskChainForm.projectId,
        steps: taskChainForm.steps.map((step) => ({
          activityType: step.activityType,
          title: step.title.trim(),
          description: step.description.trim(),
          assigneeId: step.assigneeId,
          status: step.status,
          priority: step.priority,
          dueDate: step.dueDate || undefined,
          estimatedHours: step.estimatedHours ? Number(step.estimatedHours) : undefined,
        })),
      };

      const response = await axios.post(`${API_URL}/tasks/chains`, payload, {
        headers: authHeaders(),
      });

      const created = (response.data?.tasks ?? []) as CreatedTaskChainStep[];
      const sortedCreated = [...created].sort(
        (left, right) => (left.chainOrder ?? 0) - (right.chainOrder ?? 0),
      );

      setCreatedChainId(response.data?.chainId ?? "");
      setCreatedChainSteps(sortedCreated);
      setMessage(`Tarea completa realizada. Flujo creado con ${sortedCreated.length} tareas encadenadas.`);
      setTaskChainForm((current) => ({
        ...current,
        steps: current.steps.map((step) => ({
          ...step,
          activityType: step.activityType,
        })),
      }));
      await loadLookups();
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const rawMessage = caughtError.response?.data?.message;
        const backendMessage =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(". ")
              : "";

        if (backendMessage) {
          setMessage(`No se pudo crear la cadena: ${backendMessage}`);
        } else {
          setMessage("No se pudo crear la cadena de tareas. Verifica proyecto, pasos y responsables.");
        }
      } else {
        setMessage("No se pudo crear la cadena de tareas. Verifica proyecto, pasos y responsables.");
      }
    }
  };

  const submitUser = async () => {
    setMessage("");
    try {
      const payload = {
        fullName: userForm.fullName,
        email: userForm.email,
        role: userForm.role,
        specialties: userForm.role === "lead" ? userForm.specialties : undefined,
        password: userForm.password,
        teamIds: userForm.teamIds.length > 0 ? userForm.teamIds : undefined,
      };

      await axios.post(`${API_URL}/users`, payload, { headers: authHeaders() });
      setMessage(`Usuario ${userForm.email} creado.`);
      setUserForm({
        fullName: "",
        email: "",
        role: "worker",
        specialties: specialties,
        password: "",
        teamIds: [],
      });
      await loadLookups();
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const rawMessage = caughtError.response?.data?.message;
        const backendMessage =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(". ")
              : "";

        if (backendMessage) {
          setMessage(`No se pudo crear el usuario: ${backendMessage}`);
        } else {
          setMessage("No se pudo crear el usuario. Revisa nombre, correo, rol y contrasena (minimo 6).");
        }
      } else {
        setMessage("No se pudo crear el usuario. Revisa nombre, correo, rol y contrasena (minimo 6).");
      }
    }
  };

  const submitTaskUpdate = async () => {
    setMessage("");
    try {
      const payload = {
        taskId: updateForm.taskId,
        userId: updateForm.userId || undefined,
        updateDate: updateForm.updateDate,
        workedHours: updateForm.workedHours ? Number(updateForm.workedHours) : 0,
        progressPercent: updateForm.progressPercent
          ? Number(updateForm.progressPercent)
          : 0,
        blockerReason: updateForm.blockerReason || undefined,
        comments: updateForm.comments || undefined,
      };

      await axios.post(`${API_URL}/task-updates`, payload, { headers: authHeaders() });
      setMessage("Actualización registrada. Ya puedes revisar el panel.");
      setUpdateForm((current) => ({
        ...current,
        workedHours: "",
        progressPercent: "",
        blockerReason: "",
        comments: "",
      }));
    } catch {
      setMessage("No se pudo registrar la actualización. Verifica tarea, fecha y horas.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Sistema de proyectos
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Carga de datos
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
            {role === "manager" ? "Crea proyectos, tareas, usuarios y registra actualizaciones." : "Crea proyectos, tareas y registra actualizaciones."}
          </p>
        </div>

        {message ? (
          <p className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-4 py-3 text-sm text-[var(--foreground)]">
            {message}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-4 font-mono text-xs text-[var(--ink-muted)]">Cargando catálogos...</p>
        ) : null}
      </section>

      <section className="kpi-card fade-up p-5">
        <h2 className="text-lg font-semibold">¿Qué quieres crear?</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Elige una opción para abrir solo el formulario correspondiente.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => setCaptureMode("project")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              captureMode === "project"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-white hover:bg-[var(--background)]"
            }`}
          >
            Crear proyecto
          </button>
          <button
            onClick={() => setCaptureMode("task")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              captureMode === "task"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-white hover:bg-[var(--background)]"
            }`}
          >
            Crear tarea
          </button>
          <button
            onClick={() => setCaptureMode("task-chain")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              captureMode === "task-chain"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border border-[var(--line)] bg-white hover:bg-[var(--background)]"
            }`}
          >
            Crear tarea completa
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {captureMode === "project" ? (
        <article className="kpi-card fade-up p-5">
          <h2 className="text-lg font-semibold">Nuevo proyecto</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Llena esto para registrar un proyecto.</p>

          <div className="mt-5 space-y-3">
            <input className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder={projectCodeLabel} value={projectForm.code} onChange={(event) => setProjectForm({ ...projectForm, code: event.target.value })} />
            <input className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Nombre" value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} />
            {role === "lead" ? (
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                value={projectForm.scope}
                onChange={(event) => setProjectForm({ ...projectForm, scope: event.target.value })}
              >
                <option value="">Especialidad del proyecto</option>
                {specialties.map((item) => (
                  <option key={item} value={item}>
                    {specialtyLabels[item]}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={projectForm.scope}
                onChange={(event) => setProjectForm({ ...projectForm, scope: event.target.value })}
              >
                <option value="">Especialidad del proyecto</option>
                {LEAD_SPECIALTIES.map((item) => (
                  <option key={item} value={item}>
                    {specialtyLabels[item]}
                  </option>
                ))}
              </select>
            )}
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value })}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="date"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={projectForm.startDate}
                onFocus={() => {
                  if (!projectForm.startDate) {
                    setProjectForm((current) => ({ ...current, startDate: getTodayDate() }));
                  }
                }}
                onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })}
              />
              <input
                type="date"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={projectForm.endDate}
                onFocus={() => {
                  if (!projectForm.endDate) {
                    setProjectForm((current) => ({ ...current, endDate: getTodayDate() }));
                  }
                }}
                onChange={(event) => setProjectForm({ ...projectForm, endDate: event.target.value })}
              />
            </div>
            <button onClick={submitProject} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110">Crear proyecto</button>
          </div>
        </article>
        ) : null}

        {captureMode === "task" ? (
        <article className="kpi-card fade-up p-5">
          <h2 className="text-lg font-semibold">Nueva tarea</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Campos requeridos: nombre del proyecto, academia, especialidad, actividad, titulo y descripcion.</p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={taskForm.projectId} onChange={(event) => setTaskForm({ ...taskForm, projectId: event.target.value })}>
              <option value="">Nombre del proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                placeholder="Academia"
                value={selectedTaskProject?.code ?? ""}
                readOnly
              />
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                placeholder="Especialidad"
                value={projectTaskSpecialtyLabel(selectedTaskProject)}
                readOnly
              />
            </div>
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={taskForm.activityType} onChange={(event) => setTaskForm({ ...taskForm, activityType: event.target.value })}>
              {activityTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Titulo" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} />
            <textarea className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Descripcion" value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} rows={4} />
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={taskForm.assigneeId} onChange={(event) => setTaskForm({ ...taskForm, assigneeId: event.target.value })}>
              <option value="">Asignado a</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.fullName} - {roleOptions.find((role) => role.value === user.role)?.label ?? user.role}</option>
              ))}
            </select>
            <select
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
              value={taskForm.teamId}
              onChange={(event) =>
                setTaskForm((current) => ({
                  ...current,
                  teamId: event.target.value,
                  assigneeId: event.target.value ? "" : current.assigneeId,
                }))
              }
            >
              <option value="">Asignar por equipo (opcional)</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.memberCount ?? 0})
                </option>
              ))}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={taskForm.status} onChange={(event) => setTaskForm({ ...taskForm, status: event.target.value })}>
                {taskStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="date"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                placeholder="Fecha de finalizacion"
                value={taskForm.dueDate}
                onFocus={() => {
                  if (!taskForm.dueDate) {
                    setTaskForm((current) => ({ ...current, dueDate: getTodayDate() }));
                  }
                }}
                onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
              />
              <input type="number" min="0" step="0.5" className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Horas estimadas" value={taskForm.estimatedHours} onChange={(event) => setTaskForm({ ...taskForm, estimatedHours: event.target.value })} />
            </div>
            <button onClick={submitTask} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110">Crear tarea</button>
          </div>
        </article>
        ) : null}

        {captureMode === "task-chain" ? (
        <article className="kpi-card fade-up p-5 md:col-span-2 xl:col-span-3">
          <h2 className="text-lg font-semibold">Crear tarea completa</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Define una cadena secuencial de tareas. El siguiente paso se activa automaticamente cuando el anterior se finaliza.
          </p>

          <div className="mt-5 space-y-4">
            <select
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
              value={taskChainForm.projectId}
              onChange={(event) => setTaskChainForm((current) => ({ ...current, projectId: event.target.value }))}
            >
              <option value="">Nombre del proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                placeholder="Academia"
                value={selectedChainProject?.code ?? ""}
                readOnly
              />
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                placeholder="Especialidad"
                value={projectTaskSpecialtyLabel(selectedChainProject)}
                readOnly
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--line)]/70 bg-white/80 p-4">
              <p className="text-sm font-semibold">Cadena de tareas</p>
              {taskChainForm.steps.map((step, index) => (
                <div key={step.stepKey} className="rounded-xl border border-[var(--line)]/70 bg-[var(--background)]/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      Paso {index + 1}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveTaskChainStep(step.stepKey, "up")}
                        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold"
                        disabled={index === 0}
                      >
                        Subir
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTaskChainStep(step.stepKey, "down")}
                        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold"
                        disabled={index === taskChainForm.steps.length - 1}
                      >
                        Bajar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTaskChainStep(step.stepKey)}
                        className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-2 py-1 text-xs font-semibold text-[var(--danger)]"
                        disabled={taskChainForm.steps.length <= 2}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      value={step.activityType}
                      onChange={(event) => updateTaskChainStep(step.stepKey, "activityType", event.target.value)}
                    >
                      {activityTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      placeholder="Titulo"
                      value={step.title}
                      onChange={(event) => updateTaskChainStep(step.stepKey, "title", event.target.value)}
                    />
                  </div>
                  <textarea
                    className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    placeholder="Descripcion"
                    value={step.description}
                    onChange={(event) => updateTaskChainStep(step.stepKey, "description", event.target.value)}
                    rows={3}
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <select
                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      value={step.assigneeId}
                      onChange={(event) => updateTaskChainStep(step.stepKey, "assigneeId", event.target.value)}
                    >
                      <option value="">Responsable</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName} - {roleOptions.find((item) => item.value === user.role)?.label ?? user.role}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm"
                      value={step.status}
                      onChange={() => undefined}
                      disabled
                    >
                      {taskStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <select
                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      value={step.priority}
                      onChange={(event) => updateTaskChainStep(step.stepKey, "priority", event.target.value)}
                    >
                      {priorityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      required
                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      placeholder="Fecha de finalizacion"
                      value={step.dueDate}
                      onFocus={() => {
                        if (!step.dueDate) {
                          updateTaskChainStep(step.stepKey, "dueDate", getTodayDate());
                        }
                      }}
                      onChange={(event) => updateTaskChainStep(step.stepKey, "dueDate", event.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      placeholder="Horas estimadas"
                      value={step.estimatedHours}
                      onChange={(event) => updateTaskChainStep(step.stepKey, "estimatedHours", event.target.value)}
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addTaskChainStep}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[var(--background)]"
              >
                + Agregar tarea
              </button>
            </div>

            <button
              onClick={submitTaskChain}
              className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Crear tarea completa
            </button>

            {createdChainId ? (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 px-4">
                <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-2xl">
                  <p className="text-sm uppercase tracking-[0.12em] text-emerald-700">Confirmacion</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">Tarea completa realizada</p>
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">Flujo {createdChainId.slice(0, 8)}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
                    {createdChainSteps.map((step, index) => {
                      const visual = taskStatusVisuals[step.status] ?? taskStatusVisuals.todo;
                      const assignee = users.find((item) => item.id === step.assigneeId);
                      return (
                        <Fragment key={step.id}>
                          <span className={`rounded-full border border-[var(--line)] bg-[var(--background)] px-3 py-1 ${visual.tone}`}>
                            {visual.icon} {activityTypeOptions.find((item) => item.value === step.activityType)?.label ?? step.activityType}
                            {assignee ? ` · ${assignee.fullName}` : ""}
                          </span>
                          {index < createdChainSteps.length - 1 ? <span className="text-[var(--ink-muted)]">→</span> : null}
                        </Fragment>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedChainId("");
                      setCreatedChainSteps([]);
                    }}
                    className="ui-btn ui-btn-primary ui-btn-sm mt-4"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </article>
        ) : null}

        {captureMode === "" && role === "manager" ? (
        <article className="kpi-card fade-up p-5">
          <h2 className="text-lg font-semibold">Nuevo usuario</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Solo gerencia puede crear usuarios.</p>

          <div className="mt-5 space-y-3">
            <input className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Nombre completo" value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} />
            <input className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Correo" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} />
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {userForm.role === "lead" ? (
              <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Especialidades del lider (max 2)
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {LEAD_SPECIALTIES.map((item) => {
                    const checked = userForm.specialties.includes(item);

                    return (
                      <label key={item} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setUserForm((current) => {
                              if (event.target.checked) {
                                if (current.specialties.length >= 2) {
                                  return current;
                                }

                                return {
                                  ...current,
                                  specialties: [...current.specialties, item],
                                };
                              }

                              return {
                                ...current,
                                specialties: current.specialties.filter((specialtyItem) => specialtyItem !== item),
                              };
                            });
                          }}
                        />
                        {specialtyLabels[item]}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <input className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Contraseña" type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} />
            <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Equipos (opcional)
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {teams.map((team) => {
                  const checked = userForm.teamIds.includes(team.id);
                  return (
                    <label key={team.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setUserForm((current) => {
                            if (event.target.checked) {
                              return {
                                ...current,
                                teamIds: [...new Set([...current.teamIds, team.id])],
                              };
                            }
                            return {
                              ...current,
                              teamIds: current.teamIds.filter((item) => item !== team.id),
                            };
                          });
                        }}
                      />
                      {team.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <button onClick={submitUser} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110">Crear usuario</button>
          </div>
        </article>
        ) : null}

        {captureMode === "" ? (
        <article className="kpi-card fade-up p-5">
          <h2 className="text-lg font-semibold">Nueva actualización</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Registro rápido de avance sobre una tarea existente.</p>

          <div className="mt-5 space-y-3">
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={updateForm.taskId} onChange={(event) => setUpdateForm({ ...updateForm, taskId: event.target.value })}>
              <option value="">Tarea</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>{task.code} - {task.title}</option>
              ))}
            </select>
            <select className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={updateForm.userId} onChange={(event) => setUpdateForm({ ...updateForm, userId: event.target.value })}>
              <option value="">Usuario</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.fullName}</option>
              ))}
            </select>
            <input type="date" className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" value={updateForm.updateDate} onChange={(event) => setUpdateForm({ ...updateForm, updateDate: event.target.value })} />
            <div className="grid gap-3 md:grid-cols-2">
              <input type="number" min="0" step="0.5" className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Horas trabajadas" value={updateForm.workedHours} onChange={(event) => setUpdateForm({ ...updateForm, workedHours: event.target.value })} />
              <input type="number" min="0" max="100" step="0.5" className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Progreso %" value={updateForm.progressPercent} onChange={(event) => setUpdateForm({ ...updateForm, progressPercent: event.target.value })} />
            </div>
            <textarea className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Bloqueador (opcional)" value={updateForm.blockerReason} onChange={(event) => setUpdateForm({ ...updateForm, blockerReason: event.target.value })} rows={3} />
            <textarea className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm" placeholder="Comentarios" value={updateForm.comments} onChange={(event) => setUpdateForm({ ...updateForm, comments: event.target.value })} rows={3} />
            <button onClick={submitTaskUpdate} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110">Guardar actualización</button>
          </div>
        </article>
        ) : null}
      </section>
    </div>
  );
}