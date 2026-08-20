const mysql = require("mysql2/promise");
const env = require("../config/env");

function quoteIdentifier(value) {
  return `\`${String(value || "").replace(/`/g, "``")}\``;
}

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.username,
    password: env.db.password
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(env.db.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

module.exports = {
  ensureDatabase
};
