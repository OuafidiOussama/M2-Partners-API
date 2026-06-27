import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto, RejectLeaveDto } from './dto/leave.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Body() dto: CreateLeaveDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.leavesService.submit(dto, req.user.userId);
  }

  @Get('my')
  getMyLeaves(@Request() req: { user: { userId: string } }) {
    return this.leavesService.findMyLeaves(req.user.userId);
  }

  @Get('balance')
  getBalance(@Request() req: { user: { userId: string } }) {
    return this.leavesService.getMyBalance(req.user.userId);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.leavesService.findAll({ status, type, employeeId });
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.leavesService.cancel(id, req.user.userId);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  approve(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.leavesService.approve(id, req.user.userId);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.leavesService.reject(id, dto, req.user.userId);
  }

  @Patch(':id/force-approve')
  @Roles(Role.ADMIN)
  forceApprove(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.leavesService.forceApprove(id, req.user.userId);
  }
}
