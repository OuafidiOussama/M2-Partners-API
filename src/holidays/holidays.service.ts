import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Holiday } from './holiday.entity';
import { CreateHolidayDto } from './dto/holiday.dto';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/transform.util';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidaysRepo: Repository<Holiday>,
    private readonly auditService: AuditService,
  ) {}

  findByYearAndCountry(year: number, country: string): Promise<Holiday[]> {
    return this.holidaysRepo.find({
      where: {
        country_code: country,
        date: Between(`${year}-01-01`, `${year}-12-31`),
      },
      order: { date: 'ASC' },
    });
  }

  /** Holiday dates of `country`, used for working-day counting. */
  async getAllDates(country: string): Promise<Date[]> {
    const holidays = await this.holidaysRepo.find({
      where: { country_code: country },
      order: { date: 'ASC' },
    });
    return holidays.map((h) => new Date(h.date));
  }

  async create(dto: CreateHolidayDto, actorId: string): Promise<Holiday> {
    let saved: Holiday;
    try {
      saved = await this.holidaysRepo.save(this.holidaysRepo.create(dto));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A ${dto.country_code} holiday already exists on ${dto.date}`,
        );
      }
      throw err;
    }

    await this.auditService.log({
      actorId,
      eventType: 'HOLIDAY_CREATED',
      targetId: saved.id,
      targetType: 'holiday',
      metadata: { ...dto },
    });
    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const holiday = await this.holidaysRepo.findOne({ where: { id } });
    if (!holiday) throw new NotFoundException('We could not find this holiday');
    await this.holidaysRepo.remove(holiday);

    await this.auditService.log({
      actorId,
      eventType: 'HOLIDAY_DELETED',
      targetId: id,
      targetType: 'holiday',
      metadata: {
        date: holiday.date,
        label: holiday.label,
        country_code: holiday.country_code,
      },
    });
  }
}
