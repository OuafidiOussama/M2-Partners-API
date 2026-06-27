import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';
import { Holiday } from './holiday.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Holiday])],
  providers: [HolidaysService],
  controllers: [HolidaysController],
  exports: [HolidaysService],
})
export class HolidaysModule {}
