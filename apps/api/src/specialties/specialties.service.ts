import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpecialtyEntity } from '../database/entities/specialty.entity';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';

@Injectable()
export class SpecialtiesService {
  constructor(
    @InjectRepository(SpecialtyEntity)
    private readonly specialtiesRepository: Repository<SpecialtyEntity>,
  ) {}

  findAll() {
    return this.specialtiesRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async create(dto: CreateSpecialtyDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const code = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);

    if (!code) {
      throw new BadRequestException('Specialty name must contain letters or numbers');
    }

    const existing = await this.specialtiesRepository
      .createQueryBuilder('specialty')
      .where('specialty.code = :code', { code })
      .orWhere('LOWER(specialty.name) = LOWER(:name)', { name })
      .getOne();

    if (existing) {
      throw new ConflictException('Specialty already exists');
    }

    return this.specialtiesRepository.save(
      this.specialtiesRepository.create({ code, name, isActive: true }),
    );
  }
}