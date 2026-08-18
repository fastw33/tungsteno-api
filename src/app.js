const cors = require("cors");
const express = require("express");
const catalogRoutes = require("./routes/catalogRoutes");
const masterDataRoutes = require("./routes/masterDataRoutes");
const priceTableRoutes = require("./routes/priceTableRoutes");
const { sequelize } = require("./models");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/tungsteno/health", async (req, res) => {
  let database = "desconectada";
  try {
    await sequelize.authenticate();
    database = "conectada";
  } catch (error) {
    database = "no disponible";
  }
  res.json({
    ok: true,
    service: "tungsteno-api",
    database
  });
});

app.use("/api/tungsteno/catalogs", catalogRoutes);
app.use("/api/tungsteno", masterDataRoutes);
app.use("/api/tungsteno/price-tables", priceTableRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const message = error.message || "Error interno del servidor";
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({
    message,
    detail: process.env.NODE_ENV === "development" ? error.stack : undefined
  });
});

module.exports = app;
