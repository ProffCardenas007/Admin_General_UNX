"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, clearSession, getStoredRole, getStoredToken } from "../../lib/api";
import { getApiErrorStatus } from "./errors";
import { getTeachers, getUnprogrammedCourses } from "./planning";
import type { CourseRow, PlanningNotify, SessionRow, UserRow } from "./types";

/** Loads users, courses and sessions, and owns the page-level messages. */
export function usePlanningData() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [usersResult, coursesResult, sessionsResult] = await Promise.allSettled([
        axios.get(`${API_URL}/users`, { headers: authHeaders() }),
        axios.get(`${API_URL}/class-planning/courses`, { headers: authHeaders() }),
        axios.get(`${API_URL}/class-planning/sessions`, { headers: authHeaders() }),
      ]);

      const failedResults = [usersResult, coursesResult, sessionsResult].filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      if (failedResults.some((result) => getApiErrorStatus(result.reason) === 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSession();
        router.replace("/");
        return;
      }

      if (failedResults.some((result) => getApiErrorStatus(result.reason) === 403)) {
        setError("No tienes permisos de gerencia para esta sección.");
        router.replace("/dashboard");
        return;
      }

      setUsers(usersResult.status === "fulfilled" ? (usersResult.value.data as UserRow[]) : []);
      setCourses(coursesResult.status === "fulfilled" ? (coursesResult.value.data as CourseRow[]) : []);
      setSessions(sessionsResult.status === "fulfilled" ? (sessionsResult.value.data as SessionRow[]) : []);

      const failedParts: string[] = [];
      if (usersResult.status === "rejected") {
        failedParts.push("profesores");
      }
      if (coursesResult.status === "rejected") {
        failedParts.push("cursos");
      }
      if (sessionsResult.status === "rejected") {
        failedParts.push("sesiones");
      }

      if (failedParts.length > 0) {
        setError(`No se pudo cargar: ${failedParts.join(", ")}. Los datos disponibles se muestran abajo.`);
      }
    } catch {
      setError("No se pudieron cargar cursos, profesores o sesiones.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  /** Reloads after an action: clears the last error first, then fetches. */
  const reload = useCallback(async () => {
    setError("");
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }

    if (getStoredRole() !== "manager") {
      router.replace("/dashboard");
      return;
    }

    void fetchAll();
  }, [router, fetchAll]);

  const teachers = useMemo(() => getTeachers(users), [users]);
  const unprogrammedCourses = useMemo(
    () => getUnprogrammedCourses(courses, sessions),
    [courses, sessions],
  );
  const scheduledCourseIds = useMemo(
    () => new Set(sessions.map((session) => session.courseId)),
    [sessions],
  );

  const notify = useMemo<PlanningNotify>(
    () => ({
      error: setError,
      info: setInfo,
      clear: () => {
        setError("");
        setInfo("");
      },
    }),
    [],
  );

  return {
    loading,
    error,
    info,
    notify,
    reload,
    courses,
    sessions,
    teachers,
    unprogrammedCourses,
    scheduledCourseIds,
  };
}
