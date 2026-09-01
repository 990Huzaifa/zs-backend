import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client, ClientPickupLocation } from './client.entity';

@Entity('warehouses')
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  clientId?: string | null;

  @ManyToOne(() => Client, (client) => client.warehouses, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'clientId' })
  client?: Client | null;

  // client location connect
  @Column({ type: 'uuid', nullable: true })
  pickupLocationId?: string | null;

  @ManyToOne(() => ClientPickupLocation, (pickupLocation) => pickupLocation.warehouses, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pickupLocationId' })
  pickupLocation?: ClientPickupLocation | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
