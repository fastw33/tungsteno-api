const {
  AdminChangeLog,
  Carrier,
  City,
  Client,
  ClientPricePeriod,
  Currency,
  ExchangeRate,
  FreightRatePeriod,
  FreightRateRow,
  OperationalCostPeriod,
  PricingPolicyPeriod,
  Product,
  WeightRange,
  Zone
} = require("../models");
const { cleanText } = require("../utils/http");
const { toNumber } = require("../utils/numbers");

function snapshot(record) {
  return record ? record.toJSON() : null;
}

async function logAdminChange({ entityType, entityId, action, beforeData, afterData, note }) {
  return AdminChangeLog.create({
    entityType,
    entityId: entityId || null,
    action,
    beforeData,
    afterData,
    changedBy: "admin",
    note: cleanText(note)
  });
}

function ensureRequired(value, message) {
  if (!value) {
    throw Object.assign(new Error(message), { status: 400 });
  }
}

async function listProducts() {
  return Product.findAll({ order: [["name", "ASC"]] });
}

async function createProduct(payload = {}) {
  const name = cleanText(payload.name);
  ensureRequired(name, "El nombre del producto es obligatorio");
  const existing = await Product.findOne({ where: { name } });
  if (existing) {
    return existing;
  }
  const created = await Product.create({
    name,
    family: cleanText(payload.family) || "Tungsteno",
    description: cleanText(payload.description),
    isActive: payload.isActive !== false
  });
  await logAdminChange({
    entityType: "product",
    entityId: created.id,
    action: "create",
    beforeData: null,
    afterData: snapshot(created),
    note: "Producto creado desde Admin W"
  });
  return created;
}

async function listClients() {
  return Client.findAll({ order: [["name", "ASC"]] });
}

async function createClient(payload = {}) {
  const name = cleanText(payload.name);
  ensureRequired(name, "El nombre del cliente es obligatorio");
  const existing = await Client.findOne({ where: { name } });
  if (existing) {
    return existing;
  }
  const created = await Client.create({
    name,
    taxId: cleanText(payload.taxId),
    contactName: cleanText(payload.contactName),
    email: cleanText(payload.email),
    phone: cleanText(payload.phone),
    isActive: payload.isActive !== false
  });
  await logAdminChange({
    entityType: "client",
    entityId: created.id,
    action: "create",
    beforeData: null,
    afterData: snapshot(created),
    note: "Cliente creado desde Admin W"
  });
  return created;
}

async function listClientPrices(filters = {}) {
  const where = {};
  if (filters.productId) {
    where.productId = filters.productId;
  }
  if (filters.clientId) {
    where.clientId = filters.clientId;
  }
  return ClientPricePeriod.findAll({
    where,
    include: [Product, Client, Currency],
    order: [["validFrom", "DESC"], ["createdAt", "DESC"]]
  });
}

async function createClientPrice(payload = {}) {
  ensureRequired(payload.productId, "El producto es obligatorio");
  ensureRequired(payload.clientId, "El cliente es obligatorio");
  ensureRequired(payload.currencyId || payload.currencyCode, "La moneda es obligatoria");
  ensureRequired(payload.validFrom, "La fecha inicial de vigencia es obligatoria");
  ensureRequired(payload.validTo, "La fecha de vencimiento es obligatoria");
  let currency = payload.currencyId
    ? await Currency.findByPk(payload.currencyId)
    : await Currency.findOne({ where: { code: String(payload.currencyCode || "").toUpperCase() } });
  const currencyCode = String(payload.currencyCode || "").toUpperCase();
  if (!currency && ["COP", "USD", "EUR"].includes(currencyCode)) {
    currency = await Currency.create({
      code: currencyCode,
      name: currencyCode === "COP"
        ? "Peso colombiano"
        : currencyCode === "USD"
          ? "Dolar estadounidense"
          : "Euro"
    });
  }
  if (!currency) {
    throw Object.assign(new Error("La moneda no existe en el catalogo"), { status: 400 });
  }

  const created = await ClientPricePeriod.create({
    productId: payload.productId,
    clientId: payload.clientId,
    currencyId: currency.id,
    pricePerKg: toNumber(payload.pricePerKg),
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    status: payload.status || "active",
    sourceReference: cleanText(payload.sourceReference),
    notes: cleanText(payload.notes)
  });
  await logAdminChange({
    entityType: "client_price_period",
    entityId: created.id,
    action: "create",
    beforeData: null,
    afterData: snapshot(created),
    note: "Precio cliente creado desde Admin W"
  });
  return created;
}

async function listExchangeRates(filters = {}) {
  const where = {};
  if (filters.currencyId) {
    where.currencyId = filters.currencyId;
  }
  return ExchangeRate.findAll({
    where,
    include: [Currency],
    order: [["rateDate", "DESC"]]
  });
}

async function upsertExchangeRate(payload = {}) {
  ensureRequired(payload.currencyId, "La moneda es obligatoria");
  ensureRequired(payload.rateDate, "La fecha de tasa es obligatoria");
  const existing = await ExchangeRate.findOne({
    where: {
      currencyId: payload.currencyId,
      rateDate: payload.rateDate
    }
  });
  const beforeData = snapshot(existing);
  const rate = existing || await ExchangeRate.create({
    currencyId: payload.currencyId,
    rateDate: payload.rateDate,
    rateToCop: toNumber(payload.rateToCop),
    source: cleanText(payload.source) || "manual"
  });
  if (existing) {
    await rate.update({
      rateToCop: toNumber(payload.rateToCop),
      source: cleanText(payload.source) || "manual"
    });
  }
  await logAdminChange({
    entityType: "exchange_rate",
    entityId: rate.id,
    action: existing ? "update" : "create",
    beforeData,
    afterData: snapshot(rate),
    note: "TRM guardada desde Admin W"
  });
  return rate;
}

async function listOperationalCosts() {
  return OperationalCostPeriod.findAll({
    include: [Zone],
    order: [["validFrom", "DESC"]]
  });
}

async function createOperationalCost(payload = {}) {
  ensureRequired(payload.zoneId, "La zona es obligatoria");
  ensureRequired(payload.validFrom, "La vigencia inicial es obligatoria");
  ensureRequired(payload.validTo, "La vigencia final es obligatoria");
  const created = await OperationalCostPeriod.create({
    zoneId: payload.zoneId,
    costCopPerKg: toNumber(payload.costCopPerKg),
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    notes: cleanText(payload.notes)
  });
  await logAdminChange({
    entityType: "operational_cost_period",
    entityId: created.id,
    action: "create",
    beforeData: null,
    afterData: snapshot(created),
    note: "Gasto operativo creado desde Admin W"
  });
  return created;
}

async function listPricingPolicies() {
  return PricingPolicyPeriod.findAll({
    include: [Product, Zone, WeightRange],
    order: [["validFrom", "DESC"], ["updatedAt", "DESC"]]
  });
}

async function createPricingPolicy(payload = {}) {
  ensureRequired(payload.validFrom, "La vigencia inicial es obligatoria");
  ensureRequired(payload.validTo, "La vigencia final es obligatoria");
  const minGrossMarginPct = toNumber(payload.minGrossMarginPct, toNumber(payload.targetGrossMarginPct));
  const maxGrossMarginPct = toNumber(payload.maxGrossMarginPct, toNumber(payload.targetGrossMarginPct, minGrossMarginPct));
  const created = await PricingPolicyPeriod.create({
    productId: payload.productId || null,
    zoneId: payload.zoneId || null,
    weightRangeId: payload.weightRangeId || null,
    minGrossMarginPct,
    targetGrossMarginPct: maxGrossMarginPct,
    maxGrossMarginPct,
    roundingCop: toNumber(payload.roundingCop, 1000),
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    notes: cleanText(payload.notes)
  });
  await logAdminChange({
    entityType: "pricing_policy_period",
    entityId: created.id,
    action: "create",
    beforeData: null,
    afterData: snapshot(created),
    note: "Banda de rentabilidad creada desde Admin W"
  });
  return created;
}

async function updatePricingPolicy(id, payload = {}) {
  const policy = await PricingPolicyPeriod.findByPk(id);
  if (!policy) {
    throw Object.assign(new Error("No existe la politica de margen"), { status: 404 });
  }
  const minGrossMarginPct =
    payload.minGrossMarginPct === undefined
      ? toNumber(policy.minGrossMarginPct, toNumber(policy.targetGrossMarginPct))
      : toNumber(payload.minGrossMarginPct);
  const maxGrossMarginPct =
    payload.maxGrossMarginPct === undefined
      ? toNumber(policy.maxGrossMarginPct, toNumber(policy.targetGrossMarginPct))
      : toNumber(payload.maxGrossMarginPct);
  const beforeData = snapshot(policy);
  await policy.update({
    productId: payload.productId === undefined ? policy.productId : payload.productId || null,
    zoneId: payload.zoneId === undefined ? policy.zoneId : payload.zoneId || null,
    weightRangeId:
      payload.weightRangeId === undefined ? policy.weightRangeId : payload.weightRangeId || null,
    minGrossMarginPct,
    targetGrossMarginPct: maxGrossMarginPct,
    maxGrossMarginPct,
    roundingCop:
      payload.roundingCop === undefined ? policy.roundingCop : toNumber(payload.roundingCop, 1000),
    validFrom: payload.validFrom || policy.validFrom,
    validTo: payload.validTo || policy.validTo,
    notes: payload.notes === undefined ? policy.notes : cleanText(payload.notes)
  });
  await logAdminChange({
    entityType: "pricing_policy_period",
    entityId: policy.id,
    action: "update",
    beforeData,
    afterData: snapshot(policy),
    note: "Banda de rentabilidad actualizada desde Admin W"
  });
  return PricingPolicyPeriod.findByPk(policy.id, { include: [Product, Zone, WeightRange] });
}

async function listAdminChangeLogs(filters = {}) {
  const where = {};
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }
  return AdminChangeLog.findAll({
    where,
    order: [["changedAt", "DESC"]],
    limit: Math.min(Math.max(Number(filters.limit) || 30, 1), 100)
  });
}

async function listFreightRates() {
  return FreightRatePeriod.findAll({
    include: [
      Carrier,
      { model: City, as: "originCity" },
      { model: City, as: "destinationCity" },
      FreightRateRow
    ],
    order: [["validFrom", "DESC"]]
  });
}

async function updateOperationalCost(id, payload = {}) {
  const cost = await OperationalCostPeriod.findByPk(id);
  if (!cost) {
    throw Object.assign(new Error("No existe el gasto operativo"), { status: 404 });
  }
  const beforeData = snapshot(cost);
  await cost.update({
    zoneId: payload.zoneId || cost.zoneId,
    costCopPerKg:
      payload.costCopPerKg === undefined ? cost.costCopPerKg : toNumber(payload.costCopPerKg),
    validFrom: payload.validFrom || cost.validFrom,
    validTo: payload.validTo || cost.validTo,
    notes: payload.notes === undefined ? cost.notes : cleanText(payload.notes)
  });
  await logAdminChange({
    entityType: "operational_cost_period",
    entityId: cost.id,
    action: "update",
    beforeData,
    afterData: snapshot(cost),
    note: "Gasto operativo actualizado desde Admin W"
  });
  return OperationalCostPeriod.findByPk(cost.id, { include: [Zone] });
}

async function updateClientPrice(id, payload = {}) {
  const price = await ClientPricePeriod.findByPk(id);
  if (!price) {
    throw Object.assign(new Error("No existe el precio cliente"), { status: 404 });
  }
  const beforeData = snapshot(price);
  await price.update({
    productId: payload.productId || price.productId,
    clientId: payload.clientId || price.clientId,
    currencyId: payload.currencyId || price.currencyId,
    pricePerKg: payload.pricePerKg === undefined ? price.pricePerKg : toNumber(payload.pricePerKg),
    validFrom: payload.validFrom || price.validFrom,
    validTo: payload.validTo || price.validTo,
    status: payload.status || price.status,
    sourceReference:
      payload.sourceReference === undefined ? price.sourceReference : cleanText(payload.sourceReference),
    notes: payload.notes === undefined ? price.notes : cleanText(payload.notes)
  });
  await logAdminChange({
    entityType: "client_price_period",
    entityId: price.id,
    action: "update",
    beforeData,
    afterData: snapshot(price),
    note: "Precio cliente actualizado desde Admin W"
  });
  return ClientPricePeriod.findByPk(price.id, { include: [Product, Client, Currency] });
}

async function updateFreightRateRow(id, payload = {}) {
  const row = await FreightRateRow.findByPk(id);
  if (!row) {
    throw Object.assign(new Error("No existe la fila de flete"), { status: 404 });
  }
  const beforeData = snapshot(row);
  await row.update({
    minBillableKg:
      payload.minBillableKg === undefined ? row.minBillableKg : toNumber(payload.minBillableKg),
    maxBillableKg:
      payload.maxBillableKg === undefined ? row.maxBillableKg : toNumber(payload.maxBillableKg),
    basePriceCop:
      payload.basePriceCop === undefined ? row.basePriceCop : toNumber(payload.basePriceCop),
    additionalKgPriceCop:
      payload.additionalKgPriceCop === undefined
        ? row.additionalKgPriceCop
        : toNumber(payload.additionalKgPriceCop),
    insurancePct:
      payload.insurancePct === undefined ? row.insurancePct : toNumber(payload.insurancePct),
    minInsuranceCop:
      payload.minInsuranceCop === undefined ? row.minInsuranceCop : toNumber(payload.minInsuranceCop)
  });
  await logAdminChange({
    entityType: "freight_rate_row",
    entityId: row.id,
    action: "update",
    beforeData,
    afterData: snapshot(row),
    note: "Flete por rango actualizado desde Admin W"
  });
  return FreightRateRow.findByPk(row.id, { include: [FreightRatePeriod] });
}

async function createFreightRate(payload = {}) {
  ensureRequired(payload.carrierId, "La transportadora es obligatoria");
  ensureRequired(payload.originCityId, "La ciudad origen es obligatoria");
  ensureRequired(payload.destinationCityId, "La ciudad destino es obligatoria");
  ensureRequired(payload.validFrom, "La vigencia inicial es obligatoria");
  ensureRequired(payload.validTo, "La vigencia final es obligatoria");
  const period = await FreightRatePeriod.create({
    carrierId: payload.carrierId,
    originCityId: payload.originCityId,
    destinationCityId: payload.destinationCityId,
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    sourceType: payload.sourceType || "estimated",
    sourceReference: cleanText(payload.sourceReference),
    notes: cleanText(payload.notes)
  });

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  for (const row of rows) {
    await FreightRateRow.create({
      freightRatePeriodId: period.id,
      minBillableKg: toNumber(row.minBillableKg),
      maxBillableKg: toNumber(row.maxBillableKg),
      basePriceCop: toNumber(row.basePriceCop),
      additionalKgPriceCop: toNumber(row.additionalKgPriceCop),
      insurancePct: toNumber(row.insurancePct),
      minInsuranceCop: toNumber(row.minInsuranceCop)
    });
  }

  return FreightRatePeriod.findByPk(period.id, {
    include: [Carrier, FreightRateRow]
  });
}

module.exports = {
  createClient,
  createClientPrice,
  createFreightRate,
  createOperationalCost,
  createPricingPolicy,
  createProduct,
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
  updatePricingPolicy
};
