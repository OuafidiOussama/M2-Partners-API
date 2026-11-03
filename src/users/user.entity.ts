import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
} from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { Employee } from '../employees/employee.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true, unique: true })
  azure_oid: string;

  @Column({ nullable: true })
  azure_email: string;

  @Column({ type: 'enum', enum: Role, default: Role.EMPLOYEE })
  role: Role;

  @CreateDateColumn()
  created_at: Date;

  @OneToOne(() => Employee, (e) => e.user)
  employee: Employee;
}
