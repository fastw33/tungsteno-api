const express = require("express");
const {
  generateDailyPriceTable,
  getLatestPriceTable,
  getPriceTable,
  listPriceHistory,
  previewPurchasePrices
} = require("../services/priceTableService");
const { asyncHandler, normalizeDate } = require("../utils/http");

const router = express.Router();

router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const table = await generateDailyPriceTable({
      tableDate: normalizeDate(req.body.tableDate),
      clientId: req.body.clientId || null,
      originCityId: req.body.originCityId || null,
      destinationCityId: req.body.destinationCityId || null,
      notes: req.body.notes || ""
    });
    res.status(201).json(table);
  })
);

router.get(
  "/preview",
  asyncHandler(async (req, res) => {
    res.json(await previewPurchasePrices({
      tableDate: normalizeDate(req.query.tableDate),
      clientId: req.query.clientId || null
    }));
  })
);

router.get(
  "/latest",
  asyncHandler(async (req, res) => {
    const table = await getLatestPriceTable();
    if (!table) {
      return res.status(404).json({ message: "No hay tabla de precios generada" });
    }
    res.json(table);
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    res.json({
      items: await listPriceHistory({
        productId: req.query.productId,
        clientId: req.query.clientId,
        zoneId: req.query.zoneId,
        weightRangeId: req.query.weightRangeId,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        offset: req.query.offset
      })
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const table = await getPriceTable(req.params.id);
    if (!table) {
      return res.status(404).json({ message: "Tabla de precios no encontrada" });
    }
    res.json(table);
  })
);

module.exports = router;
