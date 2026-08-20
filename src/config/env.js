require("dotenv").config();

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "si"].includes(String(value).toLowerCase());
}

function readCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  port: Number(process.env.PORT) || 4070,
  dbSyncOnStart: readBoolean(process.env.DB_SYNC_ON_START, true),
  cors: {
    origins: readCsv(process.env.CORS_ORIGINS),
    methods: readCsv(process.env.CORS_ALLOW_METHODS),
    allowedHeaders: readCsv(process.env.CORS_ALLOW_HEADERS),
    credentials: readBoolean(process.env.CORS_ALLOW_CREDENTIALS, false)
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || "tungsteno",
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    logging: readBoolean(process.env.DB_LOGGING, false)
  }
};
