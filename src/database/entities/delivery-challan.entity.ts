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


@Entity('delivery_challan')
export class DeliveryChallan {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    dcNumber: string;

    @Column({ type: 'uuid' })
    primaryInventoryId: string;

    primaryInventory

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}