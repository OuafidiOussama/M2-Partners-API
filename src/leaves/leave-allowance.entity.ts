import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

export const DEFAULT_VACATION_TOTAL = 18;
export const DEFAULT_SICK_TOTAL = 2;

/** Yearly vacation days by country; anywhere else gets the default. */
const VACATION_TOTAL_BY_COUNTRY: Record<string, number> = { CA: 15 };

export function vacationTotalFor(countryCode: string): number {
  return VACATION_TOTAL_BY_COUNTRY[countryCode] ?? DEFAULT_VACATION_TOTAL;
}

/**
 * Yearly leave entitlement. Only totals are stored — taken / pending /
 * remaining are always derived from leave_requests.
 */
@Entity('leave_allowances')
@Unique(['employee', 'year'])
export class LeaveAllowance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (e) => e.leave_allowances, { onDelete: 'CASCADE' })
  employee: Employee;

  @Column()
  year: number;

  @Column({ default: DEFAULT_VACATION_TOTAL })
  vacation_total: number;

  @Column({ default: DEFAULT_SICK_TOTAL })
  sick_total: number;
}
