import { SetMetadata } from '@nestjs/common';

export const APPROVER_KEY = 'approver';

/** Route requires an approver: an ADMIN or an active delegate. */
export const Approver = () => SetMetadata(APPROVER_KEY, true);
