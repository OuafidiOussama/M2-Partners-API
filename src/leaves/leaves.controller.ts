import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import {
  ApprovalQueryDto,
  AllowanceQueryDto,
  LogSickDayDto,
  RejectLeaveDto,
  RequestVacationDto,
  TeamAbsenceQueryDto,
} from './dto/leave.dto';
import { Approver } from '../auth/decorators/approver.decorator';
import { ReviewActor } from '../common/review-actor';

type AuthedRequest = { user: { userId: string } };
type ReviewerRequest = { user: ReviewActor };

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // --- employee-facing ------------------------------------------------------

  @Get('my')
  getMyLeaves(@Request() req: AuthedRequest) {
    return this.leavesService.findMyLeaves(req.user.userId);
  }

  @Get('allowance')
  getAllowance(
    @Query() query: AllowanceQueryDto,
    @Request() req: AuthedRequest,
  ) {
    return this.leavesService.getMyAllowance(req.user.userId, query.year);
  }

  @Get('team')
  getTeamAbsences(@Query() query: TeamAbsenceQueryDto) {
    return this.leavesService.getTeamAbsences(query.from, query.to);
  }

  @Post('vacation')
  requestVacation(
    @Body() dto: RequestVacationDto,
    @Request() req: AuthedRequest,
  ) {
    return this.leavesService.requestVacation(dto, req.user.userId);
  }

  @Post('sick')
  logSickDay(@Body() dto: LogSickDayDto, @Request() req: AuthedRequest) {
    return this.leavesService.logSickDay(dto, req.user.userId);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthedRequest,
  ) {
    return this.leavesService.cancel(id, req.user.userId);
  }

  // --- approvers (admins and active delegates) ----------------------------

  @Get()
  @Approver()
  findAll(@Query() query: ApprovalQueryDto) {
    return this.leavesService.findAll(query);
  }

  @Patch(':id/approve')
  @Approver()
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ReviewerRequest,
  ) {
    return this.leavesService.approve(id, req.user);
  }

  @Patch(':id/reject')
  @Approver()
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeaveDto,
    @Request() req: ReviewerRequest,
  ) {
    return this.leavesService.reject(id, dto, req.user);
  }
}
