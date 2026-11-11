import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyResponseEntity } from '../database/entities/survey-response.entity';
import type { SurveyType } from '../database/entities/survey-response.entity';
import { EvaluationCardNoteEntity } from '../database/entities/evaluation-card-note.entity';
import {
  ImportSurveyDto,
  SaveCardNoteDto,
  SetHiddenFieldsDto,
  SURVEY_TYPES,
} from './dto/evaluation-cards.dto';

const MAX_CRITERIA = 30;
const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const SHEET_URL_PATTERN =
  /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/;

const cleanText = (value: string | null | undefined) => {
  const text = (value ?? '').trim();
  return text.length > 0 ? text : null;
};

@Injectable()
export class EvaluationCardsService {
  constructor(
    @InjectRepository(SurveyResponseEntity)
    private readonly responsesRepository: Repository<SurveyResponseEntity>,
    @InjectRepository(EvaluationCardNoteEntity)
    private readonly notesRepository: Repository<EvaluationCardNoteEntity>,
  ) {}

  private validatePeriod(year: number, semester: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be between 2000 and 2100');
    }
    if (semester !== 1 && semester !== 2) {
      throw new BadRequestException('semester must be 1 or 2');
    }
  }

  async getCards(year: number, semester: number) {
    this.validatePeriod(year, semester);
    const [responses, notes] = await Promise.all([
      this.responsesRepository.find({
        where: { year, semester },
        order: { createdAt: 'ASC' },
      }),
      this.notesRepository.find({ where: { year, semester } }),
    ]);
    return {
      year,
      semester,
      responses: responses.map((response) => ({
        id: response.id,
        surveyType: response.surveyType,
        subjectKey: response.subjectKey,
        subjectName: response.subjectName,
        subjectUserId: response.subjectUserId,
        scores: response.scores,
        strengths: response.strengths,
        improvements: response.improvements,
        comments: response.comments,
        hiddenFields: response.hiddenFields ?? [],
      })),
      notes: notes.map((note) => ({
        subjectKey: note.subjectKey,
        subjectName: note.subjectName,
        subjectUserId: note.subjectUserId,
        comments: note.comments,
        updatedAt: note.updatedAt,
      })),
    };
  }

  /**
   * Reemplaza todas las respuestas de una encuesta del semestre: volver a
   * importar la hoja (con respuestas nuevas) no duplica datos.
   */
  async importSurvey(dto: ImportSurveyDto) {
    this.validatePeriod(dto.year, dto.semester);
    const rows = dto.responses.map((item, index) => {
      const entries = Object.entries(item.scores ?? {});
      if (entries.length > MAX_CRITERIA) {
        throw new BadRequestException(
          `Response ${index + 1} has too many criteria`,
        );
      }
      const scores: Record<string, number> = {};
      for (const [criterion, value] of entries) {
        const label = criterion.trim();
        if (!label || label.length > 120) {
          throw new BadRequestException(
            `Response ${index + 1} has an invalid criterion name`,
          );
        }
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 1 ||
          value > 5
        ) {
          throw new BadRequestException(
            `Response ${index + 1}: scores must be between 1 and 5`,
          );
        }
        scores[label] = value;
      }
      const subjectKey = item.subjectKey.trim();
      const subjectName = item.subjectName.trim();
      if (!subjectKey || !subjectName) {
        throw new BadRequestException(
          `Response ${index + 1} has no evaluated person`,
        );
      }
      return this.responsesRepository.create({
        year: dto.year,
        semester: dto.semester,
        surveyType: dto.surveyType,
        subjectKey,
        subjectName,
        subjectUserId: item.subjectUserId ?? null,
        scores,
        strengths: cleanText(item.strengths),
        improvements: cleanText(item.improvements),
        comments: cleanText(item.comments),
        hiddenFields: [],
      });
    });

    await this.responsesRepository.manager.transaction(async (manager) => {
      await manager.delete(SurveyResponseEntity, {
        year: dto.year,
        semester: dto.semester,
        surveyType: dto.surveyType,
      });
      await manager.save(SurveyResponseEntity, rows);
    });

    return { imported: rows.length };
  }

  async deleteSurvey(year: number, semester: number, surveyType: string) {
    this.validatePeriod(year, semester);
    if (!SURVEY_TYPES.includes(surveyType as SurveyType)) {
      throw new BadRequestException('surveyType must be lider or profesor');
    }
    const result = await this.responsesRepository.delete({
      year,
      semester,
      surveyType: surveyType as SurveyType,
    });
    return { deleted: result.affected ?? 0 };
  }

  async setHiddenFields(responseId: string, dto: SetHiddenFieldsDto) {
    const response = await this.responsesRepository.findOne({
      where: { id: responseId },
    });
    if (!response) throw new NotFoundException('Response not found');
    response.hiddenFields = [...new Set(dto.hiddenFields)];
    await this.responsesRepository.save(response);
    return { id: response.id, hiddenFields: response.hiddenFields };
  }

  async saveNote(dto: SaveCardNoteDto, actorId: string) {
    this.validatePeriod(dto.year, dto.semester);
    const subjectKey = dto.subjectKey.trim();
    if (!subjectKey) throw new BadRequestException('subjectKey is required');
    const existing = await this.notesRepository.findOne({
      where: { year: dto.year, semester: dto.semester, subjectKey },
    });
    const note =
      existing ??
      this.notesRepository.create({
        year: dto.year,
        semester: dto.semester,
        subjectKey,
      });
    note.subjectName = dto.subjectName.trim() || subjectKey;
    note.subjectUserId = dto.subjectUserId ?? null;
    note.comments = dto.comments.trim();
    note.updatedBy = actorId;
    const saved = await this.notesRepository.save(note);
    return {
      subjectKey: saved.subjectKey,
      comments: saved.comments,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Descarga una hoja de Google Sheets compartida "con cualquier persona que
   * tenga el enlace". Solo acepta enlaces de docs.google.com y arma la URL de
   * exportación aquí, para no hacer peticiones a direcciones arbitrarias.
   */
  async fetchSheet(url: string) {
    const match = SHEET_URL_PATTERN.exec(url.trim());
    if (!match) {
      throw new BadRequestException(
        'Pega el enlace de una hoja de Google Sheets (docs.google.com/spreadsheets/d/...).',
      );
    }
    const gidMatch = /[#?&]gid=(\d+)/.exec(url);
    const exportUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${
      gidMatch ? `&gid=${gidMatch[1]}` : ''
    }`;

    let response: Response;
    try {
      response = await fetch(exportUrl, { redirect: 'follow' });
    } catch {
      throw new BadRequestException('No se pudo conectar con Google Sheets.');
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || contentType.includes('text/html')) {
      throw new BadRequestException(
        'La hoja es privada. En Google Sheets: Compartir → "Cualquier persona con el enlace" (Lector), o descárgala como CSV y súbela.',
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SHEET_BYTES) {
      throw new BadRequestException('La hoja es demasiado grande.');
    }
    return { csv: buffer.toString('utf-8') };
  }
}
