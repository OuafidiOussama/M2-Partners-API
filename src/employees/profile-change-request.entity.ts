import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Employee } from './employee.entity';
import { User } from '../users/user.entity';
import { ChangeRequestStatus } from '../common/enums/change-request-status.enum';

/**
 * History only: employees now edit their details directly (PATCH /employees/me),
 * so nothing creates or reviews these rows any more.
 */
@Entity('profile_change_requests')
// At most one PENDING request per employee.
@Index('UQ_profile_change_requests_one_pending', ['employee'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
export class ProfileChangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column()
  mobile: string;

  @Column()
  emergency_contact_name: string;

  @Column()
  emergency_contact_phone: string;

  @Column({
    type: 'enum',
    enum: ChangeRequestStatus,
    default: ChangeRequestStatus.PENDING,
  })
  status: ChangeRequestStatus;

  @Column({ type: 'text', nullable: true })
  admin_reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
