import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm';
import { Warehouse } from './warehouse.entity';

@Entity('stock_balances')
export class StockBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    warehouseId?: string | null;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.id, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'warehouseId' })
    warehouse?: Warehouse | null;

    @Column({ type: 'int', default: 0 })
    avaiableCartons: number;

    @Column({ type: 'int', default: 0 })
    damagedCartons: number;

    @Column({ type: 'int', default: 0 })
    returnedCartons: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}