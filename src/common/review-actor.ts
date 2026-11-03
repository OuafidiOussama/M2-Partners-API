import { Role } from './enums/role.enum';

/** The authenticated reviewer, as put on req.user by the auth strategy. */
export interface ReviewActor {
  userId: string;
  role: Role;
}
