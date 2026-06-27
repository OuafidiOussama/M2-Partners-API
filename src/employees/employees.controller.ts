import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('me')
  getMe(@Request() req: { user: { userId: string } }) {
    return this.employeesService.findMe(req.user.userId);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateEmployeeDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.employeesService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.employeesService.update(id, dto, req.user.userId);
  }
}
