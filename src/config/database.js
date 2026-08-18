const { Sequelize } = require("sequelize");
const env = require("./env");

const sequelize = new Sequelize(
  env.db.database,
  env.db.username,
  env.db.password,
  {
    host: env.db.host,
    port: env.db.port,
    dialect: "mysql",
    logging: env.db.logging ? console.log : false,
    define: {
      underscored: true,
      freezeTableName: true
    },
    dialectOptions: {
      decimalNumbers: false
    },
    pool: {
      max: 8,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

module.exports = sequelize;
