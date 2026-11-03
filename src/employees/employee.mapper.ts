import { Employee } from './employee.entity';
import { ContractType } from '../common/enums/contract-type.enum';

export interface PersonSummary {
  id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
}

export interface EmployeeProfile extends PersonSummary {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string | null;
  country_code: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  contract_type: ContractType;
  work_hours: string | null;
  start_date: string;
  office: string | null;
  department: string | null;
  line_manager: PersonSummary | null;
}

/** Anything but an absolute http(s) URL would be a broken image in the UI. */
function browserUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function toPersonSummary(emp: Employee): PersonSummary {
  return {
    id: emp.id,
    full_name: emp.full_name,
    job_title: emp.job_title ?? null,
    avatar_url: browserUrl(emp.avatar_url),
  };
}

/** Employee-facing profile. */
export function toEmployeeProfile(emp: Employee): EmployeeProfile {
  return {
    ...toPersonSummary(emp),
    first_name: emp.first_name,
    last_name: emp.last_name,
    email: emp.user?.azure_email ?? emp.user?.email ?? '',
    mobile: emp.mobile ?? null,
    country_code: emp.country_code,
    emergency_contact_name: emp.emergency_contact_name ?? null,
    emergency_contact_phone: emp.emergency_contact_phone ?? null,
    contract_type: emp.contract_type,
    work_hours: emp.work_hours ?? null,
    start_date: emp.start_date,
    office: emp.office ?? null,
    department: emp.department ?? null,
    line_manager: emp.line_manager ? toPersonSummary(emp.line_manager) : null,
  };
}

export interface DirectoryPerson extends PersonSummary {
  department: string | null;
}

export function toDirectoryPerson(emp: Employee): DirectoryPerson {
  return { ...toPersonSummary(emp), department: emp.department ?? null };
}

/** What an employee may edit themselves; the rest of the profile is admin-only. */
export const CHANGEABLE_FIELDS = [
  'first_name',
  'last_name',
  'mobile',
  'emergency_contact_name',
  'emergency_contact_phone',
] as const;

export type ChangeableField = (typeof CHANGEABLE_FIELDS)[number];

export interface ProfileFieldChange {
  field: ChangeableField;
  from: string | null;
  to: string;
}

/** Only the fields whose requested value differs from the current one. */
export function diffProfileChange(
  current: Pick<Employee, ChangeableField>,
  requested: Record<ChangeableField, string>,
): ProfileFieldChange[] {
  return CHANGEABLE_FIELDS.flatMap((field) => {
    const from = current[field] ?? null;
    const to = requested[field];
    return from === to ? [] : [{ field, from, to }];
  });
}
