import pg from 'pg';

const { Pool, Client } = pg;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

export function makePool(): pg.Pool {
  return new Pool({
    connectionString: connectionString(),
    // Neon requires SSL; node-postgres will infer from the URL's sslmode=require.
    max: 4,
  });
}

/**
 * A dedicated single-connection client. Useful for COPY streams, which
 * monopolise a connection for their duration.
 */
export async function makeClient(): Promise<pg.Client> {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  return client;
}
