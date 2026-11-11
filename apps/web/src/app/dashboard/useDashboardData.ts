"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";
import type {
  ClassHoursRow,
  Fortnight,
  ProjectProgress,
  ProjectRow,
  Summary,
  TaskRow,
  TeamOption,
  UserOption,
  WorkloadRow,
} from "./types";

/** Loads everything the dashboard shows for the signed-in user. */
export function useDashboardData(fortnight: Fortnight) {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [classHours, setClassHours] = useState<ClassHoursRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [projectProgressById, setProjectProgressById] = useState<Record<string, ProjectProgress>>({});

  useEffect(() => {
    const savedToken = getStoredToken();
    const savedRole = getStoredRole();
    const savedUserId = getStoredUserId();

    if (!savedToken) {
      router.replace("/");
      return;
    }

    setRole(savedRole);
    setCurrentUserId(savedUserId);

    const loadDashboard = async () => {
      try {
        const headers = authHeaders();
        const [summaryResponse, workloadResponse, projectsResponse, teamsResponse, classHoursResponse] = await Promise.all([
          axios.get(`${API_URL}/dashboard/summary`, { headers }),
          axios.get(`${API_URL}/dashboard/workload`, { headers }),
          axios.get(`${API_URL}/projects`, { headers }),
          axios.get(`${API_URL}/teams`, { headers }),
          savedRole === "manager" || savedRole === "lead"
            ? axios.get(`${API_URL}/class-planning/session-hours`, {
                headers,
                params: {
                  from: fortnight.startKey,
                  to: fortnight.endKey,
                },
              })
            : Promise.resolve({ data: [] }),
        ]);

        let loadedTasks: TaskRow[] = [];
        if (savedRole === "lead") {
          const [myTasksResponse, assignedTasksResponse] = await Promise.all([
            axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } }),
            axios.get(`${API_URL}/tasks`, { headers, params: { scope: "assigned" } }),
          ]);

          const deduped = new Map<string, TaskRow>();
          const myTasks = myTasksResponse.data as TaskRow[];
          const createdByLead = (assignedTasksResponse.data as TaskRow[]).filter(
            (task) => task.createdBy === savedUserId,
          );

          [...myTasks, ...createdByLead].forEach((task) => {
            deduped.set(task.id, task);
          });
          loadedTasks = [...deduped.values()];
        } else {
          const tasksResponse = await axios.get(`${API_URL}/tasks`, { headers });
          loadedTasks = tasksResponse.data as TaskRow[];
        }

        // Las tareas que gerencia rechazó no cuentan como trabajo.
        loadedTasks = loadedTasks.filter(
          (task) => (task as { approvalStatus?: string | null }).approvalStatus !== "rejected",
        );

        let loadedUsers: UserOption[] = [];
        try {
          const usersResponse = await axios.get(`${API_URL}/users`, { headers });
          loadedUsers = usersResponse.data as UserOption[];
        } catch {
          loadedUsers = [];
        }

        setSummary(summaryResponse.data as Summary);
        setWorkload(workloadResponse.data as WorkloadRow[]);
        setClassHours(classHoursResponse.data as ClassHoursRow[]);
        setTasks(loadedTasks);
        setUsers(loadedUsers);

        const loadedProjects = projectsResponse.data as ProjectRow[];
        setProjects(loadedProjects);
        setTeams(teamsResponse.data as TeamOption[]);

        const progressRequests = await Promise.allSettled(
          loadedProjects.map((project) =>
            axios.get(`${API_URL}/projects/${project.id}/progress`, { headers }),
          ),
        );

        const progressMap: Record<string, ProjectProgress> = {};
        progressRequests.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const row = result.value.data as ProjectProgress;
            progressMap[loadedProjects[index].id] = row;
          }
        });
        setProjectProgressById(progressMap);
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          const backendMessage =
            typeof caughtError.response?.data?.message === "string"
              ? caughtError.response.data.message
              : undefined;

          if (backendMessage) {
            setError(`No se pudo cargar el panel: ${backendMessage}`);
          } else if (caughtError.response?.status === 401) {
            setError("Sesión no válida. Vuelve a iniciar sesión.");
          } else {
            setError("No se pudo cargar el panel. Verifica conexión con backend y base de datos.");
          }
        } else {
          setError("No se pudo cargar el panel. Verifica conexión con backend y base de datos.");
        }
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [router, fortnight]);

  return {
    role,
    currentUserId,
    loading,
    error,
    setError: setError as Dispatch<SetStateAction<string>>,
    summary,
    workload,
    classHours,
    tasks,
    setTasks,
    projects,
    users,
    teams,
    projectProgressById,
  };
}
