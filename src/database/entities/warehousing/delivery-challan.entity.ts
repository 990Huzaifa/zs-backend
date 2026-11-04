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
import { Driver } from '../driver.entity';
import { Shop } from '../shop.entity';
import { Vehicle } from '../vehicle.entity';
import { InventoryLog, PrimaryInventory } from './inventory.entity';

export enum DeliveryChallanStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

@Entity('delivery_challans')
export class DeliveryChallan {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', unique: true })
    challanNo: string;

    @Column({ type: 'timestamp' })
    challanDateTime: Date;

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

    @ManyToOne(() => Shop, (shop) => shop.deliveryChallans)
    @JoinColumn({ name: 'shopId' })
    shop: Shop;

    @Column({ type: 'uuid' })
    driverId: string;

    @ManyToOne(() => Driver, (driver) => driver.deliveryChallans)
    @JoinColumn({ name: 'driverId' })
    driver: Driver;

    @Column({ type: 'uuid' })
    vehicleId: string;

    @ManyToOne(() => Vehicle, (vehicle) => vehicle.deliveryChallans)
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    @Column({ type: 'int', default: 0 })
    totalInvoices: number;

    @Column({ type: 'int', default: 0 })
    totalCartons: number;

    @Column({ type: 'int', default: 0 })
    totalPairs: number;

    @Column({
        type: 'enum',
        enum: DeliveryChallanStatus,
        default: DeliveryChallanStatus.PENDING,
    })
    status: DeliveryChallanStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(
        () => DeliveryChallanItem,
        (deliveryChallanItem) => deliveryChallanItem.deliveryChallan,
    )
    items: DeliveryChallanItem[];
}

@Entity('delivery_challan_items')
export class DeliveryChallanItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    deliveryChallanId: string;

    @ManyToOne(
        () => DeliveryChallan,
        (deliveryChallan) => deliveryChallan.items,
        { onDelete: 'CASCADE' },
    )
    @JoinColumn({ name: 'deliveryChallanId' })
    deliveryChallan: DeliveryChallan;

    /** Inventory log (stock entry / invoice) id */
    @Column({ type: 'uuid' })
    inventoryId: string;

    @ManyToOne(() => InventoryLog, (log) => log.deliveryChallanItems, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'inventoryId' })
    inventory: InventoryLog;

    @Column({ type: 'int' })
    noOfCartons: number;

    @Column({ type: 'int', default: 0 })
    noOfPairs: number;

    @Column({ type: 'varchar', nullable: true })
    remarks: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
