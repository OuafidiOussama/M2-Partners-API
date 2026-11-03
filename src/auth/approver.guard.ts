import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APPROVER_KEY } from './decorators/approver.decorator';
import { DelegationsService } from '../delegations/delegations.service';

/** Enforces @Approver(); routes without it pass through. */
@Injectable()
export class ApproverGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly delegationsService: DelegationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(APPROVER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { userId?: string } }>();
    if (!user?.userId) return false;
    return this.delegationsService.canApprove(user.userId);
  }
}
