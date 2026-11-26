import assert from "node:assert/strict";
import test from "node:test";
import {
  computeItemMetrics,
  courseSummaries,
  EMPTY_FILTERS,
  filterItems,
  summarize,
} from "./materialMath.ts";
import type { MaterialGroup, MaterialItem } from "./types.ts";

const group = (id: string, courseKey: string, students: number, extra: Partial<MaterialGroup> = {}): MaterialGroup => ({
  id,
  program: "PAA",
  courseKey,
  courseLabel: courseKey,
  venue: null,
  students,
  enrolled: null,
  counts: true,
  position: 0,
  ...extra,
});

const item = (id: string, extra: Partial<MaterialItem> = {}): MaterialItem => ({
  id,
  program: "PAA",
  kind: "M. Clase Matemáticas",
  version: "V2",
  module: "1",
  available: null,
  printQty: null,
  notes: null,
  doNotUse: false,
  disposition: null,
  reviewed: false,
  position: 0,
  groupIds: [],
  ...extra,
});

const groups = [group("a", "integral", 300), group("b", "radical", 200), group("c", "evento", 100, { counts: false })];
const byId = new Map(groups.map((g) => [g.id, g]));

test("la demanda suma solo los grupos que cuentan", () => {
  const metrics = computeItemMetrics(item("1", { groupIds: ["a", "b", "c"], available: 600 }), byId);
  assert.equal(metrics.required, 500);
  assert.equal(metrics.balance, 100);
  assert.equal(metrics.status, "cubierto");
});

test("final proyectado = inventario - demanda + impresión", () => {
  const metrics = computeItemMetrics(item("1", { groupIds: ["a"], available: 100, printQty: 150 }), byId);
  assert.equal(metrics.balance, -200);
  assert.equal(metrics.projected, -50);
  assert.equal(metrics.status, "insuficiente");
});

test("sin impresión y con faltante pide pedido", () => {
  const metrics = computeItemMetrics(item("1", { groupIds: ["a"], available: 10 }), byId);
  assert.equal(metrics.status, "sin_pedido");
});

test("sin grupos y no usar tienen su propio estado", () => {
  assert.equal(computeItemMetrics(item("1", { available: 50 }), byId).status, "sin_grupos");
  assert.equal(computeItemMetrics(item("1", { groupIds: ["a"], doNotUse: true }), byId).status, "no_usar");
});

test("filtra por curso, texto sin acentos y oculta 'no usar'", () => {
  const items = [
    item("1", { groupIds: ["a"], kind: "Reg. Español" }),
    item("2", { groupIds: ["b"] }),
    item("3", { groupIds: ["a"], doNotUse: true }),
  ];
  assert.deepEqual(
    filterItems(items, groups, { ...EMPTY_FILTERS, courseKey: "integral" }).map((i) => i.id),
    ["1"],
  );
  assert.deepEqual(
    filterItems(items, groups, { ...EMPTY_FILTERS, search: "espanol" }).map((i) => i.id),
    ["1"],
  );
  assert.deepEqual(
    filterItems(items, groups, { ...EMPTY_FILTERS, showDoNotUse: true, courseKey: "integral" }).map((i) => i.id),
    ["1", "3"],
  );
});

test("resumen ignora 'no usar' y suma el faltante", () => {
  const items = [
    item("1", { groupIds: ["a"], available: 100, printQty: 0, reviewed: true }),
    item("2", { groupIds: ["a"], available: 400, printQty: 20 }),
    item("3", { groupIds: ["a"], doNotUse: true }),
  ];
  const totals = summarize(items, groups);
  assert.equal(totals.items, 2);
  assert.equal(totals.needAttention, 1);
  assert.equal(totals.shortage, 200);
  assert.equal(totals.toPrint, 20);
  assert.equal(totals.reviewed, 1);
});

test("agrupa sedes bajo un mismo curso", () => {
  const summaries = courseSummaries([
    group("a", "integral", 300, { position: 0, venue: "Virtual" }),
    group("b", "integral", 100, { position: 1, venue: "Presencial" }),
    group("c", "radical", 50, { position: 2 }),
  ]);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].students, 400);
  assert.equal(summaries[0].groups.length, 2);
});

test("separa presencial de virtual por la sede del grupo", async () => {
  const { groupModality } = await import("./materialMath.ts");
  const mixed = [
    group("p", "integral", 100, { venue: "Presencial · Medicina" }),
    group("v", "integral", 200, { venue: "Virtual" }),
  ];
  assert.equal(groupModality(mixed[0]), "presencial");
  assert.equal(groupModality(mixed[1]), "virtual");
  assert.equal(groupModality({ venue: null }), null);
});

test("describeStart dice cuándo empieza el curso", async () => {
  const { describeStart, formatDateLong, localToday } = await import("./materialMath.ts");
  assert.deepEqual(describeStart(null, "2026-11-18"), { text: "Sin fecha de inicio", tone: "none" });
  assert.deepEqual(describeStart("2026-11-30", "2026-11-18"), { text: "Empieza en 12 días", tone: "upcoming" });
  assert.deepEqual(describeStart("2026-11-19", "2026-11-18"), { text: "Empieza mañana", tone: "upcoming" });
  assert.deepEqual(describeStart("2026-11-18", "2026-11-18"), { text: "Empieza hoy", tone: "today" });
  assert.deepEqual(describeStart("2026-11-17", "2026-11-18"), { text: "Empezó ayer", tone: "started" });
  assert.deepEqual(describeStart("2026-11-10", "2026-11-18"), { text: "Inició hace 8 días", tone: "started" });
  assert.equal(formatDateLong("2026-11-30"), "lun 30 nov 2026");
  assert.equal(localToday(new Date(2026, 0, 5)), "2026-01-05");
});

test("weekPosition numera las semanas desde la primera", async () => {
  const { weekPosition } = await import("./materialMath.ts");
  assert.deepEqual(weekPosition("2026-04-05", "2026-04-05", "2026-05-17"), { index: 1, total: 7 });
  assert.deepEqual(weekPosition("2026-05-17", "2026-04-05", "2026-05-17"), { index: 7, total: 7 });
  assert.deepEqual(weekPosition("2026-04-19", "2026-04-05", "2026-05-17"), { index: 3, total: 7 });
});

test("weekBucket agrupa viernes y domingo de la misma semana", async () => {
  const { weekBucket, daysBetween } = await import("./materialMath.ts");
  assert.equal(weekBucket("2026-02-15"), "2026-02-15");
  assert.equal(weekBucket("2026-02-20"), "2026-02-15");
  assert.equal(weekBucket("2026-02-21"), "2026-02-15");
  assert.equal(weekBucket("2026-02-22"), "2026-02-22");
  assert.equal(daysBetween("2026-02-15", "2026-03-01"), 14);
});

test("importación: lee encabezados en cualquier orden y detecta errores", async () => {
  const { parseImportText } = await import("./materialMath.ts");
  const parsed = parseImportText("Módulo\tMaterial\tDisponible\n1\tM. Clase\t1,200\n2\t\t5\n3\tM. Clase\tabc\n");
  assert.deepEqual(parsed.rows, [{ module: "1", kind: "M. Clase", available: 1200 }]);
  assert.equal(parsed.errors.length, 2);
  const plain = parseImportText("Reg. Español;V2;4;300;50");
  assert.deepEqual(plain.rows, [{ kind: "Reg. Español", version: "V2", module: "4", available: 300, printQty: 50 }]);
});

test("importación: vista previa crea, actualiza y suma", async () => {
  const { previewImport } = await import("./materialMath.ts");
  const existing = [{ program: "PAA" as const, kind: "M. Clase", version: "V2", module: "1", available: 100, printQty: null, notes: null, doNotUse: false }];
  const rows = [
    { kind: "m. clase", version: "v2", module: "1", available: 50 },
    { kind: "Nuevo", available: 10 },
  ];
  const replace = previewImport(rows, existing, "replace");
  assert.deepEqual([replace[0].action, replace[0].after, replace[1].action], ["update", 50, "create"]);
  const add = previewImport(rows, existing, "add");
  assert.equal(add[0].after, 150);
});

test("importación: columnas Programa, No usar y Nota", async () => {
  const { parseImportText, previewImport } = await import("./materialMath.ts");
  const text = ["Programa\tMaterial\tMódulo\tVersión\tDisponible\tNo usar\tNota", "EXANI\tExamen\t1\tV1\t240\tSí\tviejo", "PAA\tM. Clase\t1\tV2\t5\t\t"].join("\n");
  const parsed = parseImportText(text);
  assert.deepEqual(parsed.rows[0], { program: "EXANI", kind: "Examen", module: "1", version: "V1", available: 240, doNotUse: true, notes: "viejo" });
  assert.equal(parsed.rows[1].doNotUse, false);
  const existing = [{ program: "PAA" as const, kind: "M. Clase", version: "V2", module: "1", available: 5, printQty: null, notes: null, doNotUse: true }];
  const preview = previewImport(parsed.rows, existing, "replace");
  assert.equal(preview[0].action, "create");
  assert.equal(preview[1].action, "update"); // se quita la marca "No usar"
});

test("insumos: demanda = piezas por alumno x alumnos que cuentan", async () => {
  const { computeSupplyMetrics } = await import("./materialMath.ts");
  const supplies = [
    { id: "lapiz", available: 500 },
    { id: "termo", available: 100 },
    { id: "libreta", available: null },
    { id: "huerfano", available: 10 },
  ];
  const kits = [
    { program: "PAA" as const, courseKey: "integral", item: "Lápices", qty: 2, supplyId: "lapiz" },
    { program: "PAA" as const, courseKey: "radical", item: "Lápices", qty: 1, supplyId: "lapiz" },
    { program: "PAA" as const, courseKey: "integral", item: "Termo", qty: 1, supplyId: "termo" },
    { program: "PAA" as const, courseKey: "integral", item: "Libreta", qty: 1, supplyId: "libreta" },
    { program: "PAA" as const, courseKey: "integral", item: "Vaso", qty: 0, supplyId: "huerfano" },
  ];
  const groupsForSupplies = [
    { program: "PAA" as const, courseKey: "integral", courseLabel: "Integral", students: 200, counts: true },
    { program: "PAA" as const, courseKey: "integral", courseLabel: "Integral", students: 50, counts: false },
    { program: "PAA" as const, courseKey: "radical", courseLabel: "Radical", students: 100, counts: true },
  ];
  const result = computeSupplyMetrics(supplies, kits, groupsForSupplies);
  assert.equal(result.get("lapiz")?.required, 500); // 2x200 + 1x100
  assert.equal(result.get("lapiz")?.status, "cubierto");
  assert.equal(result.get("termo")?.balance, -100);
  assert.equal(result.get("termo")?.status, "insuficiente");
  assert.equal(result.get("libreta")?.status, "sin_dato");
  assert.equal(result.get("huerfano")?.status, "sin_uso".replace("sin_uso", "cubierto")); // vinculado pero con 0 piezas por alumno
});

test("insumos: lo entregado baja lo pendiente y define cuánto comprar", async () => {
  const { computeSupplyControl } = await import("./materialMath.ts");
  const move = (type: "entry" | "delivery" | "exit" | "adjust", quantity: number, movementDate: string, unitCost: number | null = null) => ({
    supplyId: "lapiz",
    type,
    quantity,
    movementDate,
    unitCost,
    createdAt: `${movementDate}T12:00:00Z`,
  });
  const movements = [
    move("entry", 100, "2026-01-10", 3),
    move("delivery", 200, "2026-02-01"),
    move("exit", 5, "2026-02-02"),
    move("entry", 50, "2026-03-01", 4),
    move("adjust", -2, "2026-03-02"),
    { ...move("delivery", 999, "2026-02-01"), supplyId: "otro" },
  ];
  const supply = { id: "lapiz", available: 100, minStock: 20 };

  const all = computeSupplyControl(supply, 500, true, movements);
  assert.equal(all.entries, 150);
  assert.equal(all.exits, 205);
  assert.equal(all.pending, 300); // 500 - 200 entregados; la otra salida no cuenta
  assert.equal(all.toBuy, 220); // 300 + 20 - 100
  assert.equal(all.status, "comprar");
  assert.equal(all.lastCost, 4);

  const cycle = computeSupplyControl(supply, 500, true, movements, "2026-03-01");
  assert.equal(cycle.entries, 50);
  assert.equal(cycle.pending, 500); // la entrega fue antes del ciclo

  assert.equal(computeSupplyControl({ id: "x", available: 5, minStock: null }, 0, false, movements).status, "sin_uso");
  assert.equal(computeSupplyControl({ id: "x", available: 5, minStock: 10 }, 0, false, movements).toBuy, 5);
  assert.equal(computeSupplyControl({ id: "x", available: null, minStock: null }, 10, true, movements).status, "sin_dato");
});

test("importacion: Programa Insumo y PIENSE", async () => {
  const { parseImportText, previewImport } = await import("./materialMath.ts");
  const text = ["Programa\tMaterial\tMódulo\tDisponible", "Insumo\tLápiz\t\t7000", "PIENSE\tExamen Simulacro\t1\t1014"].join("\n");
  const parsed = parseImportText(text);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows[0].program, "INSUMO");
  assert.equal(parsed.rows[1].program, "PIENSE");
  const preview = previewImport(parsed.rows, [], "replace", "PAA", [{ name: "lapiz", available: 6724 }]);
  assert.equal(preview[0].action, "update");
  assert.equal(preview[0].before, 6724);
  assert.equal(preview[1].action, "create");
});

test("material retirado: cuenta piezas y lo que falta por decidir", async () => {
  const { summarizeRetired } = await import("./materialMath.ts");
  const totals = summarizeRetired([
    { doNotUse: true, available: 250, disposition: null },
    { doNotUse: true, available: 100, disposition: "donar" },
    { doNotUse: true, available: null, disposition: null },
    { doNotUse: false, available: 999, disposition: null }, // en uso: no cuenta
  ]);
  assert.deepEqual(totals, { items: 3, pieces: 350, pending: 2, pendingPieces: 250 });
});

test("libre hoy = disponible - inscritos; la proyección usa el mayor por grupo", () => {
  const live = new Map([
    ["a", group("a", "integral", 300, { enrolled: 350 })],
    ["b", group("b", "radical", 200)],
  ]);
  const metrics = computeItemMetrics(item("1", { groupIds: ["a", "b"], available: 400, printQty: 100 }), live);
  assert.equal(metrics.enrolled, 350);
  assert.equal(metrics.freeToday, 50);
  assert.equal(metrics.required, 500);
  assert.equal(metrics.demand, 550);
  assert.equal(metrics.toOrder, 50);
  assert.equal(metrics.overEnrolled, true);
});

test("sin inscritos capturados no hay libre hoy", () => {
  const metrics = computeItemMetrics(item("1", { groupIds: ["a"], available: 400 }), byId);
  assert.equal(metrics.enrolled, null);
  assert.equal(metrics.freeToday, null);
});
