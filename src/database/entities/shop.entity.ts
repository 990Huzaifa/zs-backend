import { Column, PrimaryGeneratedColumn, Entity, CreateDateColumn, UpdateDateColumn} from "typeorm";

@Entity('shop')
export class Shop {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    shopName: string;

    @Column({ type: 'varchar' })
    ownerName: string;

    @Column({ type: 'varchar' })
    ownerPhone: string;

    @Column({ type: 'varchar', unique: true })
    branchCode: string;

    @Column({ type: 'varchar', nullable: true })
    address: string | null;

    @Column({ type: 'varchar', nullable: true })
    state: string | null;

    @Column({ type: 'varchar', nullable: true })
    city: string | null;

    @Column({ type: 'varchar', nullable: true })
    lat: string | null;

    @Column({ type: 'varchar', nullable: true })
    lng: string | null;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;

}