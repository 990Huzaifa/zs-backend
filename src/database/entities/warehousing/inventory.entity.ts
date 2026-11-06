import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Bilty } from '../bilty.entity';
import { Shop } from '../shop.entity';
import { Warehouse } from '../warehousing/warehouse.entity';
import { DeliveryChallanItem } from './delivery-challan.entity';

export enum LogType {
    INVENTORY_IN = 'INVENTORY_IN',
    INVENTORY_OUT = 'INVENTORY_OUT',
    INVENTORY_ADJUSTMENT = 'INVENTORY_ADJUSTMENT',
    INVENTORY_TRANSFER = 'INVENTORY_TRANSFER',
    INVENTORY_RETURN = 'INVENTORY_RETURN',
    INVENTORY_LOSS = 'INVENTORY_LOSS',
    INVENTORY_THEFT = 'INVENTORY_THEFT',
    INVENTORY_EXPIRED = 'INVENTORY_EXPIRED',
}

/**
 * Primary warehouse stock row — one bilty receipt into a warehouse.
 * List UI columns mostly come from linked bilty + warehouse.
 */
@Entity('primary_inventory')
export class PrimaryInventory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Auto-generated: `PMI-0001`, `PMI-0002`, … */
    @Column({ type: 'varchar', unique: true })
    primaryCode: string;

    @Column({ type: 'uuid' })
    warehouseId: string;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.primaries, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

    @Column({ type: 'uuid', unique: true })
    biltyId: string;

    @ManyToOne(() => Bilty, (bilty) => bilty.primaries, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'biltyId' })
    bilty: Bilty;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => InventoryLog, (inventoryLog) => inventoryLog.primaryInventory)
    inventoryLogs: InventoryLog[];
}

@Entity('inventory_logs')
export class InventoryLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    primaryInventoryId: string;

    @ManyToOne(() => PrimaryInventory, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'primaryInventoryId' })
    primaryInventory: PrimaryInventory;

    @Column({ type: 'uuid' })
    shopId: string;

    @ManyToOne(() => Shop, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'shopId' })
    shop: Shop;

    @Column({ type: 'varchar' })
    InvoiceNo: string;

    @Column({ type: 'int' })
    noOfCartons: number;

    @Column({ type: 'int', default: 0 })
    noOfPairs: number;

    @Column({ type: 'int', default: 0 })
    damagedCartons: number;

    @Column({ type: 'int', default: 0 })
    returnedCartons: number;

    @Column({ type: 'varchar', nullable: true })
    remarks?: string | null;

    @Column({ type: 'jsonb', nullable: true })
    proofImages?: string[] | null;

    @Column({ type: 'enum', enum: LogType })
    logType: LogType;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(
        () => DeliveryChallanItem,
        (deliveryChallanItem) => deliveryChallanItem.inventory,
    )
    deliveryChallanItems: DeliveryChallanItem[];
}




@Entity('secondary_inventory')
export class SecondaryInventory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    stockCode: string;

    @Column({ type: 'uuid' })
    primaryInventoryId: string;

    @ManyToOne(() => PrimaryInventory, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'primaryInventoryId' })
    primaryInventory: PrimaryInventory;

    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('stock_balances')
export class StockBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid', nullable: true })
    warehouseId?: string | null;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.id, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'warehouseId' })
    warehouse?: Warehouse | null;

    @Column({ type: 'uuid', nullable: true })
    shopId?: string | null;

    @ManyToOne(() => Shop, (shop) => shop.id, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'shopId' })
    shop?: Shop | null;

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
