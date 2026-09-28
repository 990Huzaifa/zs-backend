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

@Entity('shop_categories')
export class ShopCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(() => Shop, (shop) => shop.shopCategory)
  shops: Shop[];
}

@Entity('shop')
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  shopCategoryId: string | null;

  @ManyToOne(() => ShopCategory, (shopCategory) => shopCategory.shops, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'shopCategoryId' })
  shopCategory: ShopCategory | null;

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
