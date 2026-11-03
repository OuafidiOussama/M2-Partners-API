import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('holidays')
@Unique(['date', 'country_code'])
export class Holiday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  date: string;

  @Column()
  label: string;

  /** ISO 3166-1 alpha-2 */
  @Column({ type: 'char', length: 2 })
  country_code: string;
}
