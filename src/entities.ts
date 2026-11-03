import { AuditLog } from './audit/audit-log.entity';
import { CompanyDocument } from './company-documents/company-document.entity';
import { Delegation } from './delegations/delegation.entity';
import { Employee } from './employees/employee.entity';
import { ProfileChangeRequest } from './employees/profile-change-request.entity';
import { Holiday } from './holidays/holiday.entity';
import { LeaveAllowance } from './leaves/leave-allowance.entity';
import { LeaveRequest } from './leaves/leave-request.entity';
import { Team } from './teams/team.entity';
import { User } from './users/user.entity';

/**
 * Every TypeORM entity, imported explicitly. Folder globs find nothing once
 * the app is bundled for Vercel, so add new entities here.
 */
export const ENTITIES = [
  AuditLog,
  CompanyDocument,
  Delegation,
  Employee,
  ProfileChangeRequest,
  Holiday,
  LeaveAllowance,
  LeaveRequest,
  Team,
  User,
];
