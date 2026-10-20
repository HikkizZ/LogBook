import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Card } from './card.js';

@Entity({ name: 'checklist_item' })
export class ChecklistItem {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId!: string;

  @ManyToOne(() => Card, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Relation<Card>;

  @Column({ type: 'varchar', length: 300 })
  text!: string;

  @Column({ type: 'boolean', default: false })
  done!: boolean;

  @Column({ type: 'integer' })
  position!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
