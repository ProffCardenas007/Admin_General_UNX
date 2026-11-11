import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyResponseEntity } from '../database/entities/survey-response.entity';
import { EvaluationCardNoteEntity } from '../database/entities/evaluation-card-note.entity';
import { EvaluationCardsController } from './evaluation-cards.controller';
import { EvaluationCardsService } from './evaluation-cards.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyResponseEntity, EvaluationCardNoteEntity]),
  ],
  controllers: [EvaluationCardsController],
  providers: [EvaluationCardsService],
})
export class EvaluationCardsModule {}
