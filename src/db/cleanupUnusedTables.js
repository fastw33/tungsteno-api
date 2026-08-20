const { sequelize } = require("../models");

const unusedTables = [
  "daily_price_changes",
  "price_generation_issues",
  "daily_price_table_rows",
  "daily_price_tables",
  "supplier_purchase_price_periods",
  "package_profiles",
  "price_change_reasons"
];

async function cleanupUnusedTables() {
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of unusedTables) {
      await sequelize.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await sequelize.query(
      "DELETE FROM `operational_cost_periods` WHERE `notes` = 'Base inicial editable desde Admin W' AND `cost_cop_per_kg` = 0"
    );
  } finally {
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

module.exports = {
  cleanupUnusedTables,
  unusedTables
};
