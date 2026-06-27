import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

@Entity('leave_balances')
@Unique(['employee', 'year'])
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (e) => e.leave_balances, { onDelete: 'CASCADE' })
  employee: Employee;

  @Column()
  year: number;

  @Column({ default: 18 })
  vacation_days: number;

  @Column({ default: 3 })
  sick_days: number;
}
