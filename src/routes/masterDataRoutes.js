const express = require("express");
const {
  createClient,
  createClientPrice,
  createCarrier,
  createCity,
  createFreightRate,
  createOperationalCost,
  createPricingPolicy,
  createProduct,
  deactivateProduct,
  listClientPrices,
  listClients,
  listExchangeRates,
  listFreightRates,
  listAdminChangeLogs,
  listOperationalCosts,
  listPricingPolicies,
  listProducts,
  upsertExchangeRate,
  updateClientPrice,
  updateFreightRateRow,
  updateOperationalCost,
  updateProduct,
  updatePricingPolicy
} = require("../services/masterDataService");
const { asyncHandler } = require("../utils/http");
const { syncEurCop, syncUsdTrm } = require("../services/trmService");

const router = express.Router();

router.get(
  "/products",
  asyncHandler(async (req, res) => {
    res.json({ items: await listProducts() });
  })
);

router.post(
  "/products",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createProduct(req.body));
  })
);

router.put(
  "/products/:id",
  asyncHandler(async (req, res) => {
    res.json(await updateProduct(req.params.id, req.body));
  })
);

router.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    res.json(await deactivateProduct(req.params.id));
  })
);

router.get(
  "/clients",
  asyncHandler(async (req, res) => {
    res.json({ items: await listClients() });
  })
);

router.post(
  "/clients",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createClient(req.body));
  })
);

router.post(
  "/cities",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCity(req.body));
  })
);

router.post(
  "/carriers",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCarrier(req.body));
  })
);

router.get(
  "/client-prices",
  asyncHandler(async (req, res) => {
    res.json({
      items: await listClientPrices({
        productId: req.query.productId,
        clientId: req.query.clientId
      })
    });
  })
);

router.post(
  "/client-prices",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createClientPrice(req.body));
  })
);

router.put(
  "/client-prices/:id",
  asyncHandler(async (req, res) => {
    res.json(await updateClientPrice(req.params.id, req.body));
  })
);

router.get(
  "/exchange-rates",
  asyncHandler(async (req, res) => {
    res.json({ items: await listExchangeRates({ currencyId: req.query.currencyId }) });
  })
);

router.post(
  "/exchange-rates",
  asyncHandler(async (req, res) => {
    res.status(201).json(await upsertExchangeRate(req.body));
  })
);

router.post(
  "/exchange-rates/sync",
  asyncHandler(async (req, res) => {
    res.status(201).json(await syncUsdTrm(req.body.rateDate || new Date().toISOString().slice(0, 10)));
  })
);

router.post(
  "/exchange-rates/sync-eur",
  asyncHandler(async (req, res) => {
    res.status(201).json(await syncEurCop(req.body.rateDate || new Date().toISOString().slice(0, 10)));
  })
);

router.get(
  "/operational-costs",
  asyncHandler(async (req, res) => {
    res.json({ items: await listOperationalCosts() });
  })
);

router.post(
  "/operational-costs",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createOperationalCost(req.body));
  })
);

router.put(
  "/operational-costs/:id",
  asyncHandler(async (req, res) => {
    res.json(await updateOperationalCost(req.params.id, req.body));
  })
);

router.get(
  "/pricing-policies",
  asyncHandler(async (req, res) => {
    res.json({ items: await listPricingPolicies() });
  })
);

router.get(
  "/admin-change-logs",
  asyncHandler(async (req, res) => {
    res.json({
      items: await listAdminChangeLogs({
        entityType: req.query.entityType,
        limit: req.query.limit
      })
    });
  })
);

router.post(
  "/pricing-policies",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createPricingPolicy(req.body));
  })
);

router.put(
  "/pricing-policies/:id",
  asyncHandler(async (req, res) => {
    res.json(await updatePricingPolicy(req.params.id, req.body));
  })
);

router.get(
  "/freight-rates",
  asyncHandler(async (req, res) => {
    res.json({ items: await listFreightRates() });
  })
);

router.post(
  "/freight-rates",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createFreightRate(req.body));
  })
);

router.put(
  "/freight-rate-rows/:id",
  asyncHandler(async (req, res) => {
    res.json(await updateFreightRateRow(req.params.id, req.body));
  })
);

module.exports = router;
