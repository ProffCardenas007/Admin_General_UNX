// Pure rules for class planning. No React and no runtime imports, so they run
// under `npm test`.
import type { CourseRow, Modality, SessionRow, TimeBlock, UserRow } from "./types";

export const CLASSROOM_OPTIONS = Array.from({ length: 10 }, (_, index) => `Aula ${index + 1}`);
export const VIRTUAL_ROOM_OPTIONS = Array.from({ length: 11 }, (_, index) => `Sala ${index + 1}`);

export const getClassroomOptions = (modality: Modality) =>
  modality === "virtual" ? VIRTUAL_ROOM_OPTIONS : CLASSROOM_OPTIONS;

export const BASE_TIME_BLOCKS: TimeBlock[] = [
  { label: "8:00 am - 10:30 am", startTime: "08:00", endTime: "10:30" },
  { label: "11:00 am - 1:30 pm", startTime: "11:00", endTime: "13:30" },
  { label: "4:00 pm - 6:30 pm", startTime: "16:00", endTime: "18:30" },
];

export const VIRTUAL_EXTRA_BLOCK: TimeBlock = {
  label: "7:00 pm - 10:30 pm",
  startTime: "19:00",
  endTime: "22:30",
};

export const CLASS_TYPE_OPTIONS = ["Curso", "Regularización", "Asesorías", "Examen"] as const;

export const getTimeBlocksByModality = (modality: Modality) =>
  modality === "virtual" ? [...BASE_TIME_BLOCKS, VIRTUAL_EXTRA_BLOCK] : [...BASE_TIME_BLOCKS];

export const toTimeBlockLabel = (startTime: string, endTime: string) =>
  `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;

/** Local calendar day as YYYY-MM-DD (never UTC). */
export const toLocalISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Only the "Curso" type is the two-subject PAA course (Matemáticas + Español). */
export const isCourseTypePAA = (code: string) => code === "Curso";

/** People who can teach: active users of any role. */
export const getTeachers = (users: UserRow[]) => users.filter((user) => user.isActive);

/**
 * Prefer teachers tagged with this subject; fall back to everyone if no tags
 * match, so scheduling is not blocked when a teacher's subjects were never
 * captured. The currently assigned teacher always stays selectable.
 */
export const getTeachersForSubject = (
  teachers: UserRow[],
  subjectName: string,
  currentTeacherId?: string | null,
) => {
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

/** Courses that do not have any scheduled session yet. */
export const getUnprogrammedCourses = (courses: CourseRow[], sessions: SessionRow[]) => {
  const scheduled = new Set(sessions.map((session) => session.courseId));
  return courses.filter((course) => !scheduled.has(course.id));
};

/** Keeps the user's pick while it is still valid, otherwise the first available course. */
export const resolveCourseId = (picked: string | null, available: CourseRow[]) =>
  picked !== null && available.some((course) => course.id === picked)
    ? picked
    : (available[0]?.id ?? "");

export const filterCoursesByText = (courses: CourseRow[], text: string) => {
  if (!text.trim()) {
    return courses;
  }
  const query = text.toLowerCase();
  return courses.filter(
    (course) =>
      course.name.toLowerCase().includes(query) ||
      (course.sectionCode ?? "").toLowerCase().includes(query),
  );
};

export const pendingCoverageSessions = (sessions: SessionRow[]) =>
  sessions.filter((session) => session.hasTitularIncidenceConflict && !session.isCovered);

export type PlanSubject = { id: string; teacherUserId: string; name: string };
export type PlannedSession = { weekIndex: number; classDate: string; subject: PlanSubject };

/**
 * One session per week starting on `startDate`.
 * - Single-subject courses repeat the same subject.
 * - PAA courses alternate [math, spanish]. With `startWithDoubleMath` the first
 *   two weeks are math, then it alternates starting with Spanish.
 * Returns null when `startDate` is not a valid YYYY-MM-DD.
 */
export const planWeeklySessions = (input: {
  startDate: string;
  weeks: number;
  subjects: PlanSubject[];
  alternate: boolean;
  startWithDoubleMath: boolean;
}): PlannedSession[] | null => {
  const start = new Date(`${input.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const planned: PlannedSession[] = [];
  for (let weekIndex = 0; weekIndex < input.weeks; weekIndex += 1) {
    let subject: PlanSubject;
    if (input.alternate) {
      const [math, spanish] = input.subjects;
      const useMath = input.startWithDoubleMath
        ? weekIndex < 2
          ? true
          : (weekIndex - 2) % 2 === 1
        : weekIndex % 2 === 0;
      subject = useMath ? math : spanish;
    } else {
      subject = input.subjects[0];
    }

    // Local-date arithmetic so daylight-saving changes never shift the weekday.
    const classDate = new Date(start);
    classDate.setDate(start.getDate() + weekIndex * 7);
    planned.push({ weekIndex, classDate: toLocalISODate(classDate), subject });
  }

  return planned;
};
