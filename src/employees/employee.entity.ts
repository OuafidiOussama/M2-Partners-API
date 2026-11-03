import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  ManyToOne,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { User } from '../users/user.entity';
import { LeaveRequest } from '../leaves/leave-request.entity';
import { LeaveAllowance } from '../leaves/leave-allowance.entity';
import { ContractType } from '../common/enums/contract-type.enum';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (u) => u.employee, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  /** Derived from first_name + last_name; kept in sync by syncFullName(). */
  @Column()
  full_name: string;

  @Column({ type: 'varchar', nullable: true })
  job_title: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  mobile: string | null;

  /** ISO 3166-1 alpha-2; drives the employee's stat holidays. */
  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'varchar', nullable: true })
  emergency_contact_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  emergency_contact_phone: string | null;

  @Column({ type: 'enum', enum: ContractType, default: ContractType.FULL_TIME })
  contract_type: ContractType;

  @Column({ type: 'varchar', nullable: true })
  work_hours: string | null;

  @Column({ type: 'varchar', nullable: true })
  office: string | null;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'line_manager_id' })
  line_manager: Employee | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'date' })
  start_date: string;

  @OneToMany(() => LeaveRequest, (l) => l.employee)
  leave_requests: LeaveRequest[];

  @OneToMany(() => LeaveAllowance, (b) => b.employee)
  leave_allowances: LeaveAllowance[];

  @BeforeInsert()
  @BeforeUpdate()
  syncFullName(): void {
    if (this.first_name !== undefined && this.last_name !== undefined) {
      this.full_name = `${this.first_name} ${this.last_name}`.trim();
    }
  }
}
