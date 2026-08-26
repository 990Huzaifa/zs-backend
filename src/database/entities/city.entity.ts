import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    OneToMany,
} from 'typeorm';
import { State } from './state.entity';
import { Vendor } from './vendor.entity';
import { Client } from './client.entity';

@Entity({ name: 'cities' })
export class City {
    @PrimaryGeneratedColumn()
    id: string;

    @Column()
    stateId: string;

    @ManyToOne(() => State, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'stateId' })
    state: State;

    @Column({ length: 150 })
    name: string;

    @Column({ length: 20, nullable: true })
    code: string;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Vendor, (vendor) => vendor.city)
    vendors: Vendor[];

    @OneToMany(() => Client, (client) => client.city)
    clients: Client[];
}
