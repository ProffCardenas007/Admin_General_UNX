import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLASSROOM_OPTIONS,
  VIRTUAL_ROOM_OPTIONS,
  filterCoursesByText,
  getClassroomOptions,
  getTeachers,
  getTeachersForSubject,
  getTimeBlocksByModality,
  getUnprogrammedCourses,
  isCourseTypePAA,
  pendingCoverageSessions,
  planWeeklySessions,
  resolveCourseId,
  toLocalISODate,
  toTimeBlockLabel,
} from "./planning.ts";
import type { CourseRow, SessionRow, UserRow } from "./types.ts";

const user = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: "u1",
  fullName: "Ana",
  role: "worker",
  isActive: true,
  ...overrides,
});

const course = (overrides: Partial<CourseRow> = {}): CourseRow => ({
  id: "c1",
  code: "Curso",
  name: "Curso Integral A",
  sectionCode: "1A",
  modality: "presencial",
  classroom: "Aula 1",
  scheduleStartTime: "08:00:00",
  scheduleEndTime: "10:30:00",
  isActive: true,
  subjects: [],
  ...overrides,
});

const session = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
  classDate: "2026-10-14",
  startTime: "08:00:00",
  endTime: "10:30:00",
  classroom: "Aula 1",
  courseId: "c1",
  subjectId: "m1",
  teacherUserId: "u1",
  subjectName: "Matemáticas",
  courseCode: "Curso",
  courseName: "Curso Integral A",
  teacherName: "Ana",
  ...overrides,
});

describe("rooms and time blocks", () => {
  it("offers 10 classrooms or 11 virtual rooms", () => {
    assert.equal(getClassroomOptions("presencial"), CLASSROOM_OPTIONS);
    assert.equal(getClassroomOptions("virtual"), VIRTUAL_ROOM_OPTIONS);
    assert.equal(CLASSROOM_OPTIONS.length, 10);
    assert.equal(VIRTUAL_ROOM_OPTIONS.length, 11);
  });

  it("adds the evening block only for virtual courses", () => {
    assert.equal(getTimeBlocksByModality("presencial").length, 3);
    const virtual = getTimeBlocksByModality("virtual");
    assert.equal(virtual.length, 4);
    assert.deepEqual(virtual[3].startTime, "19:00");
  });

  it("returns a fresh array so callers cannot mutate the shared blocks", () => {
    getTimeBlocksByModality("presencial").pop();
    assert.equal(getTimeBlocksByModality("presencial").length, 3);
  });

  it("labels a block from API times that include seconds", () => {
    assert.equal(toTimeBlockLabel("08:00:00", "10:30:00"), "08:00 - 10:30");
  });
});

describe("course helpers", () => {
  it("only the Curso type is the two-subject PAA course", () => {
    assert.equal(isCourseTypePAA("Curso"), true);
    for (const other of ["Regularización", "Asesorías", "Examen"]) {
      assert.equal(isCourseTypePAA(other), false);
    }
  });

  it("finds courses without sessions", () => {
    const courses = [course({ id: "a" }), course({ id: "b" })];
    const left = getUnprogrammedCourses(courses, [session({ courseId: "a" })]);
    assert.deepEqual(left.map((c) => c.id), ["b"]);
  });

  it("filters by name or section code, ignoring case", () => {
    const courses = [course({ id: "a", name: "Integral A", sectionCode: "1A" }), course({ id: "b", name: "Verano", sectionCode: null })];
    assert.deepEqual(filterCoursesByText(courses, "integ").map((c) => c.id), ["a"]);
    assert.deepEqual(filterCoursesByText(courses, "1a").map((c) => c.id), ["a"]);
    assert.equal(filterCoursesByText(courses, "   ").length, 2);
    assert.equal(filterCoursesByText(courses, "zzz").length, 0);
  });

  it("keeps the picked course while it is available, else the first one", () => {
    const available = [course({ id: "a" }), course({ id: "b" })];
    assert.equal(resolveCourseId("b", available), "b");
    assert.equal(resolveCourseId("gone", available), "a");
    assert.equal(resolveCourseId(null, available), "a");
    assert.equal(resolveCourseId("a", []), "");
  });
});

describe("teachers", () => {
  const teachers = [
    user({ id: "t1", classSubjects: ["Matemáticas"] }),
    user({ id: "t2", classSubjects: ["Español"] }),
    user({ id: "t3" }),
  ];

  it("only active users can teach", () => {
    assert.deepEqual(
      getTeachers([user({ id: "a" }), user({ id: "b", isActive: false })]).map((t) => t.id),
      ["a"],
    );
  });

  it("prefers teachers tagged with the subject", () => {
    assert.deepEqual(getTeachersForSubject(teachers, "Matemáticas").map((t) => t.id), ["t1"]);
  });

  it("falls back to everyone when nobody is tagged", () => {
    assert.equal(getTeachersForSubject(teachers, "Química").length, 3);
  });

  it("keeps the currently assigned teacher selectable even if untagged", () => {
    assert.deepEqual(
      getTeachersForSubject(teachers, "Matemáticas", "t3").map((t) => t.id),
      ["t1", "t3"],
    );
  });

  it("ignores a current teacher that is no longer in the list", () => {
    assert.deepEqual(getTeachersForSubject(teachers, "Matemáticas", "ghost").map((t) => t.id), ["t1"]);
  });
});

describe("pending coverage", () => {
  it("lists sessions with a titular conflict that nobody covers", () => {
    const list = pendingCoverageSessions([
      session({ id: "a", hasTitularIncidenceConflict: true }),
      session({ id: "b", hasTitularIncidenceConflict: true, isCovered: true }),
      session({ id: "c" }),
    ]);
    assert.deepEqual(list.map((s) => s.id), ["a"]);
  });
});

describe("weekly session plan", () => {
  const math = { id: "m", teacherUserId: "tm", name: "Matemáticas" };
  const spanish = { id: "s", teacherUserId: "ts", name: "Español" };
  const names = (plan: ReturnType<typeof planWeeklySessions>) => plan!.map((p) => p.subject.name[0]).join("");

  it("alternates Matemáticas and Español week by week", () => {
    const plan = planWeeklySessions({ startDate: "2026-10-14", weeks: 6, subjects: [math, spanish], alternate: true, startWithDoubleMath: false });
    assert.equal(names(plan), "MEMEME");
  });

  it("with double math: two math weeks, then alternates starting with Español", () => {
    const plan = planWeeklySessions({ startDate: "2026-10-14", weeks: 7, subjects: [math, spanish], alternate: true, startWithDoubleMath: true });
    assert.equal(names(plan), "MMEMEME");
  });

  it("repeats the same subject for single-subject courses", () => {
    const plan = planWeeklySessions({ startDate: "2026-10-14", weeks: 3, subjects: [spanish], alternate: false, startWithDoubleMath: true });
    assert.equal(names(plan), "EEE");
  });

  it("steps exactly 7 days and crosses month and year ends", () => {
    const plan = planWeeklySessions({ startDate: "2026-12-17", weeks: 4, subjects: [math], alternate: false, startWithDoubleMath: false });
    assert.deepEqual(plan!.map((p) => p.classDate), ["2026-12-17", "2026-12-24", "2026-12-31", "2027-01-07"]);
  });

  it("keeps the weekday across a daylight-saving change", () => {
    // US clocks change on 2026-03-08 and 2026-11-01; Europe on 2026-03-29.
    for (const startDate of ["2026-03-02", "2026-10-26", "2026-03-23"]) {
      const plan = planWeeklySessions({ startDate, weeks: 6, subjects: [math], alternate: false, startWithDoubleMath: false })!;
      const weekdays = new Set(plan.map((p) => new Date(`${p.classDate}T12:00:00`).getDay()));
      assert.equal(weekdays.size, 1, startDate);
    }
  });

  it("returns null for an invalid start date and an empty plan for zero weeks", () => {
    assert.equal(planWeeklySessions({ startDate: "no-es-fecha", weeks: 3, subjects: [math], alternate: false, startWithDoubleMath: false }), null);
    assert.deepEqual(planWeeklySessions({ startDate: "2026-10-14", weeks: 0, subjects: [math], alternate: false, startWithDoubleMath: false }), []);
  });
});

describe("local dates", () => {
  it("formats the local day, not the UTC one", () => {
    assert.equal(toLocalISODate(new Date(2026, 9, 14, 23, 59)), "2026-10-14");
    assert.equal(toLocalISODate(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
  });
});
