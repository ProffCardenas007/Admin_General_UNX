import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ClassPlanningService } from './class-planning.service';
import { CreateClassCourseDto } from './dto/create-class-course.dto';
import { UpdateClassCourseDto } from './dto/update-class-course.dto';
import { CreateClassSubjectDto } from './dto/create-class-subject.dto';
import { AssignSubjectTeacherDto } from './dto/assign-subject-teacher.dto';
import { CreateClassSessionDto } from './dto/create-class-session.dto';
import { AssignSessionCoverageDto } from './dto/assign-session-coverage.dto';

@Controller('class-planning')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassPlanningController {
  constructor(private readonly classPlanningService: ClassPlanningService) {}

  @Get('courses')
  @Roles('manager', 'lead', 'worker')
  findCourses() {
    return this.classPlanningService.findCourses();
  }

  @Delete('reset')
  @Roles('manager')
  resetPlanning() {
    return this.classPlanningService.resetPlanning();
  }

  @Post('courses')
  @Roles('manager')
  createCourse(@Body() dto: CreateClassCourseDto) {
    return this.classPlanningService.createCourse(dto);
  }

  @Patch('courses/:courseId')
  @Roles('manager')
  updateCourse(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateClassCourseDto,
  ) {
    return this.classPlanningService.updateCourse(courseId, dto);
  }

  @Delete('courses/:courseId')
  @Roles('manager')
  deleteCourse(@Param('courseId') courseId: string) {
    return this.classPlanningService.deleteCourse(courseId);
  }

  @Delete('sessions/:sessionId')
  @Roles('manager')
  deleteSession(@Param('sessionId') sessionId: string) {
    return this.classPlanningService.deleteSession(sessionId);
  }

  @Post('courses/:courseId/subjects')
  @Roles('manager')
  createSubject(
    @Param('courseId') courseId: string,
    @Body() dto: CreateClassSubjectDto,
  ) {
    return this.classPlanningService.createSubject(courseId, dto);
  }

  @Patch('subjects/:subjectId/teacher')
  @Roles('manager')
  assignSubjectTeacher(
    @Param('subjectId') subjectId: string,
    @Body() dto: AssignSubjectTeacherDto,
  ) {
    return this.classPlanningService.assignSubjectTeacher(subjectId, dto);
  }

  @Post('sessions')
  @Roles('manager')
  createSession(
    @Body() dto: CreateClassSessionDto,
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
  ) {
    return this.classPlanningService.createSession(dto, req.user);
  }

  @Patch('sessions/:sessionId/coverage')
  @Roles('manager')
  assignSessionCoverage(
    @Param('sessionId') sessionId: string,
    @Body() dto: AssignSessionCoverageDto,
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
  ) {
    return this.classPlanningService.assignSessionCoverage(sessionId, dto, req.user);
  }

  @Get('sessions')
  @Roles('manager')
  findSessions(
    @Query('courseId') courseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('pendingCoverage') pendingCoverage?: string,
  ) {
    return this.classPlanningService.findSessions({
      courseId,
      from,
      to,
      pendingCoverage: pendingCoverage === 'true',
    });
  }

  @Get('session-hours')
  @Roles('manager', 'lead')
  getSessionHours(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.classPlanningService.getSessionHours({ from, to });
  }

  @Get('my-sessions')
  @Roles('manager', 'lead', 'worker')
  findMySessions(
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const targetUserId = req.user.role === 'manager' && userId ? userId : req.user.id;
    return this.classPlanningService.findMySessions(targetUserId, { from, to });
  }
}
