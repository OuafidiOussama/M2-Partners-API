import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DelegationsService } from './delegations.service';
import { CreateDelegationDto } from './dto/delegation.dto';
import { Approver } from '../auth/decorators/approver.decorator';

type AuthedRequest = { user: { userId: string } };

@Controller('delegations')
@Approver()
export class DelegationsController {
  constructor(private readonly delegationsService: DelegationsService) {}

  @Get('mine')
  async findMine(
    @Request() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    // Sent explicitly so "no delegation" is a JSON `null` body, not an empty one.
    res.json(await this.delegationsService.findMine(req.user.userId));
  }

  @Post()
  create(@Body() dto: CreateDelegationDto, @Request() req: AuthedRequest) {
    return this.delegationsService.create(dto, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthedRequest,
  ) {
    return this.delegationsService.cancel(id, req.user.userId);
  }
}
