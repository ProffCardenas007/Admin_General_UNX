import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProjectScope } from '../common/specialties';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @Roles('manager', 'lead', 'worker')
  findAll(
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.projectsService.findAll({ status, search }, req.user);
  }

  @Post()
  @Roles('manager', 'lead')
  create(
    @Body() dto: CreateProjectDto,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.projectsService.create(dto, req.user);
  }

  @Get(':projectId/progress')
  @Roles('manager', 'lead', 'worker')
  getProgress(
    @Param('projectId') projectId: string,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.projectsService.getProgress(projectId, req.user);
  }

  @Delete(':projectId')
  @Roles('manager')
  remove(@Param('projectId') projectId: string) {
    return this.projectsService.remove(projectId);
  }

  @Patch(':projectId')
  @Roles('manager', 'lead')
  update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.projectsService.update(projectId, dto, req.user);
  }
}
