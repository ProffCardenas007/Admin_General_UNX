"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";

type UserRow = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
  isActive: boolean;
  classSubjects?: string[] | null;
};

type SubjectRow = {
  id: string;
  courseId: string;
  name: string;
  teacherUserId?: string | null;
  teacherName?: string;
  displayOrder: number;
};

type CourseRow = {
  id: string;
  code: string;
  sectionCode?: string | null;
  name: string;
  modality: "presencial" | "virtual";
  classroom: string;
  scheduleStartTime: string;
  scheduleEndTime: string;
  termStartDate?: string | null;
  termEndDate?: string | null;
  isActive: boolean;
  subjects: SubjectRow[];
};

type SessionRow = {
  id: string;
  classDate: string;
  startTime: string;
  endTime: string;
  classroom: string;
  notes?: string | null;
  courseId: string;
  subjectId: string;
  teacherUserId: string;
  subjectName: string;
  courseCode: string;
  courseName: string;
  teacherName: string;
  coverTeacherUserId?: string | null;
  coverTeacherName?: string;
  effectiveTeacherName?: string;
  isCovered?: boolean;
  hasTitularIncidenceConflict?: boolean;
  incidenceReason?: string;
  coverageNote?: string | null;
  courseModality?: "presencial" | "virtual";
  courseClassroom?: string;
};

type TimeBlock = {
  label: string;
  startTime: string;
  endTime: string;
};

const CLASSROOM_OPTIONS = Array.from({ length: 10 }, (_, index) => `Aula ${index + 1}`);
const VIRTUAL_ROOM_OPTIONS = Array.from({ length: 11 }, (_, index) => `Sala ${index + 1}`);

const getClassroomOptions = (modality: "presencial" | "virtual") =>
  modality === "virtual" ? VIRTUAL_ROOM_OPTIONS : CLASSROOM_OPTIONS;
const BASE_TIME_BLOCKS: TimeBlock[] = [
  { label: "8:00 am - 10:30 am", startTime: "08:00", endTime: "10:30" },
  { label: "11:00 am - 1:30 pm", startTime: "11:00", endTime: "13:30" },
  { label: "4:00 pm - 6:30 pm", startTime: "16:00", endTime: "18:30" },
];
const VIRTUAL_EXTRA_BLOCK: TimeBlock = {
  label: "7:00 pm - 10:30 pm",
  startTime: "19:00",
  endTime: "22:30",
};
const CLASS_TYPE_OPTIONS = ["Curso", "Regularización", "Asesorías", "Examen"] as const;

function toTimeBlockLabel(startTime: string, endTime: string) {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

function getLocalDateISO() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function toLocalISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;

    if (typeof responseMessage === "string" && responseMessage.trim().length > 0) {
      return responseMessage;
    }

    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      const firstMessage = responseMessage[0];
      if (typeof firstMessage === "string" && firstMessage.trim().length > 0) {
        return firstMessage;
      }
    }
  }

  return fallback;
}

function getTimeBlocksByModality(modality: "presencial" | "virtual") {
  return modality === "virtual"
    ? [...BASE_TIME_BLOCKS, VIRTUAL_EXTRA_BLOCK]
    : [...BASE_TIME_BLOCKS];
}

function isApiErrorStatus(error: unknown, status: number) {
  return axios.isAxiosError(error) && error.response?.status === status;
}

function getApiErrorStatus(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }

  return undefined;
}

export default function ClassPlanningPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const [courseCode, setCourseCode] = useState<(typeof CLASS_TYPE_OPTIONS)[number]>("Curso");
  const [courseSectionCode, setCourseSectionCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseModality, setCourseModality] = useState<"presencial" | "virtual">("presencial");
  const [courseClassroom, setCourseClassroom] = useState(CLASSROOM_OPTIONS[0]);
  const [courseTimeBlock, setCourseTimeBlock] = useState("08:00-10:30");
  const [courseTermStart, setCourseTermStart] = useState("");
  const [courseTermEnd, setCourseTermEnd] = useState("");
  const [courseNameFilter, setCourseNameFilter] = useState("");

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [spanishTeacherId, setSpanishTeacherId] = useState("");
  const [mathTeacherId, setMathTeacherId] = useState("");

  const [sessionCourseId, setSessionCourseId] = useState("");
  const [sessionDate, setSessionDate] = useState(getLocalDateISO());
  const [sessionDurationWeeks, setSessionDurationWeeks] = useState(14);
  const [startWithDoubleMath, setStartWithDoubleMath] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [coverageBySession, setCoverageBySession] = useState<Record<string, string>>({});

  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSectionCode, setEditSectionCode] = useState("");
  const [editClassroom, setEditClassroom] = useState(CLASSROOM_OPTIONS[0]);
  const [editModality, setEditModality] = useState<"presencial" | "virtual">("presencial");
  const [editTimeBlock, setEditTimeBlock] = useState("08:00-10:30");
  const [editTermStart, setEditTermStart] = useState("");
  const [editTermEnd, setEditTermEnd] = useState("");

  // Single-subject mode (Regularización / Asesorías / Examen)
  const [singleSubjectName, setSingleSubjectName] = useState("Materia");
  const [singleTeacherId, setSingleTeacherId] = useState("");

  const teachers = useMemo(
    () => users.filter((user) => user.isActive && (user.role === "lead" || user.role === "worker" || user.role === "manager")),
    [users],
  );

  // Prefer teachers tagged with this subject; fall back to everyone if no tags match
  // (avoids blocking scheduling when a teacher's materias haven't been captured yet).
  const getTeachersForSubject = (subjectName: string, currentTeacherId?: string | null) => {
    const tagged = teachers.filter((teacher) => teacher.classSubjects?.includes(subjectName));
    if (tagged.length === 0) {
      return teachers;
    }
    if (currentTeacherId && !tagged.some((teacher) => teacher.id === currentTeacherId)) {
      const current = teachers.find((teacher) => teacher.id === currentTeacherId);
      return current ? [...tagged, current] : tagged;
    }
    return tagged;
  };

  const isCourseTypePAA = (code: string) => code === "Curso";

  const filteredCourses = useMemo(
    () =>
      courseNameFilter.trim()
        ? courses.filter((course) =>
            course.name.toLowerCase().includes(courseNameFilter.toLowerCase()) ||
            (course.sectionCode ?? "").toLowerCase().includes(courseNameFilter.toLowerCase()),
          )
        : courses,
    [courses, courseNameFilter],
  );

  const editTimeBlocks = useMemo(() => getTimeBlocksByModality(editModality), [editModality]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId),
    [courses, selectedCourseId],
  );

  const sessionCourse = useMemo(
    () => courses.find((course) => course.id === sessionCourseId),
    [courses, sessionCourseId],
  );

  const scheduledCourseIds = useMemo(
    () => new Set(sessions.map((session) => session.courseId)),
    [sessions],
  );

  const unprogrammedCourses = useMemo(
    () => courses.filter((course) => !scheduledCourseIds.has(course.id)),
    [courses, scheduledCourseIds],
  );

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.hasTitularIncidenceConflict && !session.isCovered),
    [sessions],
  );

  const pendingCoverageCount = useMemo(
    () => sessions.filter((session) => session.hasTitularIncidenceConflict && !session.isCovered).length,
    [sessions],
  );

  const courseTimeBlocks = useMemo(
    () => getTimeBlocksByModality(courseModality),
    [courseModality],
  );

  const clearSessionAndGoLogin = () => {
    window.localStorage.removeItem("sistema_mvp_token");
    window.localStorage.removeItem("sistema_mvp_email");
    window.localStorage.removeItem("sistema_mvp_role");
    window.localStorage.removeItem("sistema_mvp_specialty");
    window.localStorage.removeItem("sistema_mvp_specialties");
    router.replace("/");
  };

  const loadData = async () => {
    setError("");

    try {
      const [usersResult, coursesResult, sessionsResult] = await Promise.allSettled([
        axios.get(`${API_URL}/users`, { headers: authHeaders() }),
        axios.get(`${API_URL}/class-planning/courses`, { headers: authHeaders() }),
        axios.get(`${API_URL}/class-planning/sessions`, { headers: authHeaders() }),
      ]);

      const failedResults = [usersResult, coursesResult, sessionsResult].filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      const hasUnauthorized = failedResults.some((result) => getApiErrorStatus(result.reason) === 401);
      if (hasUnauthorized) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }

      const hasForbidden = failedResults.some((result) => getApiErrorStatus(result.reason) === 403);
      if (hasForbidden) {
        setError("No tienes permisos de gerencia para esta sección.");
        router.replace("/dashboard");
        return;
      }

      const loadedUsers = usersResult.status === "fulfilled" ? (usersResult.value.data as UserRow[]) : [];
      const loadedCourses = coursesResult.status === "fulfilled" ? (coursesResult.value.data as CourseRow[]) : [];
      const loadedSessions = sessionsResult.status === "fulfilled" ? (sessionsResult.value.data as SessionRow[]) : [];

      setUsers(loadedUsers);
      setCourses(loadedCourses);
      setSessions(loadedSessions);
      setCoverageBySession(
        loadedSessions.reduce<Record<string, string>>((acc, session) => {
          acc[session.id] = session.coverTeacherUserId ?? "";
          return acc;
        }, {}),
      );

      setSelectedCourseId((current) => {
        const loadedScheduledCourseIds = new Set(loadedSessions.map((session) => session.courseId));
        const loadedUnprogrammedCourses = loadedCourses.filter((course) => !loadedScheduledCourseIds.has(course.id));

        if (current && loadedUnprogrammedCourses.some((course) => course.id === current)) {
          return current;
        }
        return loadedUnprogrammedCourses[0]?.id ?? "";
      });

      setSessionCourseId((current) => {
        const loadedScheduledCourseIds = new Set(loadedSessions.map((session) => session.courseId));
        const loadedUnprogrammedCourses = loadedCourses.filter((course) => !loadedScheduledCourseIds.has(course.id));

        if (current && loadedUnprogrammedCourses.some((course) => course.id === current)) {
          return current;
        }
        return loadedUnprogrammedCourses[0]?.id ?? "";
      });

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
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const role = getStoredRole();
    if (role !== "manager") {
      router.replace("/dashboard");
      return;
    }

    void loadData();
  }, [router]);

  useEffect(() => {
    const availableTimeBlocks = getTimeBlocksByModality(courseModality);
    const firstBlock = availableTimeBlocks[0];

    setCourseTimeBlock((current) => {
      if (availableTimeBlocks.some((block) => `${block.startTime}-${block.endTime}` === current)) {
        return current;
      }

      return firstBlock ? `${firstBlock.startTime}-${firstBlock.endTime}` : "08:00-10:30";
    });

    setCourseClassroom((current) => {
      const options = getClassroomOptions(courseModality);
      if (options.includes(current)) return current;
      return options[0] ?? CLASSROOM_OPTIONS[0];
    });
  }, [courseModality]);

  useEffect(() => {
    if (!selectedCourse) {
      setSpanishTeacherId("");
      setMathTeacherId("");
      setSingleTeacherId("");
      return;
    }

    if (isCourseTypePAA(selectedCourse.code)) {
      const spanishSubject = selectedCourse.subjects.find((subject) => subject.name === "Español");
      const mathSubject = selectedCourse.subjects.find((subject) => subject.name === "Matemáticas");
      setSpanishTeacherId(spanishSubject?.teacherUserId ?? "");
      setMathTeacherId(mathSubject?.teacherUserId ?? "");
    } else {
      const subject = selectedCourse.subjects[0];
      setSingleSubjectName(subject?.name ?? selectedCourse.code);
      setSingleTeacherId(subject?.teacherUserId ?? "");
    }
  }, [selectedCourse]);

  const onCreateCourse = async () => {
    setError("");
    setInfo("");

    if (!courseName.trim()) {
      setError("Completa nombre del curso.");
      return;
    }

    if (!courseSectionCode.trim()) {
      setError("Completa el codigo del curso.");
      return;
    }

    const [courseStartTime, courseEndTime] = courseTimeBlock.split("-");
    if (!courseStartTime || !courseEndTime) {
      setError("Selecciona un horario valido para el curso.");
      return;
    }

    if (courseTermStart && courseTermEnd && courseTermStart > courseTermEnd) {
      setError("La fecha de fin de vigencia debe ser mayor a la de inicio.");
      return;
    }

    try {
      await axios.post(
        `${API_URL}/class-planning/courses`,
        {
          code: courseCode.trim().toUpperCase(),
          sectionCode: courseSectionCode.trim().toUpperCase(),
          name: courseName.trim(),
          modality: courseModality,
          classroom: courseClassroom,
          startTime: courseStartTime,
          endTime: courseEndTime,
          termStartDate: courseTermStart || undefined,
          termEndDate: courseTermEnd || undefined,
        },
        { headers: authHeaders() },
      );

      setCourseCode("Curso");
      setCourseSectionCode("");
      setCourseName("");
      setCourseModality("presencial");
      setCourseClassroom(getClassroomOptions("presencial")[0] ?? CLASSROOM_OPTIONS[0]);
      setCourseTimeBlock("08:00-10:30");
      setCourseTermStart("");
      setCourseTermEnd("");
      setInfo("Curso creado correctamente.");
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }

      if (isApiErrorStatus(error, 403)) {
        setError("No tienes permisos de gerencia para crear cursos.");
        return;
      }

      setError(getApiErrorMessage(error, "No se pudo crear el curso. Verifica que el nombre no esté duplicado."));
    }
  };

  const onCreateSubject = async () => {
    setError("");
    setInfo("");

    if (!selectedCourseId) {
      setError("Selecciona un curso.");
      return;
    }

    const isPAA = isCourseTypePAA(selectedCourse?.code ?? "");

    if (isPAA) {
      if (!spanishTeacherId || !mathTeacherId) {
        setError("Selecciona profesor para Español y Matemáticas.");
        return;
      }
    } else {
      if (!singleSubjectName.trim()) {
        setError("Escribe el nombre de la materia.");
        return;
      }
      if (!singleTeacherId) {
        setError("Selecciona un profesor para la materia.");
        return;
      }
    }

    try {
      if (isPAA) {
        const saveSubjectWithTeacher = async (subjectName: "Español" | "Matemáticas", teacherUserId: string) => {
          const existingSubject = selectedCourse?.subjects.find((subject) => subject.name === subjectName);

          if (existingSubject) {
            await axios.patch(
              `${API_URL}/class-planning/subjects/${existingSubject.id}/teacher`,
              { teacherUserId },
              { headers: authHeaders() },
            );
            return;
          }

          await axios.post(
            `${API_URL}/class-planning/courses/${selectedCourseId}/subjects`,
            { name: subjectName, teacherUserId },
            { headers: authHeaders() },
          );
        };

        await Promise.all([
          saveSubjectWithTeacher("Español", spanishTeacherId),
          saveSubjectWithTeacher("Matemáticas", mathTeacherId),
        ]);
      } else {
        const trimmedName = singleSubjectName.trim();
        const existingSubject = selectedCourse?.subjects[0];

        if (existingSubject) {
          if (existingSubject.name !== trimmedName) {
            // name changed: create a new subject (old one stays; the course can only have 1 for non-PAA)
            await axios.post(
              `${API_URL}/class-planning/courses/${selectedCourseId}/subjects`,
              { name: trimmedName, teacherUserId: singleTeacherId },
              { headers: authHeaders() },
            );
          } else {
            await axios.patch(
              `${API_URL}/class-planning/subjects/${existingSubject.id}/teacher`,
              { teacherUserId: singleTeacherId },
              { headers: authHeaders() },
            );
          }
        } else {
          await axios.post(
            `${API_URL}/class-planning/courses/${selectedCourseId}/subjects`,
            { name: trimmedName, teacherUserId: singleTeacherId },
            { headers: authHeaders() },
          );
        }
      }

      setInfo("Materias y profesores guardados correctamente.");
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }

      if (isApiErrorStatus(error, 403)) {
        setError("No tienes permisos de gerencia para asignar profesores.");
        return;
      }

      setError(getApiErrorMessage(error, "No se pudieron guardar las materias y profesores."));
    }
  };

  const onAssignTeacher = async (subjectId: string, teacherUserId: string) => {
    setError("");
    setInfo("");

    if (!teacherUserId) {
      return;
    }

    try {
      await axios.patch(
        `${API_URL}/class-planning/subjects/${subjectId}/teacher`,
        { teacherUserId },
        { headers: authHeaders() },
      );

      setInfo("Profesor asignado correctamente.");
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }

      if (isApiErrorStatus(error, 403)) {
        setError("No tienes permisos de gerencia para asignar profesores.");
        return;
      }

      setError(getApiErrorMessage(error, "No se pudo asignar el profesor a la materia."));
    }
  };

  const onCreateSession = async () => {
    setError("");
    setInfo("");

    if (!sessionCourseId || !sessionDate) {
      setError("Completa curso y fecha de inicio.");
      return;
    }

    if (sessionDurationWeeks < 1) {
      setError("La duración debe ser mayor o igual a 1 semana.");
      return;
    }

    if (!sessionCourse) {
      setError("Selecciona un curso válido.");
      return;
    }

    const isPAA = isCourseTypePAA(sessionCourse.code);

    // Determine subjects to alternate (PAA) or use (single)
    type SubjectInfo = { id: string; teacherUserId: string; name: string };
    let subjectsForSession: SubjectInfo[] | null = null;

    if (isPAA) {
      const mathSubject = sessionCourse.subjects.find((subject) => subject.name === "Matemáticas");
      const spanishSubject = sessionCourse.subjects.find((subject) => subject.name === "Español");

      if (!mathSubject?.teacherUserId || !spanishSubject?.teacherUserId) {
        setError("El curso debe tener asignado profesor para Matemáticas y Español.");
        return;
      }

      subjectsForSession = [mathSubject as SubjectInfo, spanishSubject as SubjectInfo];
    } else {
      const singleSubject = sessionCourse.subjects[0];

      if (!singleSubject?.teacherUserId) {
        setError("El curso debe tener asignado un profesor.");
        return;
      }

      subjectsForSession = [singleSubject as SubjectInfo];
    }

    const sessionStartTime = sessionCourse.scheduleStartTime.slice(0, 5);
    const sessionEndTime = sessionCourse.scheduleEndTime.slice(0, 5);
    const sessionClassroom = sessionCourse.classroom;

    const startDate = new Date(`${sessionDate}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) {
      setError("Fecha de inicio inválida.");
      return;
    }

    let createdSessionsCount = 0;
    let failedClassDate = "";
    const availabilityWarnings: string[] = [];

    try {
      for (let weekIndex = 0; weekIndex < sessionDurationWeeks; weekIndex += 1) {
        let assignedSubject: SubjectInfo;

        if (isPAA) {
          const [mathSubject, spanishSubject] = subjectsForSession as [SubjectInfo, SubjectInfo];
          const useMath = startWithDoubleMath
            ? (weekIndex < 2 ? true : (weekIndex - 2) % 2 === 1)
            : weekIndex % 2 === 0;
          assignedSubject = useMath ? mathSubject : spanishSubject;
        } else {
          assignedSubject = subjectsForSession[0] as SubjectInfo;
        }

        const classDate = new Date(startDate);
        classDate.setDate(startDate.getDate() + weekIndex * 7);
        const classDateIso = toLocalISODate(classDate);
        failedClassDate = classDateIso;

        const response = await axios.post(
          `${API_URL}/class-planning/sessions`,
          {
            courseId: sessionCourseId,
            subjectId: assignedSubject.id,
            teacherUserId: assignedSubject.teacherUserId,
            classDate: classDateIso,
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            classroom: sessionClassroom,
            notes: sessionNotes.trim() || undefined,
          },
          { headers: authHeaders() },
        );

        const warning = (response.data as { availabilityWarning?: string }).availabilityWarning;
        if (warning) {
          availabilityWarnings.push(`${classDateIso}: ${warning}`);
        }

        createdSessionsCount += 1;
      }

      setSessionNotes("");

      if (availabilityWarnings.length > 0) {
        setInfo(
          `Se programaron ${sessionDurationWeeks} semanas. ⚠ Disponibilidad condicional en ${availabilityWarnings.length} sesión(es): revisa con el profesor.`,
        );
      } else {
        setInfo(`Se programaron ${sessionDurationWeeks} semanas correctamente.`);
      }

      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }

      if (isApiErrorStatus(error, 403)) {
        setError("No tienes permisos de gerencia para programar clases.");
        return;
      }

      await loadData();

      if (createdSessionsCount > 0) {
        setInfo(`Se programaron ${createdSessionsCount} semana(s) antes del conflicto.`);
        setError(
          getApiErrorMessage(
            error,
            `Hubo un conflicto y se detuvo la programación en ${failedClassDate}. Revisa Sesiones programadas.`,
          ),
        );
        return;
      }

      setError(getApiErrorMessage(error, "No se pudo programar el calendario. Puede existir conflicto de horario."));
    }
  };

  const onAssignCoverage = async (sessionId: string) => {
    setError("");
    setInfo("");

    try {
      const response = await axios.patch(
        `${API_URL}/class-planning/sessions/${sessionId}/coverage`,
        {
          coverTeacherUserId: coverageBySession[sessionId] || undefined,
        },
        { headers: authHeaders() },
      );

      const warning = (response.data as { coverTeacherAvailabilityWarning?: string }).coverTeacherAvailabilityWarning;
      if (warning) {
        setInfo(`Cobertura asignada. ⚠ ${warning}`);
      } else {
        setInfo("Cobertura de clase actualizada correctamente.");
      }

      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }

      if (isApiErrorStatus(error, 403)) {
        setError("No tienes permisos de gerencia para asignar coberturas.");
        return;
      }

      setError(getApiErrorMessage(error, "No se pudo asignar la cobertura. Revisa choques de horario del profesor de apoyo."));
    }
  };

  const startEditCourse = (course: CourseRow) => {
    setEditingCourseId(course.id);
    setEditName(course.name);
    setEditSectionCode(course.sectionCode ?? "");
    setEditClassroom(course.classroom);
    setEditModality(course.modality);
    setEditTimeBlock(`${course.scheduleStartTime.slice(0, 5)}-${course.scheduleEndTime.slice(0, 5)}`);
    setEditTermStart(course.termStartDate ?? "");
    setEditTermEnd(course.termEndDate ?? "");
  };

  const onUpdateCourse = async (courseId: string) => {
    setError("");
    setInfo("");

    const [startTime, endTime] = editTimeBlock.split("-");
    if (!startTime || !endTime) {
      setError("Selecciona un horario válido.");
      return;
    }

    if (editTermStart && editTermEnd && editTermStart > editTermEnd) {
      setError("La fecha de fin de vigencia debe ser mayor a la de inicio.");
      return;
    }

    try {
      await axios.patch(
        `${API_URL}/class-planning/courses/${courseId}`,
        {
          name: editName.trim() || undefined,
          sectionCode: editSectionCode.trim() || undefined,
          classroom: editClassroom,
          modality: editModality,
          startTime,
          endTime,
          termStartDate: editTermStart || null,
          termEndDate: editTermEnd || null,
        },
        { headers: authHeaders() },
      );

      setEditingCourseId(null);
      setInfo("Curso actualizado correctamente.");
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }
      setError(getApiErrorMessage(error, "No se pudo actualizar el curso."));
    }
  };

  const onToggleCourseActive = async (course: CourseRow) => {
    setError("");
    setInfo("");

    try {
      await axios.patch(
        `${API_URL}/class-planning/courses/${course.id}`,
        { isActive: !course.isActive },
        { headers: authHeaders() },
      );

      setInfo(`Curso ${course.isActive ? "desactivado" : "activado"} correctamente.`);
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }
      setError(getApiErrorMessage(error, "No se pudo cambiar el estado del curso."));
    }
  };

  const onDeleteCourse = async (courseId: string) => {
    if (!window.confirm("¿Eliminar este curso? Esta acción no se puede deshacer.")) return;
    setError("");
    setInfo("");

    try {
      await axios.delete(`${API_URL}/class-planning/courses/${courseId}`, { headers: authHeaders() });
      setInfo("Curso eliminado correctamente.");
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }
      setError(getApiErrorMessage(error, "No se pudo eliminar el curso. Elimina primero sus sesiones programadas."));
    }
  };

  const onDeleteSession = async (sessionId: string) => {
    if (!window.confirm("¿Eliminar esta sesión programada?")) return;
    setError("");
    setInfo("");

    try {
      await axios.delete(`${API_URL}/class-planning/sessions/${sessionId}`, { headers: authHeaders() });
      setInfo("Sesión eliminada correctamente.");
      await loadData();
    } catch (error) {
      if (isApiErrorStatus(error, 401)) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        clearSessionAndGoLogin();
        return;
      }
      setError(getApiErrorMessage(error, "No se pudo eliminar la sesión."));
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 items-center justify-center px-4 py-8 md:px-6">
        <p className="text-sm text-[var(--ink-soft)]">Cargando programación académica...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-6 md:px-6">
      <header className="glass-panel fade-up p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Vista de gerencia</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Cursos y programación de clases</h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Crea cursos, asigna profesores por materia y programa sesiones de clase.
        </p>

        {error ? (
          <p className="mt-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]">
            {info}
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="glass-panel fade-up p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Crear curso</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Tipo de clase
              <select
                value={courseCode}
                onChange={(event) => setCourseCode(event.target.value as (typeof CLASS_TYPE_OPTIONS)[number])}
                className="ui-control"
              >
                {CLASS_TYPE_OPTIONS.map((classType) => (
                  <option key={classType} value={classType}>
                    {classType}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Modalidad
              <select
                value={courseModality}
                onChange={(event) => setCourseModality(event.target.value as "presencial" | "virtual")}
                className="ui-control"
              >
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Nombre
              <input
                type="text"
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                placeholder="Curso Integral A"
                className="ui-control"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Código
              <input
                type="text"
                value={courseSectionCode}
                onChange={(event) => setCourseSectionCode(event.target.value)}
                placeholder="1A"
                className="ui-control"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              {courseModality === "virtual" ? "Sala virtual" : "Aula base"}
              <select
                value={courseClassroom}
                onChange={(event) => setCourseClassroom(event.target.value)}
                className="ui-control"
              >
                {getClassroomOptions(courseModality).map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
              Horario del curso
              <select
                value={courseTimeBlock}
                onChange={(event) => setCourseTimeBlock(event.target.value)}
                className="ui-control"
              >
                {courseTimeBlocks.map((timeBlock) => (
                  <option
                    key={`${timeBlock.startTime}-${timeBlock.endTime}`}
                    value={`${timeBlock.startTime}-${timeBlock.endTime}`}
                  >
                    {timeBlock.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Inicio de vigencia (opcional)
              <input
                type="date"
                value={courseTermStart}
                onChange={(event) => setCourseTermStart(event.target.value)}
                className="ui-control"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Fin de vigencia (opcional)
              <input
                type="date"
                value={courseTermEnd}
                onChange={(event) => setCourseTermEnd(event.target.value)}
                className="ui-control"
              />
            </label>
          </div>
          <p className="mt-2 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
            Horarios permitidos: 8:30 am - 10:30 am, 11:00 am - 1:30 pm, 4:00 pm - 6:30 pm.
            Para modalidad virtual tambien: 7:00 pm - 10:30 pm.
            Sin vigencia definida, el aula/horario del curso queda reservada indefinidamente.
          </p>
          <button type="button" onClick={onCreateCourse} className="ui-btn ui-btn-primary mt-3 h-9 px-4 text-sm">
            Crear curso
          </button>
        </div>

        <div className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "80ms" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Asignación de grupo</p>
          <div className="mt-2 grid gap-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
              Curso
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                disabled={unprogrammedCourses.length === 0}
                className="ui-control"
              >
                {unprogrammedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} · {course.sectionCode || "Sin código"}
                  </option>
                ))}
              </select>
            </label>

            {unprogrammedCourses.length === 0 ? (
              <p className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                No hay cursos pendientes por programar.
              </p>
            ) : null}

            {selectedCourse && isCourseTypePAA(selectedCourse.code) ? (
              <>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">Español</p>
                  <label className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                    Profesor de Español
                    <select
                      value={spanishTeacherId}
                      onChange={(event) => setSpanishTeacherId(event.target.value)}
                      className="ui-control"
                    >
                      <option value="">Sin asignar</option>
                      {getTeachersForSubject("Español", spanishTeacherId).map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">Matemáticas</p>
                  <label className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                    Profesor de Matemáticas
                    <select
                      value={mathTeacherId}
                      onChange={(event) => setMathTeacherId(event.target.value)}
                      className="ui-control"
                    >
                      <option value="">Sin asignar</option>
                      {getTeachersForSubject("Matemáticas", mathTeacherId).map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : selectedCourse ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <p className="text-sm font-medium text-[var(--foreground)]">{selectedCourse.code}</p>
                <label className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Nombre de la materia
                  <input
                    type="text"
                    value={singleSubjectName}
                    onChange={(event) => setSingleSubjectName(event.target.value)}
                    placeholder="Ej: Álgebra, Redacción…"
                    className="ui-control"
                  />
                </label>
                <label className="mt-2 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Profesor
                  <select
                    value={singleTeacherId}
                    onChange={(event) => setSingleTeacherId(event.target.value)}
                    className="ui-control"
                  >
                    <option value="">Sin asignar</option>
                    {getTeachersForSubject(singleSubjectName.trim(), singleTeacherId).map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCreateSubject}
            disabled={!selectedCourseId || unprogrammedCourses.length === 0}
            className="ui-btn ui-btn-primary mt-3 h-9 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Guardar asignación
          </button>
        </div>
      </section>

      <section className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Asignación por curso</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Revisa cada curso, edita sus datos y asigna profesor por materia.</p>
          </div>
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-[var(--ink-soft)]">
            {courses.length} curso{courses.length === 1 ? "" : "s"} · {unprogrammedCourses.length} sin programar
          </span>
        </div>

        <input
          type="text"
          value={courseNameFilter}
          onChange={(event) => setCourseNameFilter(event.target.value)}
          placeholder="Buscar por nombre o código…"
          className="ui-control mt-3 w-full"
        />

        <div className="mt-3 space-y-3">
          {filteredCourses.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">No se encontraron cursos.</p>
          ) : (
            filteredCourses.map((course) => {
              const isProgrammed = scheduledCourseIds.has(course.id);
              const isEditing = editingCourseId === course.id;

              return (
                <div
                  key={course.id}
                  className={`rounded-2xl border p-3 shadow-[0_12px_40px_rgba(0,0,0,0.08)] ${
                    course.isActive
                      ? "border-white/12 bg-gradient-to-br from-white/[0.05] to-white/[0.02]"
                      : "border-white/8 bg-white/[0.02] opacity-60"
                  }`}
                >
                  <div className="flex flex-col gap-2 border-b border-white/8 pb-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{course.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                        Código: {course.sectionCode || "Sin código"} · Tipo: {course.code} · Modalidad: {course.modality}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                        {course.modality === "virtual" ? "Sala virtual" : "Aula base"}: {course.classroom} · Horario base: {toTimeBlockLabel(course.scheduleStartTime, course.scheduleEndTime)}
                        {(course.termStartDate || course.termEndDate) && (
                          <> · Vigencia: {course.termStartDate ?? "…"} a {course.termEndDate ?? "…"}</>
                        )}
                        {isProgrammed && (
                          <span className="ml-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] text-[var(--accent)]">
                            Programado
                          </span>
                        )}
                        {!course.isActive && (
                          <span className="ml-2 rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-2 py-0.5 text-[10px] text-[var(--danger)]">
                            Inactivo
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3 py-1 text-[11px] font-medium text-[var(--accent)]">
                        {course.subjects.length} materia{course.subjects.length === 1 ? "" : "s"}
                      </span>
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingCourseId(null) : startEditCourse(course))}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-[var(--ink-soft)] hover:border-white/30"
                      >
                        {isEditing ? "Cancelar" : "Editar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleCourseActive(course)}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-[var(--ink-soft)] hover:border-white/30"
                      >
                        {course.isActive ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteCourse(course.id)}
                        className="rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-1 text-[11px] text-[var(--danger)] hover:border-[var(--danger)]/60"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Nombre
                        <input
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Código
                        <input
                          type="text"
                          value={editSectionCode}
                          onChange={(event) => setEditSectionCode(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Modalidad
                        <select
                          value={editModality}
                          onChange={(event) => {
                            const mod = event.target.value as "presencial" | "virtual";
                            setEditModality(mod);
                            const blocks = getTimeBlocksByModality(mod);
                            const first = blocks[0];
                            if (first && !blocks.some((b) => `${b.startTime}-${b.endTime}` === editTimeBlock)) {
                              setEditTimeBlock(`${first.startTime}-${first.endTime}`);
                            }
                            setEditClassroom((current) => {
                              const opts = getClassroomOptions(mod);
                              return opts.includes(current) ? current : (opts[0] ?? CLASSROOM_OPTIONS[0]);
                            });
                          }}
                          className="ui-control"
                        >
                          <option value="presencial">Presencial</option>
                          <option value="virtual">Virtual</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        {editModality === "virtual" ? "Sala virtual" : "Aula base"}
                        <select
                          value={editClassroom}
                          onChange={(event) => setEditClassroom(event.target.value)}
                          className="ui-control"
                        >
                          {getClassroomOptions(editModality).map((room) => (
                            <option key={room} value={room}>
                              {room}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
                        Horario base
                        <select
                          value={editTimeBlock}
                          onChange={(event) => setEditTimeBlock(event.target.value)}
                          className="ui-control"
                        >
                          {editTimeBlocks.map((block) => (
                            <option key={`${block.startTime}-${block.endTime}`} value={`${block.startTime}-${block.endTime}`}>
                              {block.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Inicio de vigencia (opcional)
                        <input
                          type="date"
                          value={editTermStart}
                          onChange={(event) => setEditTermStart(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Fin de vigencia (opcional)
                        <input
                          type="date"
                          value={editTermEnd}
                          onChange={(event) => setEditTermEnd(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => void onUpdateCourse(course.id)}
                          className="ui-btn ui-btn-primary h-9 px-4 text-sm"
                        >
                          Guardar cambios
                        </button>
                      </div>
                    </div>
                  )}

                  {!isProgrammed && !isEditing && (
                    <div className="mt-3 space-y-2">
                      {course.subjects.length === 0 ? (
                        <p className="text-xs text-[var(--ink-soft)]">Sin materias registradas.</p>
                      ) : (
                        course.subjects.map((subject) => (
                          <div
                            key={subject.id}
                            className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 md:grid-cols-[minmax(0,1fr)_280px] md:items-center"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--foreground)]">{subject.name}</p>
                              <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                                Profesor actual: {subject.teacherName || "Sin asignar"}
                              </p>
                            </div>
                            <div className="md:justify-self-end">
                              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                                Profesor asignado
                              </label>
                              <select
                                value={subject.teacherUserId ?? ""}
                                onChange={(event) => void onAssignTeacher(subject.id, event.target.value)}
                                className="ui-control md:w-[280px]"
                              >
                                <option value="">Sin asignar</option>
                                {getTeachersForSubject(subject.name, subject.teacherUserId).map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>
                                    {teacher.fullName}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {isProgrammed && !isEditing && course.subjects.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {course.subjects.map((subject) => (
                        <p key={subject.id} className="text-[11px] text-[var(--ink-soft)]">
                          {subject.name}: {subject.teacherName || "Sin asignar"}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "150ms" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Programar clase</p>
          <div className="mt-2 space-y-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
              Curso
              <select
                value={sessionCourseId}
                onChange={(event) => setSessionCourseId(event.target.value)}
                disabled={unprogrammedCourses.length === 0}
                className="ui-control"
              >
                {unprogrammedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} · Código: {course.sectionCode || "Sin código"} · Tipo: {course.code} · {course.modality} · {toTimeBlockLabel(course.scheduleStartTime, course.scheduleEndTime)}
                  </option>
                ))}
              </select>
            </label>

            {unprogrammedCourses.length === 0 ? (
              <p className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
                Todos los cursos ya fueron programados y se muestran en Sesiones programadas.
              </p>
            ) : null}

            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Lista de detalles</p>

            <div className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-[var(--foreground)]">
              {sessionCourse && isCourseTypePAA(sessionCourse.code) ? (
                <>
                  <p>
                    Profesor de Matemáticas: {sessionCourse.subjects.find((s) => s.name === "Matemáticas")?.teacherName || "Sin asignar"}
                  </p>
                  <p className="mt-1">
                    Profesor de Español: {sessionCourse.subjects.find((s) => s.name === "Español")?.teacherName || "Sin asignar"}
                  </p>
                </>
              ) : sessionCourse?.subjects[0] ? (
                <p>
                  {sessionCourse.subjects[0].name}: {sessionCourse.subjects[0].teacherName || "Sin asignar"}
                </p>
              ) : (
                <p className="text-[var(--ink-soft)]">Sin materia asignada</p>
              )}
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Horario: {sessionCourse ? toTimeBlockLabel(sessionCourse.scheduleStartTime, sessionCourse.scheduleEndTime) : "Sin definir"}
              </p>
              <p className="text-xs text-[var(--ink-soft)]">
                Aula: {sessionCourse?.classroom || "Sin definir"}
              </p>
            </div>

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Fecha
              <input
                type="date"
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
                className="ui-control"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Duración (semanas)
              <input
                type="number"
                min={1}
                max={52}
                value={sessionDurationWeeks}
                onChange={(event) => setSessionDurationWeeks(Number(event.target.value || 1))}
                className="ui-control"
              />
            </label>

            {sessionCourse && isCourseTypePAA(sessionCourse.code) ? (
              <>
                <button
                  type="button"
                  onClick={() => setStartWithDoubleMath((current) => !current)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-left text-sm text-[var(--foreground)] hover:border-white/30"
                >
                  {startWithDoubleMath
                    ? "Patrón: 2 semanas de Matemáticas y luego alterna"
                    : "Patrón: alternancia semanal Matemáticas/Español"}
                </button>
                <p className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
                  El sistema programará una sesión por semana alternando Matemáticas y Español con el horario y aula del curso.
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
                El sistema programará una sesión por semana con la misma materia y profesor en todas las fechas.
              </p>
            )}

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Notas (opcional)
              <input
                type="text"
                value={sessionNotes}
                onChange={(event) => setSessionNotes(event.target.value)}
                className="ui-control"
                placeholder="Observaciones"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onCreateSession}
            disabled={!sessionCourseId || unprogrammedCourses.length === 0}
            className="ui-btn ui-btn-primary mt-3 h-9 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Programar clase
          </button>
        </div>

        <div className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "180ms" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Coberturas pendientes</p>
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
            Sesiones con incidencia del profesor titular y sin suplente: {pendingCoverageCount}
          </p>
          <div className="mt-2 max-h-[420px] space-y-2 overflow-auto pr-1">
            {visibleSessions.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">No hay sesiones pendientes de cobertura.</p>
            ) : (
              visibleSessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {session.classDate} · {session.startTime.slice(0, 5)} - {session.endTime.slice(0, 5)}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                    {session.courseName} · Tipo: {session.courseCode}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {session.subjectName} · Titular: {session.teacherName}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    Modalidad: {session.courseModality ?? "presencial"} · Aula: {session.classroom}
                  </p>

                  {session.hasTitularIncidenceConflict ? (
                    <p className="mt-1 rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-900">
                      Incidencia detectada del titular para este bloque
                      {session.incidenceReason ? ` · Motivo: ${session.incidenceReason}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <select
                      value={coverageBySession[session.id] ?? ""}
                      onChange={(event) =>
                        setCoverageBySession((current) => ({
                          ...current,
                          [session.id]: event.target.value,
                        }))
                      }
                      className="ui-control"
                    >
                      <option value="">Selecciona quién cubrirá la sesión</option>
                      {teachers
                        .filter((teacher) => teacher.id !== session.teacherUserId)
                        .map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.fullName}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => void onAssignCoverage(session.id)}
                      className="ui-btn h-9 px-3 text-xs"
                    >
                      Guardar cobertura
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDeleteSession(session.id)}
                      className="h-9 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 text-xs text-[var(--danger)] hover:border-[var(--danger)]/60"
                    >
                      Eliminar
                    </button>
                  </div>

                  <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                    Responsable actual: {session.effectiveTeacherName || session.teacherName}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
