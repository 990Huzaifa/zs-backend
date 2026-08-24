import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    JoinTable,
    ManyToMany,
    OneToMany,
} from 'typeorm';
import { Permission } from './permission.entity';
import { User } from './user.entity';

@Entity({ name: 'roles' })
export class Role {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string; // SUPER_ADMIN, SUPPORT, etc.

    @Column()
    name: string;

    @Column({ default: true })
    isActive: boolean;

    // ✅ One Role → Many Users
    @OneToMany(() => User, (user) => user.role)
    users: User[];

    // ✅ One Role → Many Permissions
    @ManyToMany(() => Permission, (permission) => permission.roles, {
        // eager: true, // auto load permissions
    })
    @JoinTable({
        name: 'rolePermissions',
        joinColumn: {
            name: 'roleId',
            referencedColumnName: 'id',
        },
        inverseJoinColumn: {
            name: 'permissionId',
            referencedColumnName: 'id',
        },
    })
    permissions: Permission[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
