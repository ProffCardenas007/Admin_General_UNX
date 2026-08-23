import { IsUUID } from 'class-validator';

export class AssignSubjectTeacherDto {
  @IsUUID()
  teacherUserId: string;
}
