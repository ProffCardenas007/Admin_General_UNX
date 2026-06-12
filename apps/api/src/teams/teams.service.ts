import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TeamMemberEntity } from '../database/entities/team-member.entity';
import { TeamEntity } from '../database/entities/team.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly teamMembersRepository: Repository<TeamMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  private async ensureUniqueName(name: string, ignoreTeamId?: string) {
    const normalized = name.trim().toLowerCase();
    const existing = await this.teamsRepository
      .createQueryBuilder('team')
      .where('LOWER(team.name) = :name', { name: normalized })
      .getOne();

    if (existing && existing.id !== ignoreTeamId) {
      throw new ConflictException('Team name already exists');
    }
  }

  private async buildTeamView(team: TeamEntity) {
    const memberships = await this.teamMembersRepository.find({
      where: { teamId: team.id },
    });

    if (memberships.length === 0) {
      return {
        ...team,
        members: [],
        memberCount: 0,
      };
    }

    const userIds = memberships.map((item) => item.userId);
    const users = await this.usersRepository.find({ where: { id: In(userIds) } });

    const usersById = Object.fromEntries(users.map((user) => [user.id, user]));
    const members = memberships
      .map((membership) => usersById[membership.userId])
      .filter((user): user is UserEntity => Boolean(user))
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      }));

    return {
      ...team,
      members,
      memberCount: members.length,
    };
  }

  async findAll() {
    const teams = await this.teamsRepository.find({
      order: { name: 'ASC' },
    });

    return Promise.all(teams.map((team) => this.buildTeamView(team)));
  }

  async create(dto: CreateTeamDto) {
    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new BadRequestException('Team name is required');
    }

    await this.ensureUniqueName(trimmedName);

    const team = this.teamsRepository.create({
      name: trimmedName,
      leadId: dto.leadId?.trim() || null,
    });

    const saved = await this.teamsRepository.save(team);
    return this.buildTeamView(saved);
  }

  async update(teamId: string, dto: UpdateTeamDto) {
    const team = await this.teamsRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (typeof dto.name !== 'undefined') {
      const trimmedName = dto.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('Team name cannot be empty');
      }

      await this.ensureUniqueName(trimmedName, team.id);
      team.name = trimmedName;
    }

    if (typeof dto.leadId !== 'undefined') {
      team.leadId = dto.leadId?.trim() || null;
    }

    const saved = await this.teamsRepository.save(team);
    return this.buildTeamView(saved);
  }

  async setMembers(teamId: string, userIds: string[]) {
    const team = await this.teamsRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const normalizedIds = [...new Set(userIds.map((item) => item.trim()).filter(Boolean))];
    if (normalizedIds.length > 0) {
      const users = await this.usersRepository.find({ where: { id: In(normalizedIds) } });
      const foundIds = new Set(users.map((user) => user.id));
      const missing = normalizedIds.filter((id) => !foundIds.has(id));

      if (missing.length > 0) {
        throw new BadRequestException('One or more users do not exist');
      }
    }

    await this.teamMembersRepository.delete({ teamId });

    if (normalizedIds.length > 0) {
      await this.teamMembersRepository.save(
        normalizedIds.map((userId) =>
          this.teamMembersRepository.create({
            teamId,
            userId,
          }),
        ),
      );
    }

    return this.buildTeamView(team);
  }

  async remove(teamId: string) {
    const team = await this.teamsRepository.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    await this.teamsRepository.delete({ id: teamId });
    return { deleted: true, teamId };
  }
}
