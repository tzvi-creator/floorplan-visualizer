import { Pool } from 'pg';

let pool: Pool | null = null;
export function db() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL לא מוגדר');
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''), ssl: local ? undefined : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000 });
  }
  return pool;
}

let ready: Promise<void> | null = null;
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await db().query(`CREATE TABLE IF NOT EXISTS vz_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        source_name text,
        analysis jsonb NOT NULL,
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_sample boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await db().query(`CREATE TABLE IF NOT EXISTS vz_art (
        plan_id uuid NOT NULL REFERENCES vz_plans(id) ON DELETE CASCADE,
        bld_id text NOT NULL,
        svg text NOT NULL,
        PRIMARY KEY (plan_id, bld_id)
      )`);
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}
