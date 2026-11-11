import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildImport,
  buildSurveyCards,
  collectNames,
  detectLayout,
  isMeaningfulComment,
  matchPerson,
  parseCsv,
  parseScore,
  type NameResolution,
  type StoredResponse,
} from "./evaluationCards.ts";

const people = [
  { userId: "u1", fullName: "Christopher Lugo Estrada" },
  { userId: "u2", fullName: "Paulina Munguía" },
  { userId: "u3", fullName: "Sinuhe Veloz" },
  { userId: "u4", fullName: "Jorge Sánchez" },
  { userId: "u5", fullName: "Jorge Castorena" },
];

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes and line breaks", () => {
    const rows = parseCsv('﻿a,b\r\n"uno, dos","línea 1\nlínea 2"\n"dice ""hola""",x\n');
    assert.deepEqual(rows, [
      ["a", "b"],
      ["uno, dos", "línea 1\nlínea 2"],
      ['dice "hola"', "x"],
    ]);
  });
});

describe("matchPerson", () => {
  it("tolerates typos, missing accents and partial names", () => {
    assert.equal(matchPerson("Chistopher Lugo", people)?.userId, "u1");
    assert.equal(matchPerson("Paulina Murguia", people)?.userId, "u2");
    assert.equal(matchPerson("Veloz", people)?.userId, "u3");
    assert.equal(matchPerson("jorge sanchez", people)?.userId, "u4");
  });

  it("does not guess when the name is ambiguous or unknown", () => {
    assert.equal(matchPerson("Jorge", people), null);
    assert.equal(matchPerson("Daniel Aguirre", people), null);
  });
});

describe("parseScore and comments", () => {
  it("reads Google Forms scales", () => {
    assert.equal(parseScore("5 Excelente"), 5);
    assert.equal(parseScore("3"), 3);
    assert.equal(parseScore("Bueno"), null);
    assert.equal(parseScore("9"), null);
  });

  it("drops empty answers", () => {
    assert.equal(isMeaningfulComment("Ninguno "), false);
    assert.equal(isMeaningfulComment("N/A"), false);
    assert.equal(isMeaningfulComment("---"), false);
    assert.equal(isMeaningfulComment("Muy organizada"), true);
  });
});

describe("detectLayout and buildImport", () => {
  const csv = [
    "Marca temporal,Nombre,Columna 2,Califique [Calidad],Califique [Responsabilidad],¿Fortalezas de este profesor?,¿Qué aspectos debería mejorar?,Comentarios adicionales",
    "1/1/2026,Sinuhe Veloz,Paulina Munguia,5 Excelente,4 Bueno,Creativa,Ninguno,",
    "1/1/2026,Jorge Sanchez,Daniel Aguirre,3 Cumple,2 Deficiente,,Puntualidad,",
    "1/1/2026,Sinuhe Veloz,otro,4 Bueno,4 Bueno,,,",
  ].join("\n");
  const rows = parseCsv(csv);
  const layout = detectLayout(rows, people);

  it("finds the evaluated person, criteria and open questions, ignoring the evaluator", () => {
    assert.equal(layout.subjectColumn, 2);
    assert.deepEqual(
      layout.criteria.map((criterion) => criterion.label),
      ["Calidad", "Responsabilidad"],
    );
    assert.deepEqual(layout.text, { strengths: 5, improvements: 6, comments: 7 });
    assert.equal(layout.suggestedType, "profesor");
  });

  it("keeps people without a user and skips 'otro'", () => {
    const names = collectNames(rows, layout.subjectColumn, people);
    const resolutions = new Map<string, NameResolution>(names.map((name) => [name.key, name.auto]));
    assert.deepEqual(resolutions.get("otro"), { kind: "skip" });
    const imported = buildImport(rows, layout, resolutions, people);
    assert.equal(imported.length, 2);
    assert.deepEqual(imported[0], {
      subjectKey: "user:u2",
      subjectName: "Paulina Munguía",
      subjectUserId: "u2",
      scores: { Calidad: 5, Responsabilidad: 4 },
      strengths: "Creativa",
      improvements: "Ninguno",
      comments: null,
    });
    assert.equal(imported[1].subjectKey, "name:daniel aguirre");
    assert.equal(imported[1].subjectName, "Daniel Aguirre");
    assert.ok(!JSON.stringify(imported).includes("Sinuhe"));
  });
});

describe("buildSurveyCards", () => {
  const response = (
    id: string,
    subjectKey: string,
    scores: Record<string, number>,
    extra: Partial<StoredResponse> = {},
  ): StoredResponse => ({
    id,
    surveyType: "lider",
    subjectKey,
    subjectName: subjectKey.toUpperCase(),
    subjectUserId: null,
    scores,
    strengths: null,
    improvements: null,
    comments: null,
    hiddenFields: [],
    ...extra,
  });

  const cards = buildSurveyCards(
    [
      response("1", "a", { Comunicación: 5, Organización: 5, Liderazgo: 5 }, { strengths: "Zeta" }),
      response("2", "a", { Comunicación: 1, Organización: 1, Liderazgo: 2 }, {
        strengths: "Alfa",
        improvements: "Ninguno",
        hiddenFields: ["strengths"],
      }),
      response("3", "b", { Comunicación: 4, Organización: 2, Liderazgo: 3 }),
      response("4", "b", { Comunicación: 4, Organización: 2, Liderazgo: 3 }, { surveyType: "profesor" }),
    ],
    "lider",
  );
  const a = cards.find((card) => card.subjectKey === "a")!;
  const b = cards.find((card) => card.subjectKey === "b")!;

  it("compares each person with the team mean of person means", () => {
    assert.equal(b.n, 1);
    assert.equal(b.overall, 3);
    assert.ok(Math.abs(a.overall - 19 / 6) < 1e-9);
    assert.ok(Math.abs(a.groupOverall - (19 / 6 + 3) / 2) < 1e-9);
    assert.equal(a.rank, 1);
    assert.equal(b.criteria.find((item) => item.label === "Comunicación")?.diff, 4 - 3.5);
    assert.equal(b.strongest[0].label, "Comunicación");
    assert.equal(b.weakest[0].label, "Organización");
  });

  it("only lists areas of opportunity below the team mean", () => {
    assert.ok(a.weakest.every((item) => item.diff < 0));
    assert.ok(b.strongest.every((item) => item.diff > 0));
  });

  it("flags divided opinions and small samples", () => {
    assert.equal(a.divided, true);
    assert.equal(a.smallSample, true);
    assert.equal(b.divided, false);
  });

  it("sorts comments alphabetically, keeps hidden ones marked and drops empty answers", () => {
    assert.deepEqual(
      a.comments.strengths.map((comment) => [comment.text, comment.hidden]),
      [
        ["Alfa", true],
        ["Zeta", false],
      ],
    );
    assert.equal(a.comments.improvements.length, 0);
  });
});
