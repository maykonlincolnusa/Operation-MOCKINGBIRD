import { MongoClient } from "mongodb";
import { Pool, PoolClient } from "pg";

export function createPostgresPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000
  });
}

export async function connectMongo(url: string): Promise<MongoClient> {
  const client = new MongoClient(url);
  await client.connect();
  return client;
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const migrations = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      credits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_users_tenant_tags ON users USING GIN(tags);
  `,
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id UUID NOT NULL,
      flow_id TEXT,
      campaign_id UUID,
      channel TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  campaigns: `
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      segmentation JSONB NOT NULL,
      schedule TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  analytics: `
    CREATE TABLE IF NOT EXISTS flow_metrics (
      tenant_id TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      messages_sent INTEGER NOT NULL DEFAULT 0,
      messages_failed INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, flow_id)
    );
    CREATE TABLE IF NOT EXISTS campaign_metrics (
      tenant_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      messages_sent INTEGER NOT NULL DEFAULT 0,
      messages_failed INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, campaign_id)
    );
  `,
  eventInbox: `
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  auth: `
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      roles TEXT[] NOT NULL DEFAULT '{admin}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `
};
