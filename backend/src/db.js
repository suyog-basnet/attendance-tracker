require('dotenv').config();
const { Pool, types } = require('pg');

// Without this, node-postgres parses DATE columns into JS Date objects,
// which get interpreted in the server process's local timezone and can
// come out shifted by a day once serialized to JSON. Returning the raw
// 'YYYY-MM-DD' string instead avoids that entirely.
types.setTypeParser(1082, (val) => val); // 1082 = Postgres DATE oid

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
