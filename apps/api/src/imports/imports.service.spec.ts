import { NotFoundException } from '@nestjs/common';
import { ImportsService } from './imports.service';

describe('ImportsService', () => {
  let service: ImportsService;
  let importsRepository: { findOne: jest.Mock };
  let importErrorsRepository: { find: jest.Mock };

  beforeEach(() => {
    importsRepository = { findOne: jest.fn() };
    importErrorsRepository = { find: jest.fn().mockResolvedValue([]) };

    // Only the repositories exercised here matter; the rest are not touched.
    const unused = {} as any;
    service = new ImportsService(
      importsRepository as any,
      importErrorsRepository as any,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
  });

  it('returns an import by id', async () => {
    importsRepository.findOne.mockResolvedValue({ id: 'imp-1', status: 'done' });

    await expect(service.getImportById('imp-1')).resolves.toEqual({
      id: 'imp-1',
      status: 'done',
    });
    expect(importsRepository.findOne).toHaveBeenCalledWith({ where: { id: 'imp-1' } });
  });

  it('404s when the import does not exist', async () => {
    importsRepository.findOne.mockResolvedValue(null);
    await expect(service.getImportById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists import errors in row order', async () => {
    await service.getImportErrors('imp-1');
    expect(importErrorsRepository.find).toHaveBeenCalledWith({
      where: { importId: 'imp-1' },
      order: { rowNumber: 'ASC' },
    });
  });
});
