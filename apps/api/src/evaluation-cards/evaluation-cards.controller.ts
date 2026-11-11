import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EvaluationCardsService } from './evaluation-cards.service';
import {
  FetchSheetDto,
  ImportSurveyDto,
  SaveCardNoteDto,
  SetHiddenFieldsDto,
} from './dto/evaluation-cards.dto';

@Controller('evaluation-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager')
export class EvaluationCardsController {
  constructor(private readonly service: EvaluationCardsService) {}

  @Get()
  getCards(@Query('year') year: string, @Query('semester') semester: string) {
    return this.service.getCards(Number(year), Number(semester));
  }

  @Put('surveys')
  importSurvey(@Body() dto: ImportSurveyDto) {
    return this.service.importSurvey(dto);
  }

  @Delete('surveys')
  deleteSurvey(
    @Query('year') year: string,
    @Query('semester') semester: string,
    @Query('surveyType') surveyType: string,
  ) {
    return this.service.deleteSurvey(
      Number(year),
      Number(semester),
      surveyType,
    );
  }

  @Put('responses/:id/hidden')
  setHiddenFields(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetHiddenFieldsDto,
  ) {
    return this.service.setHiddenFields(id, dto);
  }

  @Put('notes')
  saveNote(@Body() dto: SaveCardNoteDto, @Req() req: { user: { id: string } }) {
    return this.service.saveNote(dto, req.user.id);
  }

  @Post('fetch-sheet')
  @HttpCode(200)
  fetchSheet(@Body() dto: FetchSheetDto) {
    return this.service.fetchSheet(dto.url);
  }
}
