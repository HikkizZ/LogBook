import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'app_setting' })
export class AppSetting {
  @PrimaryColumn({ type: 'varchar' })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;
}
