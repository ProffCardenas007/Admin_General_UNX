import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

describe('ImportsController', () => {
  let controller: ImportsController;
  let processUpload: jest.Mock;

  beforeEach(async () => {
    processUpload = jest.fn().mockResolvedValue({ id: 'import-1', status: 'processing' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        {
          provide: ImportsService,
          useValue: { processUpload },
        },
      ],
    }).compile();

    controller = module.get<ImportsController>(ImportsController);
  });

  it('should reject non-manager uploads', async () => {
    await expect(
      controller.uploadExcel(
        { originalname: 'test.csv', buffer: Buffer.from('a') } as any,
        { user: { id: 'worker-1', role: 'worker' } } as any,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(processUpload).not.toHaveBeenCalled();
  });

  it('should use the authenticated JWT user as the actor', async () => {
    await controller.uploadExcel(
      { originalname: 'test.csv', buffer: Buffer.from('a') } as any,
      { user: { id: 'manager-1', role: 'manager' } } as any,
    );

    expect(processUpload).toHaveBeenCalledWith({
      fileName: 'test.csv',
      fileBuffer: Buffer.from('a'),
      actorId: 'manager-1',
    });
  });
});
