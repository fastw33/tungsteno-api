const { sequelize } = require("../models");
const { seedDefaults } = require("../db/seedDefaults");

async function main() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  await seedDefaults();
  console.log("Base de datos tungsteno sincronizada.");
  await sequelize.close();
}

main().catch(async (error) => {
  console.error("No fue posible sincronizar la base de datos:", error.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
