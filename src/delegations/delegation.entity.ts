import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

/**
 * An approver (delegator) hands their approval rights to another employee
 * (delegate) for a period. end_date null = open-ended until cancelled.
 */
@Entity('delegations')
@Check('CHK_delegations_not_self', `"delegator_id" <> "delegate_id"`)
@Check(
  'CHK_delegations_date_order',
  `"end_date" IS NULL OR "end_date" >= "start_date"`,
)
@Index('IDX_delegations_delegate_start', ['delegate', 'start_date'])
export class Delegation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delegator_id' })
  delegator: Employee;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delegate_id' })
  delegate: Employee;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
