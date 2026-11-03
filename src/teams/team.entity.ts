import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

/** A named group of employees; an employee can be in several teams. */
@Entity('teams')
// Unique on LOWER(name); created by migration, as TypeORM cannot express it.
@Index('UQ_teams_name_lower', { synchronize: false })
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToMany(() => Employee)
  @JoinTable({
    name: 'team_members',
    joinColumn: { name: 'team_id' },
    inverseJoinColumn: { name: 'employee_id' },
  })
  members: Employee[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
