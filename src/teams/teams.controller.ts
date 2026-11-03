import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamDto } from './dto/team.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

type AuthedRequest = { user: { userId: string } };

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: TeamDto, @Request() req: AuthedRequest) {
    return this.teamsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TeamDto,
    @Request() req: AuthedRequest,
  ) {
    return this.teamsService.update(id, dto, req.user.userId);
  }
}
