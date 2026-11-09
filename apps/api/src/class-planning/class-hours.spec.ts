import {
  classifyCourseActivity,
  classifyCourseProgram,
} from './class-planning.service';

describe('class hour classification', () => {
  it('classifies explicit EXANI courses separately from the PAA workbook default', () => {
    expect(
      classifyCourseProgram({
        code: 'Curso',
        name: '30 Preguntas EXANI',
      }),
    ).toBe('EXANI-II');
    expect(
      classifyCourseProgram({
        code: 'Curso',
        name: 'Taller de Comprensión de Textos',
      }),
    ).toBe('PAA');
  });

  it('distinguishes every teaching activity used by the imported schedule', () => {
    expect(
      classifyCourseActivity({ code: 'Curso', name: 'Taller PAA' }),
    ).toBe('Clase regular');
    expect(
      classifyCourseActivity({
        code: 'Regularización',
        name: 'Regularización 1',
      }),
    ).toBe('Regularización');
    expect(
      classifyCourseActivity({ code: 'Asesorías', name: 'Asesorías EXANI' }),
    ).toBe('Asesoría');
    expect(
      classifyCourseActivity({
        code: 'Examen',
        name: 'Aplicación Examen A PAA',
      }),
    ).toBe('Aplicación de examen');
    expect(
      classifyCourseActivity({
        code: 'Examen',
        name: 'Aplicación y Explicación Examen A PAA',
      }),
    ).toBe('Explicación de examen');
  });
});
