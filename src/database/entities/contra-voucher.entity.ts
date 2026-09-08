import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ChartOfAccount } from './chart-of-account.entity';
import { User } from './user.entity';
import { PaymentMethod, VoucherStatus } from './voucher.entity';

@Entity({ name: 'contra_vouchers' })
export class ContraVoucher {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    voucherNumber: string;

    @Column()
    fromAccId: string;

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'fromAccId' })
    fromAcc: ChartOfAccount;

    @Column()
    toAccId: string;

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'toAccId' })
    toAcc: ChartOfAccount;

    @Column({ type: 'enum', enum: PaymentMethod })
    paymentMethod: PaymentMethod;

    /** Required when paymentMethod is CHEQUE */
    @Column({ type: 'varchar', nullable: true })
    chequeNumber: string | null;

    @Column({ type: 'date', nullable: true })
    chequeDate: Date | null;

    @Column({ type: 'date' })
    paymentDate: Date;

    @Column({ type: 'decimal', precision: 20, scale: 2 })
    paymentAmount: number;

    @Column({ type: 'text', nullable: true })
    remarks: string | null;

    @Column({ type: 'uuid', nullable: true })
    createdBy: string | null;

    @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User | null;

    @Column({
        type: 'enum',
        enum: VoucherStatus,
        default: VoucherStatus.PENDING,
    })
    status: VoucherStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
