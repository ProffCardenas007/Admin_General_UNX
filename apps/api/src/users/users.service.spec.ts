import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserEntity } from '../database/entities/user.entity';
import { TeamEntity } from '../database/entities/team.entity';
import { TeamMemberEntity } from '../database/entities/team-member.entity';
import { SpecialtyEntity } from '../database/entities/specialty.entity';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        UserEntity,
        TeamEntity,
        TeamMemberEntity,
        SpecialtyEntity,
      ].map((provider) =>
        provider === UsersService
          ? provider
          : {
              provide: getRepositoryToken(provider),
              useValue: {},
            },
      ),
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
