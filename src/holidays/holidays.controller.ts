import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto, HolidayQueryDto } from './dto/holiday.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  findAll(@Query() query: HolidayQueryDto) {
    return this.holidaysService.findByYearAndCountry(query.year, query.country);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateHolidayDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.holidaysService.create(dto, req.user.userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.holidaysService.remove(id, req.user.userId);
  }
}
