import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { SetTeamMembersDto } from './dto/set-team-members.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @Roles('manager', 'lead')
  findAll() {
    return this.teamsService.findAll();
  }

  @Post()
  @Roles('manager')
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Patch(':teamId')
  @Roles('manager')
  update(@Param('teamId') teamId: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(teamId, dto);
  }

  @Put(':teamId/members')
  @Roles('manager')
  setMembers(@Param('teamId') teamId: string, @Body() dto: SetTeamMembersDto) {
    return this.teamsService.setMembers(teamId, dto.userIds ?? []);
  }

  @Delete(':teamId')
  @Roles('manager')
  remove(@Param('teamId') teamId: string) {
    return this.teamsService.remove(teamId);
  }
}
