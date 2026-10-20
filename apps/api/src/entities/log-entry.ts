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

export const LOG_KINDS = ['note', 'blocked', 'moved', 'commit', 'pr'] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_SOURCES = ['ui', 'api', 'github'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

@Entity({ name: 'log_entry' })
export class LogEntry {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId!: string;

  @ManyToOne(() => Card, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card!: Relation<Card>;

  @Column({ type: 'enum', enum: LOG_KINDS, enumName: 'log_kind' })
  kind!: LogKind;

  @Column({ type: 'enum', enum: LOG_SOURCES, enumName: 'log_source' })
  source!: LogSource;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  // Columna generada por la base (spanish); nunca se escribe ni se carga por defecto.
  @Column({
    type: 'tsvector',
    generatedType: 'STORED',
    asExpression: `to_tsvector('spanish', "body")`,
    select: false,
    insert: false,
    update: false,
  })
  search!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
