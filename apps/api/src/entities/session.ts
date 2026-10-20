import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'session' })
export class Session {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ name: 'id_hash', type: 'char', length: 64, unique: true })
  idHash!: string;

  // Las fechas de sesión las pone la app con su reloj (regla 13); el default de la base es solo respaldo.
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
