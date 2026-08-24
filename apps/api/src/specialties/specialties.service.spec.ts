import { ConflictException } from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';

describe('SpecialtiesService', () => {
  const repository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  let service: SpecialtiesService;
  let queryBuilder: {
    where: jest.Mock;
    orWhere: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    service = new SpecialtiesService(repository as never);
  });

  it('creates a stable code from the display name', async () => {
    const result = await service.create({ name: '  Matemáticas Avanzadas  ' });

    expect(repository.create).toHaveBeenCalledWith({
      code: 'matematicas_avanzadas',
      name: 'Matemáticas Avanzadas',
      isActive: true,
    });
    expect(result.code).toBe('matematicas_avanzadas');
  });

  it('rejects a duplicate specialty', async () => {
    queryBuilder.getOne.mockResolvedValue({ code: 'paa' });

    await expect(service.create({ name: 'PAA' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});