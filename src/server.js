const app = require("./app");
const env = require("./config/env");
const { sequelize } = require("./models");
const { cleanupUnusedTables } = require("./db/cleanupUnusedTables");
const { ensureDatabase } = require("./db/ensureDatabase");
const { seedDefaults } = require("./db/seedDefaults");
const { syncEurCop, syncUsdTrm } = require("./services/trmService");

async function syncStartupRates() {
  const today = new Date().toISOString().slice(0, 10);
  const results = await Promise.allSettled([
    syncUsdTrm(today),
    syncEurCop(today)
  ]);
  const failed = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "tasa no disponible");
  if (failed.length > 0) {
    console.warn(`Tasas iniciales pendientes: ${failed.join(" | ")}`);
  }
}

async function start() {
  try {
    await ensureDatabase();
    await sequelize.authenticate();
    if (env.dbSyncOnStart) {
      await sequelize.sync({ alter: true });
      await seedDefaults();
      await syncStartupRates();
      await cleanupUnusedTables();
      console.log("Base de datos tungsteno preparada.");
    }
    await new Promise((resolve, reject) => {
      const server = app.listen(env.port, () => {
        console.log(`Tungsteno API escuchando en http://localhost:${env.port}`);
        resolve(server);
      });
      server.on("error", reject);
    });
  } catch (error) {
    if (error && error.code === "EADDRINUSE") {
      console.error(`El puerto ${env.port} ya esta en uso.`);
    } else {
      console.error("No fue posible iniciar tungsteno-api:", error.message);
    }
    process.exit(1);
  }
}

start();
