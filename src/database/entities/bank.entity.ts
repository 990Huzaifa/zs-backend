import { Column, PrimaryGeneratedColumn, Entity } from "typeorm";

@Entity('banks')
export class Bank {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ unique: true })
    code: string;
}