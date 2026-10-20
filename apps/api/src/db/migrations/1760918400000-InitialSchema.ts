import type { MigrationInterface, QueryRunner } from 'typeorm';

// Esquema completo de v1 (especificación §3). Sin github_delivery (v2).
export class InitialSchema1760918400000 implements MigrationInterface {
  name = 'InitialSchema1760918400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "card_status" AS ENUM ('backlog', 'todo', 'in_progress', 'review', 'blocked', 'done')`,
    );
    await q.query(`CREATE TYPE "card_priority" AS ENUM ('low', 'medium', 'high', 'urgent')`);
    await q.query(`CREATE TYPE "log_kind" AS ENUM ('note', 'blocked', 'moved', 'commit', 'pr')`);
    await q.query(`CREATE TYPE "log_source" AS ENUM ('ui', 'api', 'github')`);
    await q.query(`CREATE SEQUENCE "card_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1`);

    await q.query(`
      CREATE TABLE "project" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "name" varchar(80) NOT NULL,
        "slug" varchar(80) NOT NULL,
        "color" varchar(20) NOT NULL,
        "github_repo" varchar(140),
        "wip_limit" smallint NOT NULL DEFAULT 3,
        "archived_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_slug" UNIQUE ("slug"),
        CONSTRAINT "CHK_project_wip_limit" CHECK ("wip_limit" >= 0)
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_project_name_active" ON "project" ("name") WHERE "archived_at" IS NULL`,
    );

    await q.query(`
      CREATE TABLE "label" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "name" varchar(40) NOT NULL,
        "color" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_label" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_label_name_lower" ON "label" (lower("name"))`);

    await q.query(`
      CREATE TABLE "card" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "number" integer NOT NULL DEFAULT nextval('card_number_seq'),
        "project_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "status" "card_status" NOT NULL DEFAULT 'backlog',
        "priority" "card_priority" NOT NULL DEFAULT 'medium',
        "position" integer NOT NULL,
        "start_date" date,
        "due_date" date,
        "completed_at" timestamptz,
        "archived_at" timestamptz,
        "search" tsvector GENERATED ALWAYS AS (to_tsvector('spanish', "title" || ' ' || "description")) STORED,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_card" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_card_number" UNIQUE ("number"),
        CONSTRAINT "FK_card_project" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_card_title" CHECK (char_length("title") > 0),
        CONSTRAINT "CHK_card_dates" CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date")
      )
    `);
    await q.query(`ALTER SEQUENCE "card_number_seq" OWNED BY "card"."number"`);
    await q.query(`CREATE INDEX "IDX_card_board" ON "card" ("project_id", "status", "position")`);
    await q.query(
      `CREATE INDEX "IDX_card_due_date" ON "card" ("due_date") WHERE "archived_at" IS NULL AND "status" NOT IN ('done')`,
    );
    await q.query(`CREATE INDEX "IDX_card_search" ON "card" USING GIN ("search")`);

    await q.query(`
      CREATE TABLE "card_label" (
        "card_id" uuid NOT NULL,
        "label_id" uuid NOT NULL,
        CONSTRAINT "PK_card_label" PRIMARY KEY ("card_id", "label_id"),
        CONSTRAINT "FK_card_label_card" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_card_label_label" FOREIGN KEY ("label_id") REFERENCES "label" ("id") ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE TABLE "checklist_item" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "card_id" uuid NOT NULL,
        "text" varchar(300) NOT NULL,
        "done" boolean NOT NULL DEFAULT false,
        "position" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_checklist_item" PRIMARY KEY ("id"),
        CONSTRAINT "FK_checklist_item_card" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_checklist_item_card" ON "checklist_item" ("card_id", "position")`,
    );

    await q.query(`
      CREATE TABLE "log_entry" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "card_id" uuid NOT NULL,
        "kind" "log_kind" NOT NULL,
        "source" "log_source" NOT NULL,
        "body" text NOT NULL,
        "occurred_at" timestamptz NOT NULL DEFAULT now(),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "search" tsvector GENERATED ALWAYS AS (to_tsvector('spanish', "body")) STORED,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_log_entry" PRIMARY KEY ("id"),
        CONSTRAINT "FK_log_entry_card" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_log_entry_card_occurred" ON "log_entry" ("card_id", "occurred_at")`,
    );
    await q.query(`CREATE INDEX "IDX_log_entry_occurred" ON "log_entry" ("occurred_at")`);
    await q.query(`CREATE INDEX "IDX_log_entry_search" ON "log_entry" USING GIN ("search")`);

    await q.query(`
      CREATE TABLE "api_token" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "name" varchar(80) NOT NULL,
        "prefix" char(8) NOT NULL,
        "token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "last_used_at" timestamptz,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_token" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_api_token_prefix" UNIQUE ("prefix")
      )
    `);

    await q.query(`
      CREATE TABLE "session" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "id_hash" char(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz,
        CONSTRAINT "PK_session" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_session_id_hash" UNIQUE ("id_hash")
      )
    `);

    await q.query(`
      CREATE TABLE "app_setting" (
        "key" varchar NOT NULL,
        "value" jsonb NOT NULL,
        CONSTRAINT "PK_app_setting" PRIMARY KEY ("key")
      )
    `);

    // Seed: proyecto Personal (RF-05), etiquetas (RF-23) y settings por defecto.
    await q.query(
      `INSERT INTO "project" ("name", "slug", "color") VALUES ('Personal', 'personal', 'pizarra')`,
    );
    await q.query(`
      INSERT INTO "label" ("name", "color") VALUES
        ('bug', 'magenta'),
        ('feature', 'violeta'),
        ('investigación', 'turquesa'),
        ('reunión', 'cafe'),
        ('deuda técnica', 'oliva'),
        ('docs', 'gris')
    `);
    await q.query(`
      INSERT INTO "app_setting" ("key", "value") VALUES
        ('timezone', '"America/Santiago"'::jsonb),
        ('done_days_visible', '14'::jsonb),
        ('wip_default', '3'::jsonb)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "app_setting"`);
    await q.query(`DROP TABLE "session"`);
    await q.query(`DROP TABLE "api_token"`);
    await q.query(`DROP TABLE "log_entry"`);
    await q.query(`DROP TABLE "checklist_item"`);
    await q.query(`DROP TABLE "card_label"`);
    await q.query(`DROP TABLE "card"`);
    await q.query(`DROP TABLE "label"`);
    await q.query(`DROP TABLE "project"`);
    await q.query(`DROP SEQUENCE IF EXISTS "card_number_seq"`);
    await q.query(`DROP TYPE "log_source"`);
    await q.query(`DROP TYPE "log_kind"`);
    await q.query(`DROP TYPE "card_priority"`);
    await q.query(`DROP TYPE "card_status"`);
  }
}
