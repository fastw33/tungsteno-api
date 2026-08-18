const path = require("node:path");
const XLSX = require("xlsx");
const {
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
  SupplierPurchasePricePeriod,
  WeightRange,
  Zone,
  sequelize
} = require("../models");
const { seedDefaults } = require("../db/seedDefaults");
const { generateDailyPriceTable } = require("../services/priceTableService");

const defaultExcelPath = "C:/Users/tech/Downloads/tabla de precios Tungstenos.xlsx";

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findSheet(workbook, targetName) {
  const sheetName = workbook.SheetNames.find((name) => cleanText(name) === targetName);
  if (!sheetName) {
    throw new Error(`No se encontro la hoja ${targetName}`);
  }
  return workbook.Sheets[sheetName];
}

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  });
}

function rangeCodeFromText(text) {
  const normalized = cleanText(text).toLowerCase();
  if (/2\s*a\s*10|1\s*a\s*10/.test(normalized)) {
    return "1_10";
  }
  if (/10\s*a\s*20/.test(normalized)) {
    return "10_20";
  }
  if (/20\s*a\s*50/.test(normalized)) {
    return "20_50";
  }
  if (/50\s*a\s*100/.test(normalized)) {
    return "50_100";
  }
  if (/100|tonelada|1000/.test(normalized)) {
    return "100_1000";
  }
  return "";
}

function rangeCodeFromWeight(weightKg) {
  const weight = toNumber(weightKg);
  if (weight < 10) {
    return "1_10";
  }
  if (weight < 20) {
    return "10_20";
  }
  if (weight < 50) {
    return "20_50";
  }
  if (weight < 100) {
    return "50_100";
  }
  return "100_1000";
}

function extractNationalRows(rows) {
  const items = [];
  const blocks = [];
  let block = [];

  for (let index = 11; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (row.every((cell) => cell === null || cleanText(cell) === "")) {
      if (block.length > 0) {
        blocks.push(block);
        block = [];
      }
      continue;
    }
    block.push(row);
  }
  if (block.length > 0) {
    blocks.push(block);
  }

  for (const rowsBlock of blocks) {
    const blockRangeCode = rowsBlock
      .map((row) => rangeCodeFromText(row[0]))
      .find(Boolean);
    for (const row of rowsBlock) {
    const productName = cleanText(row[1]);
    const usdPrice = toNumber(row[4]);
    if (!productName || usdPrice <= 0) {
      continue;
    }

    const quantityKg = toNumber(row[2]);
      const rangeCode = blockRangeCode || rangeCodeFromWeight(quantityKg);
    items.push({
      productName,
      quantityKg,
      rangeCode,
      clientPriceUsdKg: usdPrice,
      clientPriceCopKg: toNumber(row[5]),
      netPurchasePriceCopKg: toNumber(row[8]),
      operationalCostCopKg: toNumber(row[9]),
      freightCopKg: toNumber(row[10]),
      realCostCopKg: toNumber(row[11]),
      grossMarginPct: toNumber(row[14])
    });
    }
  }

  return items;
}

function extractUrbanRows(rows) {
  const items = [];
  for (let index = 11; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const productName = cleanText(row[0]);
    const usdPrice = toNumber(row[3]);
    if (!productName || usdPrice <= 0) {
      continue;
    }
    const quantityKg = toNumber(row[1]);
    items.push({
      productName,
      quantityKg,
      rangeCode: "",
      clientPriceUsdKg: usdPrice,
      clientPriceCopKg: toNumber(row[4]),
      netPurchasePriceCopKg: toNumber(row[7]),
      operationalCostCopKg: toNumber(row[8]),
      freightCopKg: 0,
      realCostCopKg: toNumber(row[9]),
      grossMarginPct: toNumber(row[12])
    });
  }
  return items;
}

function extractUrbanOperationalCost(rows) {
  const values = [];
  for (let index = 11; index < rows.length; index += 1) {
    const cost = toNumber((rows[index] || [])[8]);
    if (cost > 0) {
      values.push(cost);
    }
  }
  return values.length > 0 ? Math.min(...values) : 5000;
}

async function findOrCreateByName(model, name, defaults = {}) {
  const [record] = await model.findOrCreate({
    where: { name },
    defaults: { name, ...defaults }
  });
  return record;
}

async function upsertClientPrice(payload) {
  const existing = await ClientPricePeriod.findOne({
    where: {
      productId: payload.productId,
      clientId: payload.clientId,
      currencyId: payload.currencyId,
      validFrom: payload.validFrom,
      validTo: payload.validTo,
      status: "active"
    }
  });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return ClientPricePeriod.create(payload);
}

async function upsertOperationalCost(payload) {
  const existing = await OperationalCostPeriod.findOne({
    where: {
      zoneId: payload.zoneId,
      validFrom: payload.validFrom,
      validTo: payload.validTo
    }
  });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return OperationalCostPeriod.create(payload);
}

async function upsertPricingPolicy(payload) {
  const existing = await PricingPolicyPeriod.findOne({
    where: {
      productId: payload.productId || null,
      zoneId: payload.zoneId || null,
      weightRangeId: payload.weightRangeId || null,
      validFrom: payload.validFrom,
      validTo: payload.validTo
    }
  });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return PricingPolicyPeriod.create(payload);
}

async function upsertSupplierPurchasePrice(payload) {
  const existing = await SupplierPurchasePricePeriod.findOne({
    where: {
      productId: payload.productId,
      zoneId: payload.zoneId,
      weightRangeId: payload.weightRangeId || null,
      validFrom: payload.validFrom,
      validTo: payload.validTo
    }
  });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return SupplierPurchasePricePeriod.create(payload);
}

async function upsertFreightPeriodWithRows(payload, freightRows) {
  const existing = await FreightRatePeriod.findOne({
    where: {
      carrierId: payload.carrierId,
      originCityId: payload.originCityId,
      destinationCityId: payload.destinationCityId,
      validFrom: payload.validFrom,
      validTo: payload.validTo
    }
  });
  const period = existing ? await existing.update(payload) : await FreightRatePeriod.create(payload);
  await FreightRateRow.destroy({ where: { freightRatePeriodId: period.id } });
  for (const row of freightRows) {
    await FreightRateRow.create({
      freightRatePeriodId: period.id,
      ...row
    });
  }
  return period;
}

async function main() {
  const excelPath = process.argv[2] || defaultExcelPath;
  const workbook = XLSX.readFile(excelPath, { cellDates: true });
  const nationalRows = sheetRows(findSheet(workbook, "NACIONAL"));
  const urbanRows = sheetRows(findSheet(workbook, "URBANOS"));
  const extractedRows = extractNationalRows(nationalRows);
  const extractedUrbanRows = extractUrbanRows(urbanRows);
  const updateDate = toDateOnly(nationalRows[2]?.[9]);
  const validTo = addDays(updateDate, 14);
  const clientName = cleanText(nationalRows[3]?.[9]) || "FASTWAY";
  const contactName = cleanText(nationalRows[5]?.[9]);
  const originName = cleanText(nationalRows[5]?.[2]) || "Cartagena";
  const trmPivot = toNumber(nationalRows[7]?.[4], 3100);
  const urbanOperationalCost = extractUrbanOperationalCost(urbanRows);
  const nationalOperationalCost = Math.max(
    ...extractedRows.map((row) => row.operationalCostCopKg).filter((value) => value > 0),
    8000
  );

  await sequelize.authenticate();
  await seedDefaults();

  const usd = await Currency.findOne({ where: { code: "USD" } });
  const client = await findOrCreateByName(Client, clientName, { contactName });
  const urbano = await Zone.findOne({ where: { code: "urbano" } });
  const nacional = await Zone.findOne({ where: { code: "nacional" } });
  const bogota = await City.findOne({ where: { name: "Bogota" } });
  const origin = await findOrCreateByName(City, originName, { department: null });
  const medellin = await City.findOne({ where: { name: "Medellin" } });
  const inter = await Carrier.findOne({ where: { code: "interrapidisimo" } });
  const ranges = await WeightRange.findAll();
  const rangesByCode = new Map(ranges.map((range) => [range.code, range]));

  await ExchangeRate.upsert({
    currencyId: usd.id,
    rateDate: updateDate,
    rateToCop: trmPivot,
    source: "Excel tabla de precios Tungstenos"
  });

  await upsertOperationalCost({
    zoneId: urbano.id,
    costCopPerKg: urbanOperationalCost,
    validFrom: updateDate,
    validTo: "2026-12-31",
    notes: "Importado desde hoja URBANOS"
  });
  await upsertOperationalCost({
    zoneId: nacional.id,
    costCopPerKg: nationalOperationalCost,
    validFrom: updateDate,
    validTo: "2026-12-31",
    notes: "Importado desde hoja NACIONAL"
  });

  await upsertPricingPolicy({
    productId: null,
    zoneId: null,
    weightRangeId: null,
    minGrossMarginPct: 1.41,
    targetGrossMarginPct: 1.41,
    maxGrossMarginPct: 1.41,
    roundingCop: 1000,
    validFrom: updateDate,
    validTo: "2026-12-31",
    notes: "Politica global inicial: margen bruto objetivo 141%"
  });

  const productByName = new Map();
  const firstPriceByProduct = new Map();
  const marginsByProductId = new Map();
  const freightByRange = new Map();

  for (const row of extractedRows) {
    const product = await findOrCreateByName(Product, row.productName, {
      family: "Tungsteno",
      description: "Importado desde tabla de precios Tungstenos"
    });
    productByName.set(row.productName, product);

    if (!firstPriceByProduct.has(product.id)) {
      firstPriceByProduct.set(product.id, row.clientPriceUsdKg);
    }
    if (row.grossMarginPct > 0 && row.netPurchasePriceCopKg > 0) {
      const margins = marginsByProductId.get(product.id) || [];
      margins.push(row.grossMarginPct);
      marginsByProductId.set(product.id, margins);
    }
    const currentFreight = freightByRange.get(row.rangeCode) || 0;
    freightByRange.set(row.rangeCode, Math.max(currentFreight, row.freightCopKg));
  }

  for (const row of extractedUrbanRows) {
    const product = await findOrCreateByName(Product, row.productName, {
      family: "Tungsteno",
      description: "Importado desde tabla de precios Tungstenos"
    });
    productByName.set(row.productName, product);

    if (!firstPriceByProduct.has(product.id)) {
      firstPriceByProduct.set(product.id, row.clientPriceUsdKg);
    }
    await upsertSupplierPurchasePrice({
      productId: product.id,
      zoneId: urbano.id,
      weightRangeId: null,
      netPurchasePriceCopKg: row.netPurchasePriceCopKg,
      validFrom: updateDate,
      validTo: "2099-12-31",
      sourceReference: path.basename(excelPath),
      notes: "Neta de compra importada desde hoja URBANOS"
    });
  }

  for (const [productId, pricePerKg] of firstPriceByProduct.entries()) {
    await upsertClientPrice({
      productId,
      clientId: client.id,
      currencyId: usd.id,
      pricePerKg,
      validFrom: updateDate,
      validTo,
      status: "active",
      sourceReference: path.basename(excelPath),
      notes: "Importado desde Excel. No usar despues de vencimiento."
    });
  }

  for (const [productId, margins] of marginsByProductId.entries()) {
    if (margins.length === 0) {
      continue;
    }
    await upsertPricingPolicy({
      productId,
      zoneId: null,
      weightRangeId: null,
      minGrossMarginPct: Math.min(...margins),
      targetGrossMarginPct: Math.max(...margins),
      maxGrossMarginPct: Math.max(...margins),
      roundingCop: 1000,
      validFrom: updateDate,
      validTo: "2026-12-31",
      notes: "Banda de rentabilidad importada desde columna % BRUTO de hoja NACIONAL"
    });
  }

  for (const row of extractedRows) {
    const product = productByName.get(row.productName);
    const range = rangesByCode.get(row.rangeCode);
    if (!product || !range || row.netPurchasePriceCopKg <= 0) {
      continue;
    }
    await upsertSupplierPurchasePrice({
      productId: product.id,
      zoneId: nacional.id,
      weightRangeId: range.id,
      netPurchasePriceCopKg: row.netPurchasePriceCopKg,
      validFrom: updateDate,
      validTo: "2099-12-31",
      sourceReference: path.basename(excelPath),
      notes: "Neta de compra importada desde hoja NACIONAL"
    });
  }

  const freightRows = ranges.map((range) => {
    const freight = freightByRange.get(range.code) || 22000;
    return {
      minBillableKg: range.minKg,
      maxBillableKg: range.maxKg,
      basePriceCop: freight,
      additionalKgPriceCop: 0,
      insurancePct: 0,
      minInsuranceCop: 0
    };
  });

  for (const city of [origin, medellin].filter(Boolean)) {
    await upsertFreightPeriodWithRows(
      {
        carrierId: inter.id,
        originCityId: city.id,
        destinationCityId: bogota.id,
        validFrom: updateDate,
        validTo: "2026-12-31",
        sourceType: "estimated",
        sourceReference: path.basename(excelPath),
        notes: "Tarifa base importada desde gastos de transportadora del Excel"
      },
      freightRows
    );
  }

  const table = await generateDailyPriceTable({
    tableDate: updateDate,
    clientId: client.id,
    originCityId: origin.id,
    destinationCityId: bogota.id,
    notes: `Generada desde ${path.basename(excelPath)}`
  });

  const counts = {
    products: await Product.count(),
    clients: await Client.count(),
    clientPrices: await ClientPricePeriod.count(),
    operationalCosts: await OperationalCostPeriod.count(),
    policies: await PricingPolicyPeriod.count(),
    freightPeriods: await FreightRatePeriod.count(),
    freightRows: await FreightRateRow.count(),
    supplierPurchasePrices: await SupplierPurchasePricePeriod.count(),
    tableDate: table.tableDate,
    tableRows: table.rows?.length || 0,
    issues: table.issues?.length || 0
  };

  console.log(JSON.stringify(counts, null, 2));
  await sequelize.close();
}

main().catch(async (error) => {
  console.error(error.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
