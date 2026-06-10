import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { normalizeLeadSpecialties } from '../common/specialties';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  findAll(role?: string) {
    const normalizedRole = role?.trim().toLowerCase();

    if (!normalizedRole || normalizedRole === 'all') {
      return this.usersRepository.find();
    }

    if (!this.isUserRole(normalizedRole)) {
      throw new BadRequestException(
        'Invalid role filter. Use manager, lead, worker or all',
      );
    }

    return this.usersRepository.find({ where: { role: normalizedRole } });
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
    return this.usersRepository.save(user);
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

    return this.usersRepository.save(user);
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
