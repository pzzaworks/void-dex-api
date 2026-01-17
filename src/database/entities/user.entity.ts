import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  walletAddress: string;

  @Column({ nullable: true, type: 'varchar' })
  nonce: string | null;

  @Column({ default: false })
  termsAccepted: boolean;

  @Column({ nullable: true, type: 'varchar' })
  termsSignature: string | null;

  @Column({ nullable: true, type: 'varchar' })
  termsVersion: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  termsAcceptedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
