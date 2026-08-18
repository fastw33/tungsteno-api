const { sequelize } = require("../models");
const { seedDefaults } = require("../db/seedDefaults");

async function main() {
  await sequelize.authenticate();
  await seedDefaults();
  console.log("Datos base tungsteno cargados.");
  await sequelize.close();
}

main().catch(async (error) => {
  console.error("No fue posible cargar datos base:", error.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
