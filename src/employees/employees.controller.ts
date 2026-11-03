import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  UpdateMyProfileDto,
} from './dto/employee.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

type AuthedRequest = { user: { userId: string } };

// Static routes are declared before ':id' so they are not captured by it.
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  // --- employee-facing ------------------------------------------------------

  @Get('me')
  getMe(@Request() req: AuthedRequest) {
    return this.employeesService.getMyProfile(req.user.userId);
  }

  @Patch('me')
  updateMe(@Body() dto: UpdateMyProfileDto, @Request() req: AuthedRequest) {
    return this.employeesService.updateMyProfile(dto, req.user.userId);
  }

  @Get('directory')
  getDirectory() {
    return this.employeesService.getDirectory();
  }

  // --- admin -----------------------------------------------------------------

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateEmployeeDto, @Request() req: AuthedRequest) {
    return this.employeesService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @Request() req: AuthedRequest,
  ) {
    return this.employeesService.update(id, dto, req.user.userId);
  }
}
