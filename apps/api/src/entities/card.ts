import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Label } from './label.js';
import { Project } from './project.js';

export const CARD_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'blocked',
  'done',
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type CardPriority = (typeof CARD_PRIORITIES)[number];

@Entity({ name: 'card' })
export class Card {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ type: 'integer', unique: true, default: () => "nextval('card_number_seq')" })
  number!: number;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' })
  project!: Relation<Project>;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'enum', enum: CARD_STATUSES, enumName: 'card_status', default: 'backlog' })
  status!: CardStatus;

  @Column({ type: 'enum', enum: CARD_PRIORITIES, enumName: 'card_priority', default: 'medium' })
  priority!: CardPriority;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  // Columna generada por la base (spanish); nunca se escribe ni se carga por defecto.
  @Column({
    type: 'tsvector',
    generatedType: 'STORED',
    asExpression: `to_tsvector('spanish', "title" || ' ' || "description")`,
    select: false,
    insert: false,
    update: false,
  })
  search!: string;

  @ManyToMany(() => Label)
  @JoinTable({
    name: 'card_label',
    joinColumn: { name: 'card_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'label_id', referencedColumnName: 'id' },
  })
  labels!: Relation<Label[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
