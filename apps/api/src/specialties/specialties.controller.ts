import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { SpecialtiesService } from './specialties.service';

@Controller('specialties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  @Roles('manager', 'lead', 'worker')
  findAll() {
    return this.specialtiesService.findAll();
  }

  @Post()
  @Roles('manager')
  create(@Body() dto: CreateSpecialtyDto) {
    return this.specialtiesService.create(dto);
  }
}