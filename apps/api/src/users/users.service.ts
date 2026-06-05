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
import { isLeadSpecialty, normalizeLeadSpecialty } from '../common/specialties';

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
			throw new BadRequestException('Invalid role filter. Use manager, lead, worker or all');
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
		const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
		if (existing) {
			throw new ConflictException('Email already registered');
		}

		const normalizedSpecialty = normalizeLeadSpecialty(dto.specialty);

		if (dto.role === 'lead' && !isLeadSpecialty(normalizedSpecialty)) {
			throw new BadRequestException('Lead specialty is required');
		}

		const passwordHash = await hash(dto.password, 10);

		const user = this.usersRepository.create({
			fullName: dto.fullName,
			email: dto.email,
			role: dto.role,
			specialty: dto.role === 'lead' ? normalizedSpecialty : null,
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

		if (typeof dto.specialty !== 'undefined') {
			user.specialty = normalizeLeadSpecialty(dto.specialty) ?? null;
		}

		if (user.role === 'lead' && !isLeadSpecialty(user.specialty)) {
			throw new BadRequestException('Lead specialty is required');
		}

		if (user.role !== 'lead') {
			user.specialty = null;
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
