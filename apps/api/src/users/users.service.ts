import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { TeamEntity } from '../database/entities/team.entity';
import { TeamMemberEntity } from '../database/entities/team-member.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { normalizeLeadSpecialties } from '../common/specialties';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly teamMembersRepository: Repository<TeamMemberEntity>,
  ) {}

  private normalizeTeamIdsInput(
    teamIds?: string[] | null,
    teamId?: string | null,
  ) {
    if (Array.isArray(teamIds)) {
      return [...new Set(teamIds.map((item) => item.trim()).filter(Boolean))];
    }

    if (teamId && teamId.trim().length > 0) {
      return [teamId.trim()];
    }

    return [];
  }

  private async ensureTeamsExist(teamIds: string[]) {
    if (teamIds.length === 0) {
      return;
    }

    const teams = await this.teamsRepository.find({
      where: { id: In(teamIds) },
    });
    const foundIds = new Set(teams.map((team) => team.id));
    const missing = teamIds.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new BadRequestException('One or more teams do not exist');
    }
  }

  private async setUserTeams(userId: string, teamIds: string[]) {
    await this.teamMembersRepository.delete({ userId });

    if (teamIds.length === 0) {
      return;
    }

    await this.teamMembersRepository.save(
      teamIds.map((teamId) =>
        this.teamMembersRepository.create({
          teamId,
          userId,
        }),
      ),
    );
  }

  private async buildUserTeamIdsMap(userIds: string[]) {
    if (userIds.length === 0) {
      return {} as Record<string, string[]>;
    }

    const memberships = await this.teamMembersRepository.find({
      where: { userId: In(userIds) },
    });

    return memberships.reduce<Record<string, string[]>>((acc, row) => {
      if (!acc[row.userId]) {
        acc[row.userId] = [];
      }
      acc[row.userId].push(row.teamId);
      return acc;
    }, {});
  }

  private async attachTeamIds<T extends { id: string }>(users: T[]) {
    const teamIdsByUser = await this.buildUserTeamIdsMap(users.map((user) => user.id));

    return users.map((user) => ({
      ...user,
      teamIds: teamIdsByUser[user.id] ?? [],
    }));
  }

  findAll(role?: string) {
    const normalizedRole = role?.trim().toLowerCase();

    if (!normalizedRole || normalizedRole === 'all') {
      return this.usersRepository.find().then((users) => this.attachTeamIds(users));
    }

    if (!this.isUserRole(normalizedRole)) {
      throw new BadRequestException(
        'Invalid role filter. Use manager, lead, worker or all',
      );
    }

    return this.usersRepository
      .find({ where: { role: normalizedRole } })
      .then((users) => this.attachTeamIds(users));
  }

  private isUserRole(role: string): role is UserEntity['role'] {
    return role === 'manager' || role === 'lead' || role === 'worker';
  }

  findByEmail(email: string) {
    return this.usersRepository.findOne({ where: { email } });
  }

  findByEmailWithPassword(email: string) {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async create(dto: CreateUserDto) {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const normalizedSpecialties = normalizeLeadSpecialties(
      typeof dto.specialties !== 'undefined' ? dto.specialties : dto.specialty,
    );

    if (dto.role === 'lead' && normalizedSpecialties.length === 0) {
      throw new BadRequestException('Lead specialty is required');
    }

    const passwordHash = await hash(dto.password, 10);

    const user = this.usersRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      role: dto.role,
      specialty:
        dto.role === 'lead' ? (normalizedSpecialties[0] ?? null) : null,
      specialties: dto.role === 'lead' ? normalizedSpecialties : null,
      passwordHash,
      isActive: true,
    });
    const savedUser = await this.usersRepository.save(user);

    const normalizedTeamIds = this.normalizeTeamIdsInput(dto.teamIds, dto.teamId);
    await this.ensureTeamsExist(normalizedTeamIds);
    await this.setUserTeams(savedUser.id, normalizedTeamIds);

    const [withTeams] = await this.attachTeamIds([savedUser]);
    return withTeams;
  }

  async update(userId: string, dto: UpdateUserDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (typeof dto.fullName !== 'undefined') {
      user.fullName = dto.fullName;
    }

    if (typeof dto.role !== 'undefined') {
      user.role = dto.role;
    }

    if (
      typeof dto.specialties !== 'undefined' ||
      typeof dto.specialty !== 'undefined'
    ) {
      const normalizedSpecialties = normalizeLeadSpecialties(
        typeof dto.specialties !== 'undefined'
          ? dto.specialties
          : dto.specialty,
      );
      user.specialties =
        normalizedSpecialties.length > 0 ? normalizedSpecialties : null;
      user.specialty = normalizedSpecialties[0] ?? null;
    }

    if (user.role === 'lead') {
      const currentSpecialties = normalizeLeadSpecialties(
        user.specialties ?? user.specialty,
      );
      if (currentSpecialties.length === 0) {
        throw new BadRequestException('Lead specialty is required');
      }

      user.specialties = currentSpecialties;
      user.specialty = currentSpecialties[0];
    }

    if (user.role !== 'lead') {
      user.specialty = null;
      user.specialties = null;
    }

    if (typeof dto.isActive !== 'undefined') {
      user.isActive = dto.isActive;
    }

    if (typeof dto.password !== 'undefined' && dto.password.trim().length > 0) {
      user.passwordHash = await hash(dto.password, 10);
    }

    const savedUser = await this.usersRepository.save(user);

    const hasTeamChange =
      typeof dto.teamIds !== 'undefined' || typeof dto.teamId !== 'undefined';

    if (hasTeamChange) {
      const normalizedTeamIds = this.normalizeTeamIdsInput(dto.teamIds ?? null, dto.teamId ?? null);
      await this.ensureTeamsExist(normalizedTeamIds);
      await this.setUserTeams(savedUser.id, normalizedTeamIds);
    }

    const [withTeams] = await this.attachTeamIds([savedUser]);
    return withTeams;
  }

  async setPasswordHash(userId: string, passwordHash: string) {
    await this.usersRepository.update({ id: userId }, { passwordHash });
  }

  async remove(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'manager') {
      throw new BadRequestException('Manager users cannot be deleted');
    }

    try {
      await this.usersRepository.delete({ id: userId });
      return { deleted: true, userId };
    } catch {
      throw new BadRequestException(
        'User cannot be deleted because it has related records (tasks, updates or notifications)',
      );
    }
  }
}
