import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('transporters')
export class Transporter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  phoneNumber: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
