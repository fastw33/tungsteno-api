const express = require("express");
const { previewPurchasePrices } = require("../services/priceTableService");
const { asyncHandler, normalizeDate } = require("../utils/http");

const router = express.Router();

router.get(
  "/preview",
  asyncHandler(async (req, res) => {
    res.json(await previewPurchasePrices({
      tableDate: normalizeDate(req.query.tableDate),
      clientId: req.query.clientId || null
    }));
  })
);

module.exports = router;
