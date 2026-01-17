import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pools')
@Index(['chainId', 'token0', 'token1'])
@Index(['chainId', 'dexId'])
@Index(['chainId', 'poolAddress'], { unique: true })
export class Pool {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chainId: number;

  @Column({ length: 50 })
  dexId: string; // 'uniswap_v3', 'sushiswap', etc.

  @Column({ length: 42 })
  poolAddress: string;

  @Column({ length: 42 })
  token0: string;

  @Column({ length: 42 })
  token1: string;

  @Column({ nullable: true })
  fee: number; // V3 fee tier (500, 3000, 10000)

  @Column({ type: 'decimal', precision: 78, scale: 0, nullable: true })
  reserve0: string; // Store as string for bigint support

  @Column({ type: 'decimal', precision: 78, scale: 0, nullable: true })
  reserve1: string;

  @Column({ type: 'decimal', precision: 78, scale: 0, nullable: true })
  liquidity: string; // TVL or liquidity indicator

  @Column({ type: 'decimal', precision: 30, scale: 18, nullable: true })
  sqrtPriceX96: string; // V3 price state

  @Column({ nullable: true })
  tick: number; // V3 current tick

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date;

  @Column({ nullable: true })
  lastSyncedBlock: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
