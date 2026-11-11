import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyResponseEntity } from '../database/entities/survey-response.entity';
import { EvaluationCardNoteEntity } from '../database/entities/evaluation-card-note.entity';
import { EvaluationCardsService } from './evaluation-cards.service';

describe('EvaluationCardsService', () => {
  let service: EvaluationCardsService;
  const managerMock = {
    delete: jest.fn(),
    save: jest.fn<unknown, [unknown, SurveyResponseEntity[]]>(),
  };
  const responsesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    create: jest.fn((value: unknown) => value),
    manager: {
      transaction: jest.fn(
        async (run: (manager: typeof managerMock) => Promise<void>) =>
          run(managerMock),
      ),
    },
  };
  const notesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((value: unknown) =>
      Promise.resolve({
        ...(value as object),
        updatedAt: new Date('2026-11-10T00:00:00Z'),
      }),
    ),
    create: jest.fn((value: unknown) => value),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationCardsService,
        {
          provide: getRepositoryToken(SurveyResponseEntity),
          useValue: responsesRepository,
        },
        {
          provide: getRepositoryToken(EvaluationCardNoteEntity),
          useValue: notesRepository,
        },
      ],
    }).compile();
    service = moduleRef.get(EvaluationCardsService);
  });

  const baseImport = {
    year: 2026,
    semester: 2,
    surveyType: 'lider' as const,
    responses: [
      {
        subjectKey: 'user:1',
        subjectName: 'Ana',
        subjectUserId: '11111111-1111-4111-8111-111111111111',
        scores: { Comunicación: 5, Organización: 4 },
        strengths: '  Clara  ',
        improvements: '   ',
      },
    ],
  };

  it('replaces the survey of the semester in one transaction', async () => {
    const result = await service.importSurvey(baseImport);

    expect(result).toEqual({ imported: 1 });
    expect(managerMock.delete).toHaveBeenCalledWith(SurveyResponseEntity, {
      year: 2026,
      semester: 2,
      surveyType: 'lider',
    });
    const saved = managerMock.save.mock.calls[0][1];
    expect(saved[0]).toMatchObject({
      subjectName: 'Ana',
      strengths: 'Clara',
      improvements: null,
      scores: { Comunicación: 5, Organización: 4 },
    });
    expect(saved[0]).not.toHaveProperty('evaluatorName');
  });

  it('rejects scores outside 1 to 5', async () => {
    await expect(
      service.importSurvey({
        ...baseImport,
        responses: [
          { ...baseImport.responses[0], scores: { Comunicación: 7 } },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(managerMock.delete).not.toHaveBeenCalled();
  });

  it('upserts the direction comments of a card', async () => {
    notesRepository.findOne.mockResolvedValueOnce(null);
    const result = await service.saveNote(
      {
        year: 2026,
        semester: 2,
        subjectKey: 'user:1',
        subjectName: 'Ana',
        comments: ' Buen semestre ',
      },
      'manager-id',
    );
    expect(result.comments).toBe('Buen semestre');
    expect(notesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedBy: 'manager-id',
        subjectKey: 'user:1',
      }),
    );
  });

  it('only downloads Google Sheets links', async () => {
    await expect(
      service.fetchSheet('http://169.254.169.254/latest/meta-data'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
