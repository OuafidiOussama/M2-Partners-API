import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { LeaveRequest } from '../leaves/leave-request.entity';
import { LeaveBalance } from '../leaves/leave-balance.entity';
import { DocumentRequest } from '../documents/document-request.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (u) => u.employee, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  full_name: string;

  @Column({ unique: true })
  cin: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  net_salary: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  gross_salary: number;

  @OneToMany(() => LeaveRequest, (l) => l.employee)
  leave_requests: LeaveRequest[];

  @OneToMany(() => LeaveBalance, (b) => b.employee)
  leave_balances: LeaveBalance[];

  @OneToMany(() => DocumentRequest, (d) => d.employee)
  document_requests: DocumentRequest[];
}
