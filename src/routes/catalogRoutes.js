const express = require("express");
const { listCatalogs } = require("../services/catalogService");
const { asyncHandler } = require("../utils/http");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listCatalogs());
  })
);

module.exports = router;
