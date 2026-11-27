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
