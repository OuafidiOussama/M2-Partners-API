import { LeaveRequest } from './leave-request.entity';
import { LeaveType } from '../common/enums/leave-type.enum';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { PersonSummary, toPersonSummary } from '../employees/employee.mapper';

export interface LeaveRequestView {
  id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  status: LeaveStatus;
  reason: string | null;
  admin_reason: string | null;
  created_at: string;
}

/** A leave request as seen by approvers. */
export interface ApprovalRequest extends LeaveRequestView {
  employee: PersonSummary;
}

export interface TeamAbsence {
  id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  employee: PersonSummary;
}

export function toLeaveRequestView(leave: LeaveRequest): LeaveRequestView {
  return {
    id: leave.id,
    type: leave.type,
    start_date: leave.start_date,
    end_date: leave.end_date,
    days: leave.days,
    status: leave.status,
    reason: leave.reason ?? null,
    admin_reason: leave.admin_reason ?? null,
    created_at: new Date(leave.created_at).toISOString(),
  };
}

export function toApprovalRequest(leave: LeaveRequest): ApprovalRequest {
  return {
    ...toLeaveRequestView(leave),
    employee: toPersonSummary(leave.employee),
  };
}

export function toTeamAbsence(leave: LeaveRequest): TeamAbsence {
  return {
    id: leave.id,
    type: leave.type,
    start_date: leave.start_date,
    end_date: leave.end_date,
    employee: toPersonSummary(leave.employee),
  };
}
