import * as ExcelJS from 'exceljs';

export type PlanningTeacher = {
  fullName: string;
  subject: string;
};

export type ParsedPlanningSession = {
  classDate: string;
  startTime: string;
  endTime: string;
  classroom: string;
  modality: 'presencial' | 'virtual';
  courseCode: 'Curso' | 'Regularización' | 'Asesorías' | 'Examen';
  courseName: string;
  teacherName: string;
  subjectName: string;
  sourceText: string;
};

type CalendarEntry = {
  week: number;
  dayOffset: number;
  startMinutes: number;
  endMinutes: number;
  classroom: string;
  teacherIdentity: string;
  sourceText: string;
};

type ParsedAssignment = {
  teacher: PlanningTeacher;
  subjectName: string;
  courseName: string;
  courseCode: ParsedPlanningSession['courseCode'];
};

type GridBlock = {
  startRow: number;
  endRow: number;
  startMinutes: number;
  endMinutes: number;
  sourceText: string;
};

const TIME_ROW_PATTERN = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/;
const WEEK_PATTERN = /^semana\s+(\d+):/;
const IGNORED_TOKENS = new Set([
  'paa',
  'mat',
  'matematicas',
  'espanol',
  'presencial',
  'virtual',
  'aula',
  'sala',
  'area',
  'sesion',
  'sabatina',
  'sabatino',
  'curso',
]);

export function parseClassPlanningWorkbook(
  workbook: ExcelJS.Workbook,
  teachers: PlanningTeacher[],
) {
  const weekDates = parseWeekDates(workbook);
  const calendarEntries = parseTeacherCalendars(workbook, teachers);
  const warnings: string[] = [];
  const detailedSessions = [
    ...parseWeekdayGrid(
      workbook,
      teachers,
      weekDates,
      calendarEntries,
      warnings,
    ),
    ...parseWeekendGrid(workbook, teachers, weekDates, warnings),
  ];
  const parsed = [
    ...parseRolGeneral(
      workbook,
      teachers,
      weekDates,
      findWeeksForSessions(detailedSessions, weekDates),
      warnings,
    ),
    ...detailedSessions,
  ];

  const sessionsBySlot = new Map<string, ParsedPlanningSession>();
  parsed.forEach((session) => {
    const slotKey = [
      session.classDate,
      session.startTime,
      session.endTime,
      normalizeIdentity(session.classroom),
    ].join('|');
    const current = sessionsBySlot.get(slotKey);

    if (current && current.sourceText !== session.sourceText) {
      warnings.push(
        `Conflicto en ${session.classDate} ${session.startTime}-${session.endTime} ${session.classroom}`,
      );
      return;
    }

    sessionsBySlot.set(slotKey, session);
  });

  return {
    sessions: [...sessionsBySlot.values()].sort((left, right) =>
      `${left.classDate}-${left.startTime}-${left.classroom}`.localeCompare(
        `${right.classDate}-${right.startTime}-${right.classroom}`,
      ),
    ),
    warnings: [...new Set(warnings)],
  };
}

function parseWeekDates(workbook: ExcelJS.Workbook) {
  const sheet = workbook.worksheets.find(
    (candidate) => normalizeIdentity(candidate.name) === 'rol general',
  );
  const dates = new Map<number, Date>();
  if (!sheet) return dates;

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const week = Number(cellText(sheet.getCell(rowNumber, 4)));
    const date = cellDate(sheet.getCell(rowNumber, 3));
    if (Number.isInteger(week) && week > 0 && date && !dates.has(week)) {
      dates.set(week, date);
    }
  }

  return dates;
}

function parseTeacherCalendars(
  workbook: ExcelJS.Workbook,
  teachers: PlanningTeacher[],
) {
  const entries: CalendarEntry[] = [];

  teachers.forEach((teacher) => {
    const sheet = workbook.worksheets.find(
      (candidate) =>
        normalizeIdentity(candidate.name) === normalizeIdentity(teacher.fullName),
    );
    if (!sheet) return;

    for (let headingRow = 1; headingRow <= sheet.rowCount; headingRow += 1) {
      const weekMatch = normalizeIdentity(
        cellText(sheet.getCell(headingRow, 3)),
      ).match(WEEK_PATTERN);
      if (!weekMatch) continue;

      const firstTimeRow = headingRow + 2;
      const lastTimeRow = findLastTimeRow(sheet, firstTimeRow);
      if (lastTimeRow < firstTimeRow) continue;

      for (let dayColumn = 3; dayColumn <= 7; dayColumn += 1) {
        groupGridBlocks(sheet, dayColumn, firstTimeRow, lastTimeRow).forEach(
          (block) => {
            if (!parseClassroom(block.sourceText)) return;
            entries.push({
              week: Number(weekMatch[1]),
              dayOffset: dayColumn - 3,
              startMinutes: block.startMinutes,
              endMinutes: block.endMinutes,
              classroom: normalizeClassroom(parseClassroom(block.sourceText)),
              teacherIdentity: normalizeIdentity(teacher.fullName),
              sourceText: block.sourceText,
            });
          },
        );
      }
    }
  });

  return entries;
}

function parseRolGeneral(
  workbook: ExcelJS.Workbook,
  teachers: PlanningTeacher[],
  weekDates: Map<number, Date>,
  detailedWeeks: Set<number>,
  warnings: string[],
) {
  const sheet = workbook.worksheets.find(
    (candidate) => normalizeIdentity(candidate.name) === 'rol general',
  );
  if (!sheet) {
    warnings.push('No se encontró la hoja Rol General');
    return [];
  }

  const sessions: ParsedPlanningSession[] = [];

  for (let timeRow = 1; timeRow <= sheet.rowCount; timeRow += 1) {
    const timeRange = parseMeridiemTimeRange(cellText(sheet.getCell(timeRow, 5)));
    if (!timeRange) continue;

    const roomRow = timeRow + 2;
    for (let rowNumber = roomRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const week = Number(cellText(sheet.getCell(rowNumber, 4)));
      if (!Number.isInteger(week)) break;
      if (week <= 0 || detailedWeeks.has(week)) continue;

      const monday = weekDates.get(week);
      if (!monday) {
        warnings.push(`No se encontró fecha para la semana ${week}`);
        continue;
      }

      for (let column = 5; column <= sheet.columnCount; column += 2) {
        const courseText = cleanWhitespace(cellText(sheet.getCell(rowNumber, column)));
        const teacherText = cleanWhitespace(
          cellText(sheet.getCell(rowNumber, column + 1)),
        );
        if (!courseText || !teacherText) continue;

        const classroom = normalizeClassroom(cellText(sheet.getCell(roomRow, column)));
        if (!classroom) continue;
        const sourceText = `${courseText} // ${teacherText}`;
        const assignment = parseAssignment(sourceText, teachers);
        if (!assignment) {
          warnings.push(`Profesor no reconocido: ${sourceText}`);
          continue;
        }

        const block: GridBlock = {
          startRow: rowNumber,
          endRow: rowNumber,
          startMinutes: timeRange.startMinutes,
          endMinutes: timeRange.endMinutes,
          sourceText,
        };
        [0, 1, 2, 3, 4].forEach((dayOffset) => {
          sessions.push(
            buildSession(monday, dayOffset, block, classroom, assignment, true),
          );
        });
      }
    }
  }
  return sessions;
}

function findWeeksForSessions(
  sessions: ParsedPlanningSession[],
  weekDates: Map<number, Date>,
) {
  const weeks = new Set<number>();
  sessions.forEach((session) => {
    const sessionDate = new Date(`${session.classDate}T00:00:00.000Z`).getTime();
    for (const [week, monday] of weekDates) {
      const weekStart = new Date(monday).setUTCHours(0, 0, 0, 0);
      if (sessionDate >= weekStart && sessionDate < weekStart + 7 * 86_400_000) {
        weeks.add(week);
        break;
      }
    }
  });
  return weeks;
}

function parseWeekdayGrid(
  workbook: ExcelJS.Workbook,
  teachers: PlanningTeacher[],
  weekDates: Map<number, Date>,
  calendarEntries: CalendarEntry[],
  warnings: string[],
) {
  const sheet = workbook.worksheets.find(
    (candidate) => normalizeIdentity(candidate.name) === 'lunes a viernes',
  );
  if (!sheet) {
    warnings.push('No se encontró la hoja Lunes a Viernes');
    return [];
  }

  const sessions: ParsedPlanningSession[] = [];
  for (let headingRow = 1; headingRow <= sheet.rowCount; headingRow += 1) {
    const weekMatch = normalizeIdentity(
      cellText(sheet.getCell(headingRow, 3)),
    ).match(WEEK_PATTERN);
    if (!weekMatch) continue;

    const week = Number(weekMatch[1]);
    const monday = weekDates.get(week);
    if (!monday) {
      warnings.push(`No se encontró fecha para la semana ${week}`);
      continue;
    }

    const roomRow = headingRow + 2;
    const firstTimeRow = headingRow + 3;
    const lastTimeRow = findLastTimeRow(sheet, firstTimeRow);

    for (let column = 3; column <= sheet.columnCount; column += 1) {
      const classroom = normalizeClassroom(cellText(sheet.getCell(roomRow, column)));
      if (!classroom) continue;

      groupGridBlocks(sheet, column, firstTimeRow, lastTimeRow).forEach((block) => {
        const assignment = parseAssignment(block.sourceText, teachers);
        if (!assignment) {
          warnings.push(`Profesor no reconocido: ${block.sourceText}`);
          return;
        }

        const dayOffsets = findAssignedWeekdays(
          week,
          block,
          assignment,
          calendarEntries,
        );
        if (dayOffsets.length === 0) {
          warnings.push(`Día no reconocido: ${block.sourceText} (semana ${week})`);
          return;
        }

        dayOffsets.forEach((dayOffset) => {
          sessions.push(
            buildSession(
              monday,
              dayOffset,
              block,
              classroom,
              assignment,
            ),
          );
        });
      });
    }
  }

  return sessions;
}

function parseWeekendGrid(
  workbook: ExcelJS.Workbook,
  teachers: PlanningTeacher[],
  weekDates: Map<number, Date>,
  warnings: string[],
) {
  const sheet = workbook.worksheets.find(
    (candidate) => normalizeIdentity(candidate.name) === 'fin de semana',
  );
  if (!sheet) {
    warnings.push('No se encontró la hoja Fin de Semana');
    return [];
  }

  const sessions: ParsedPlanningSession[] = [];
  let currentWeek: number | null = null;

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const firstText = firstNonEmptyText(sheet, rowNumber);
    const weekMatch = normalizeIdentity(firstText).match(WEEK_PATTERN);
    if (weekMatch) {
      currentWeek = Number(weekMatch[1]);
      continue;
    }

    const dayText = normalizeIdentity(firstText);
    const dayOffset = dayText.startsWith('sabado')
      ? 5
      : dayText.startsWith('domingo')
        ? 6
        : null;
    if (dayOffset === null || currentWeek === null) continue;

    const monday = weekDates.get(currentWeek);
    if (!monday) continue;
    const roomRow = rowNumber + 2;
    const firstTimeRow = rowNumber + 3;
    const lastTimeRow = findLastTimeRow(sheet, firstTimeRow);

    for (let column = 3; column <= sheet.columnCount; column += 1) {
      const classroom = normalizeClassroom(cellText(sheet.getCell(roomRow, column)));
      if (!classroom) continue;

      groupGridBlocks(sheet, column, firstTimeRow, lastTimeRow).forEach((block) => {
        const assignment = parseAssignment(block.sourceText, teachers);
        if (!assignment) {
          warnings.push(`Profesor no reconocido: ${block.sourceText}`);
          return;
        }
        sessions.push(
          buildSession(monday, dayOffset, block, classroom, assignment),
        );
      });
    }
  }

  return sessions;
}

function groupGridBlocks(
  sheet: ExcelJS.Worksheet,
  column: number,
  firstTimeRow: number,
  lastTimeRow: number,
) {
  const blocks: GridBlock[] = [];
  let rowNumber = firstTimeRow;

  while (rowNumber <= lastTimeRow) {
    const sourceText = cleanWhitespace(cellText(sheet.getCell(rowNumber, column)));
    if (!sourceText) {
      rowNumber += 1;
      continue;
    }

    let endRow = rowNumber;
    while (
      endRow + 1 <= lastTimeRow &&
      cleanWhitespace(cellText(sheet.getCell(endRow + 1, column))) === sourceText
    ) {
      endRow += 1;
    }

    blocks.push({
      startRow: rowNumber,
      endRow,
      startMinutes: 7 * 60 + (rowNumber - firstTimeRow) * 30,
      endMinutes: 7 * 60 + (endRow - firstTimeRow + 1) * 30,
      sourceText,
    });
    rowNumber = endRow + 1;
  }

  return blocks;
}

function findAssignedWeekdays(
  week: number,
  block: GridBlock,
  assignment: ParsedAssignment,
  calendarEntries: CalendarEntry[],
) {
  const candidates = calendarEntries.filter(
    (entry) =>
      entry.week === week &&
      entry.teacherIdentity === normalizeIdentity(assignment.teacher.fullName) &&
      haveMatchingTimeRange(entry, block),
  );
  const sourceTokens = meaningfulTokens(block.sourceText);

  return [
    ...new Set(
      candidates
        .filter(
          (candidate) =>
            tokenSimilarity(sourceTokens, meaningfulTokens(candidate.sourceText)) >=
            0.5,
        )
        .map((candidate) => candidate.dayOffset),
    ),
  ];
}

function parseAssignment(
  sourceText: string,
  teachers: PlanningTeacher[],
): ParsedAssignment | null {
  const normalized = normalizeIdentity(sourceText);
  const matches = teachers
    .map((teacher) => ({
      teacher,
      index: normalized.indexOf(normalizeIdentity(teacher.fullName)),
    }))
    .filter((match) => match.index >= 0)
    .sort(
      (left, right) =>
        left.index - right.index ||
        right.teacher.fullName.length - left.teacher.fullName.length,
    );
  const match = matches[0];
  if (!match) return null;

  const subjectName = normalized.includes('espanol')
    ? 'Español'
    : normalized.includes('matematic')
      ? 'Matemáticas'
      : match.teacher.subject;
  let courseName =
    sourceText.slice(0, match.index) +
    sourceText.slice(match.index + match.teacher.fullName.length);
  courseName = courseName
    .replace(/\([^)]*\)/g, ' ')
    .replace(/PAA\s*\/\//gi, ' ')
    .replace(/\b(Matemáticas|Matematicas|Español|Espanol)\b/gi, ' ')
    .replace(/\b(Presencial|Virtual)\b/gi, ' ')
    .replace(/\bSabatino\b/gi, ' ')
    .replace(/\bSesión\s+\d+\b/gi, ' ')
    .replace(/\b\d{1,2}\s*-\s*\d{1,2}:\d{2}\b/g, ' ');
  courseName = cleanWhitespace(courseName).replace(/^\/\/|\/\/$/g, '').trim();
  if (!courseName) courseName = 'Clase importada';

  const normalizedCourse = normalizeIdentity(courseName);
  const courseCode = normalizedCourse.includes('regularizacion')
    ? 'Regularización'
    : normalizedCourse.includes('asesoria')
      ? 'Asesorías'
      : normalizedCourse.includes('examen') ||
          normalizedCourse.includes('aplicacion')
        ? 'Examen'
        : 'Curso';

  return {
    teacher: match.teacher,
    subjectName,
    courseName: courseName.slice(0, 160),
    courseCode,
  };
}

function buildSession(
  monday: Date,
  dayOffset: number,
  block: GridBlock,
  classroom: string,
  assignment: ParsedAssignment,
  isDerived = false,
): ParsedPlanningSession {
  const date = new Date(monday);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return {
    classDate: date.toISOString().slice(0, 10),
    startTime: minutesToTime(block.startMinutes),
    endTime: minutesToTime(block.endMinutes),
    classroom,
    modality: normalizeIdentity(classroom).startsWith('sala')
      ? 'virtual'
      : 'presencial',
    courseCode: assignment.courseCode,
    courseName: assignment.courseName,
    teacherName: assignment.teacher.fullName,
    subjectName: assignment.subjectName,
    sourceText: isDerived
      ? `Programación derivada de Rol General: ${block.sourceText}`
      : block.sourceText,
  };
}

function parseMeridiemTimeRange(value: string) {
  const match = normalizeIdentity(value).match(
    /^(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)$/,
  );
  if (!match) return null;

  return {
    startMinutes: meridiemToMinutes(Number(match[1]), Number(match[2]), match[3]),
    endMinutes: meridiemToMinutes(Number(match[4]), Number(match[5]), match[6]),
  };
}

function meridiemToMinutes(hour: number, minute: number, meridiem: string) {
  const normalizedHour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  return normalizedHour * 60 + minute;
}

function parseClassroom(value: string) {
  const match = normalizeIdentity(value).match(/\b(aula|sala|area)\s*(\d+)\b/);
  return match ? `${match[1]} ${match[2]}` : '';
}

function normalizeClassroom(value: string) {
  const parsed = parseClassroom(value);
  if (!parsed) return '';
  const [kind, number] = parsed.split(' ');
  const label = kind === 'sala' ? 'Sala' : kind === 'area' ? 'Área' : 'Aula';
  return `${label} ${number}`;
}

function findLastTimeRow(sheet: ExcelJS.Worksheet, firstTimeRow: number) {
  let lastTimeRow = firstTimeRow - 1;
  while (
    lastTimeRow + 1 <= sheet.rowCount &&
    TIME_ROW_PATTERN.test(cellText(sheet.getCell(lastTimeRow + 1, 2)).trim())
  ) {
    lastTimeRow += 1;
  }
  return lastTimeRow;
}

function firstNonEmptyText(sheet: ExcelJS.Worksheet, rowNumber: number) {
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const value = cleanWhitespace(cellText(sheet.getCell(rowNumber, column)));
    if (value) return value;
  }
  return '';
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && 'richText' in value) {
    return value.richText.map((item) => item.text).join('').trim();
  }
  if (value && typeof value === 'object' && 'result' in value) {
    return String(value.result ?? '').trim();
  }

  try {
    return cell.text.trim();
  } catch {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  }
}

function cellDate(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'result' in value) {
    return value.result instanceof Date ? value.result : null;
  }
  return null;
}

function meaningfulTokens(value: string) {
  return new Set(
    normalizeIdentity(value)
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token)),
  );
}

function tokenSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / Math.min(left.size, right.size);
}

function haveMatchingTimeRange(
  left: Pick<CalendarEntry, 'startMinutes' | 'endMinutes'>,
  right: Pick<GridBlock, 'startMinutes' | 'endMinutes'>,
) {
  const overlap =
    Math.min(left.endMinutes, right.endMinutes) -
    Math.max(left.startMinutes, right.startMinutes);
  const shorterDuration = Math.min(
    left.endMinutes - left.startMinutes,
    right.endMinutes - right.startMinutes,
  );
  return overlap > 0 && overlap >= shorterDuration * 0.5;
}

function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const minute = (minutes % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

function cleanWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeIdentity(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}