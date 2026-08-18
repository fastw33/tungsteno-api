const app = require("./app");
const env = require("./config/env");
const { sequelize } = require("./models");

async function start() {
  try {
    await sequelize.authenticate();
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
