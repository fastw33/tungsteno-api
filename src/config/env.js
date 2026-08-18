require("dotenv").config();

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "si"].includes(String(value).toLowerCase());
}

module.exports = {
  port: Number(process.env.PORT) || 4070,
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || "tungsteno",
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    logging: readBoolean(process.env.DB_LOGGING, false)
  }
};
