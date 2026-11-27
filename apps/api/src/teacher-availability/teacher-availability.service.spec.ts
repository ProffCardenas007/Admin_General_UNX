import { TeacherAvailabilityService } from './teacher-availability.service';

describe('TeacherAvailabilityService · datos del profesor', () => {
  const setup = (classSubjects: string[]) => {
    const profiles = {
      findOne: jest.fn().mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        calendars: {
          '2027A': { availability: { 'Lunes-7:00 am': 'busy' }, updatedAt: '2026-11-01T00:00:00Z' },
        },
        incidences: [],
        teaching: {},
      }),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const users = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', classSubjects }),
      update: jest.fn(),
    };
    const service = new TeacherAvailabilityService(profiles as never, users as never, {} as never);
    return { service, profiles, users };
  };

  it('guarda los datos sin tocar la disponibilidad ni otras materias', async () => {
    const { service, profiles, users } = setup(['Física', 'Español']);
    const result = await service.upsertByUserId('u1', {
      teaching: {
        subjects: ['Matemáticas'],
        programs: ['PAA'],
        modalities: ['Virtual'],
        venues: ['Medicina'],
      },
    });

    expect(users.update).toHaveBeenCalledWith('u1', { classSubjects: ['Física', 'Matemáticas'] });
    expect(profiles.save).toHaveBeenCalledWith(
      expect.objectContaining({
        calendars: { '2027A': expect.objectContaining({ availability: { 'Lunes-7:00 am': 'busy' } }) },
      }),
    );
    expect(result.teaching.subjects).toEqual(['Matemáticas']);
    expect(result.teaching.venues).toEqual(['Medicina']);
  });

  it('guardar un calendario no cambia los otros', async () => {
    const { service } = setup([]);
    const result = await service.upsertByUserId('u1', {
      calendar: '2027B',
      availability: { 'Martes-8:00 am': 'confirm' },
    });

    expect(result.availability).toEqual({ 'Martes-8:00 am': 'confirm' });
    expect(result.savedCalendars).toEqual(['2027A', '2027B']);
  });

  it('al guardar solo disponibilidad no cambia las materias', async () => {
    const { service, users } = setup(['Español']);
    await service.upsertByUserId('u1', { availability: {} });
    expect(users.update).not.toHaveBeenCalled();
  });
});
