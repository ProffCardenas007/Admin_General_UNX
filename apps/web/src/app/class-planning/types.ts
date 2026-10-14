export type UserRow = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
  isActive: boolean;
  classSubjects?: string[] | null;
};

export type SubjectRow = {
  id: string;
  courseId: string;
  name: string;
  teacherUserId?: string | null;
  teacherName?: string;
  displayOrder: number;
};

export type CourseRow = {
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

export type SessionRow = {
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

export type TimeBlock = {
  label: string;
  startTime: string;
  endTime: string;
};

export type Modality = "presencial" | "virtual";

export type TeacherImportResult = {
  fileName: string;
  totalRows: number;
  updatedUsers: number;
  skippedRows: number;
  availabilityProfiles: number;
  unchangedRows: number;
  parsedSessions: number;
  createdCourses: number;
  createdSessions: number;
  updatedSessions: number;
  unchangedSessions: number;
  removedSessions: number;
  removedCourses: number;
  scheduleWarnings: string[];
  failedRows: number;
  rows: Array<{
    fullName: string;
    matched: boolean;
    changed: boolean;
    email?: string;
    subjects: string[];
  }>;
  errors: Array<{ rowNumber: number; message: string }>;
};

/** Shared by every panel to report outcomes in the page header. */
export type PlanningNotify = {
  error: (message: string) => void;
  info: (message: string) => void;
  /** Clears both messages, like starting a new action. */
  clear: () => void;
};
