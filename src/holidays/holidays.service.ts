import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Holiday } from './holiday.entity';
import { CreateHolidayDto } from './dto/holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidaysRepo: Repository<Holiday>,
  ) {}

  findAll(): Promise<Holiday[]> {
    return this.holidaysRepo.find({ order: { date: 'ASC' } });
  }

  async getAllDates(): Promise<Date[]> {
    const holidays = await this.findAll();
    return holidays.map((h) => new Date(h.date));
  }

  async create(dto: CreateHolidayDto): Promise<Holiday> {
    const holiday = this.holidaysRepo.create(dto);
    return this.holidaysRepo.save(holiday);
  }

  async remove(id: string): Promise<void> {
    const holiday = await this.holidaysRepo.findOne({ where: { id } });
    if (!holiday) throw new NotFoundException(`Holiday ${id} not found`);
    await this.holidaysRepo.remove(holiday);
  }
}
