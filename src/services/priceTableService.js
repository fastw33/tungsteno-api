const Decimal = require("decimal.js");
const {
  Carrier,
  City,
  Client,
  ClientPricePeriod,
  Currency,
  DailyPriceChange,
  DailyPriceTable,
  DailyPriceTableRow,
  ExchangeRate,
  FreightRatePeriod,
  FreightRateRow,
  Op,
  OperationalCostPeriod,
  PackageProfile,
  PriceChangeReason,
  PriceGenerationIssue,
  PricingPolicyPeriod,
  Product,
  SupplierPurchasePricePeriod,
  WeightRange,
  Zone,
  sequelize
} = require("../models");
const { decimal, money, ratio, roundDownTo, toNumber } = require("../utils/numbers");
const { syncEurCop, syncUsdTrm } = require("./trmService");

function dateWhere(targetDate) {
  return {
    validFrom: { [Op.lte]: targetDate },
    validTo: { [Op.gte]: targetDate }
  };
}

async function createIssue(table, data, transaction) {
  return PriceGenerationIssue.create({
    dailyPriceTableId: table.id,
    productId: data.productId || null,
    clientId: data.clientId || null,
    zoneId: data.zoneId || null,
    weightRangeId: data.weightRangeId || null,
    issueCode: data.issueCode,
    message: data.message
  }, { transaction });
}

async function findExchangeRate(currency, targetDate) {
  if (currency.code === "COP") {
    return null;
  }
  const storedRate = await ExchangeRate.findOne({
    where: {
      currencyId: currency.id,
      rateDate: targetDate
    }
  });
  if (storedRate) {
    return storedRate;
  }
  if (currency.code === "USD") {
    return syncUsdTrm(targetDate);
  }
  if (currency.code === "EUR") {
    return syncEurCop(targetDate);
  }
  return null;
}

async function findOperationalCost(zoneId, targetDate) {
  return OperationalCostPeriod.findOne({
    where: {
      zoneId,
      ...dateWhere(targetDate)
    },
    order: [["validFrom", "DESC"]]
  });
}

async function findSupplierPurchasePrice({ productId, zoneId, weightRangeId, rangeMinKg, targetDate }) {
  const exact = await SupplierPurchasePricePeriod.findOne({
    where: {
      productId,
      zoneId,
      weightRangeId,
      ...dateWhere(targetDate)
    },
    order: [["validFrom", "DESC"]]
  });
  if (exact) {
    return exact;
  }
  const general = await SupplierPurchasePricePeriod.findOne({
    where: {
      productId,
      zoneId,
      weightRangeId: null,
      ...dateWhere(targetDate)
    },
    order: [["validFrom", "DESC"]]
  });
  if (general) {
    return general;
  }
  const candidates = await SupplierPurchasePricePeriod.findAll({
    where: {
      productId,
      zoneId,
      ...dateWhere(targetDate)
    },
    include: [WeightRange]
  });
  return candidates.sort((a, b) => {
    const aDistance = Math.abs(toNumber(a.WeightRange?.minKg) - toNumber(rangeMinKg));
    const bDistance = Math.abs(toNumber(b.WeightRange?.minKg) - toNumber(rangeMinKg));
    return aDistance - bDistance;
  })[0] || null;
}

function policyScore(policy) {
  return [
    policy.productId ? 4 : 0,
    policy.zoneId ? 2 : 0,
    policy.weightRangeId ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
}

async function findPricingPolicy({ productId, zoneId, weightRangeId, targetDate }) {
  const policies = await PricingPolicyPeriod.findAll({
    where: {
      [Op.and]: [
        dateWhere(targetDate),
        { [Op.or]: [{ productId }, { productId: null }] },
        { zoneId: null },
        { weightRangeId: null }
      ]
    }
  });
  return policies.sort((a, b) => {
    const diff = policyScore(b) - policyScore(a);
    if (diff !== 0) {
      return diff;
    }
    return String(b.validFrom).localeCompare(String(a.validFrom));
  })[0] || null;
}

function calculateVolumetricWeight(packageProfile) {
  return decimal(packageProfile.lengthCm)
    .mul(packageProfile.widthCm)
    .mul(packageProfile.heightCm)
    .div(packageProfile.volumetricDivisor)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
    .toNumber();
}

function calculateFreightTotal(row, billableWeightKg, declaredValueCop, realWeightKg = billableWeightKg) {
  const extraKg = Decimal.max(decimal(billableWeightKg).minus(row.minBillableKg), 0);
  const base = decimal(row.basePriceCop).mul(realWeightKg);
  const additional = extraKg.mul(row.additionalKgPriceCop);
  const insurance = Decimal.max(
    decimal(declaredValueCop).mul(row.insurancePct),
    decimal(row.minInsuranceCop)
  );
  return money(base.plus(additional).plus(insurance));
}

async function findNationalFreight({ originCityId, destinationCityId, targetDate, billableWeightKg, realWeightKg, declaredValueCop }) {
  const periods = await FreightRatePeriod.findAll({
    where: {
      originCityId,
      destinationCityId,
      ...dateWhere(targetDate)
    },
    include: [
      Carrier,
      {
        model: FreightRateRow,
        where: {
          minBillableKg: { [Op.lte]: billableWeightKg },
          maxBillableKg: { [Op.gte]: billableWeightKg }
        }
      }
    ]
  });

  const candidates = [];
  for (const period of periods) {
    for (const row of period.FreightRateRows || []) {
      candidates.push({
        period,
        row,
        total: calculateFreightTotal(row, billableWeightKg, declaredValueCop, realWeightKg)
      });
    }
  }

  return candidates.sort((a, b) => b.total - a.total)[0] || null;
}

function calculateVolumeFactor({ realWeightKg, minVolumeKg, maxVolumeKg }) {
  const minKg = decimal(minVolumeKg, 1);
  const maxKg = decimal(maxVolumeKg, minKg);
  if (maxKg.lte(minKg)) {
    return decimal(0);
  }
  const currentKg = Decimal.min(Decimal.max(decimal(realWeightKg), minKg), maxKg);
  const numerator = Decimal.log(currentKg.div(minKg));
  const denominator = Decimal.log(maxKg.div(minKg));
  return denominator.gt(0) ? numerator.div(denominator) : decimal(0);
}

function calculateMarginForVolume({ minGrossMarginPct, maxGrossMarginPct, realWeightKg, minVolumeKg, maxVolumeKg }) {
  const firstMargin = decimal(minGrossMarginPct);
  const secondMargin = decimal(maxGrossMarginPct, firstMargin);
  const minMargin = Decimal.min(firstMargin, secondMargin);
  const maxMargin = Decimal.max(firstMargin, secondMargin);
  const factor = calculateVolumeFactor({ realWeightKg, minVolumeKg, maxVolumeKg });
  return maxMargin.minus(maxMargin.minus(minMargin).mul(factor));
}

function calculatePrices({
  clientPriceCopKg,
  operationalCostCopKg,
  freightTotalCop,
  realWeightKg,
  minGrossMarginPct,
  appliedGrossMarginPct,
  maxGrossMarginPct,
  minimumSupplierPriceCopKg = 0,
  roundingCop
}) {
  const freightCopKg = decimal(realWeightKg).gt(0)
    ? decimal(freightTotalCop).div(realWeightKg)
    : decimal(0);
  const targetMargin = decimal(appliedGrossMarginPct);
  const firstMargin = decimal(minGrossMarginPct, targetMargin);
  const secondMargin = decimal(maxGrossMarginPct, targetMargin);
  const minMargin = Decimal.min(firstMargin, secondMargin);
  const maxMargin = Decimal.max(firstMargin, secondMargin);

  function priceForMargin(marginPct) {
    const maxRealCostKg = decimal(clientPriceCopKg).div(decimal(1).plus(marginPct));
    const netPurchasePrice = Decimal.max(
      maxRealCostKg.minus(operationalCostCopKg).minus(freightCopKg),
      0
    );
    const supplierPrice = roundDownTo(netPurchasePrice, roundingCop);
    const realCostKg = decimal(supplierPrice).plus(operationalCostCopKg).plus(freightCopKg);
    const grossMarginPct = realCostKg.gt(0)
      ? decimal(clientPriceCopKg).minus(realCostKg).div(realCostKg)
      : decimal(0);

    return {
      netPurchasePrice,
      supplierPrice,
      realCostKg,
      grossMarginPct
    };
  }

  const aggressive = priceForMargin(maxMargin);
  const optimal = priceForMargin(targetMargin);
  const limit = priceForMargin(minMargin);
  const supplierPrice = Decimal.max(optimal.supplierPrice, decimal(minimumSupplierPriceCopKg));
  const netPurchasePrice = Decimal.max(optimal.netPurchasePrice, supplierPrice);
  const realCostKg = supplierPrice.plus(operationalCostCopKg).plus(freightCopKg);
  const grossMarginPct = realCostKg.gt(0)
    ? decimal(clientPriceCopKg).minus(realCostKg).div(realCostKg)
    : decimal(0);

  return {
    freightCopKg: money(freightCopKg),
    netPurchasePriceCopKg: money(netPurchasePrice),
    aggressivePurchasePriceCopKg: money(aggressive.supplierPrice),
    supplierPriceCopKg: money(supplierPrice),
    maxPurchasePriceCopKg: money(Decimal.max(limit.supplierPrice, supplierPrice)),
    totalPurchaseAndExpenseCop: money(realCostKg.mul(realWeightKg)),
    expectedGrossMarginPct: ratio(grossMarginPct)
  };
}

function inferChangeReason(current, previous) {
  if (!previous) {
    return "new_row";
  }
  if (toNumber(current.clientPriceCopKg) !== toNumber(previous.clientPriceCopKg)) {
    return "client_price";
  }
  if (toNumber(current.freightCopKg) !== toNumber(previous.freightCopKg)) {
    return "freight";
  }
  if (toNumber(current.operationalCostCopKg) !== toNumber(previous.operationalCostCopKg)) {
    return "operational_cost";
  }
  if (
    toNumber(current.minGrossMarginPct) !== toNumber(previous.minGrossMarginPct) ||
    toNumber(current.targetGrossMarginPct) !== toNumber(previous.targetGrossMarginPct) ||
    toNumber(current.maxGrossMarginPct) !== toNumber(previous.maxGrossMarginPct)
  ) {
    return "margin_policy";
  }
  return toNumber(current.supplierPriceCopKg) === toNumber(previous.supplierPriceCopKg)
    ? "no_change"
    : "trm";
}

async function createChangeRecord(row, transaction) {
  const previous = await DailyPriceTableRow.findOne({
    where: {
      productId: row.productId,
      clientId: row.clientId,
      zoneId: row.zoneId,
      weightRangeId: row.weightRangeId,
      id: { [Op.ne]: row.id }
    },
    include: [{ model: DailyPriceTable, where: { tableDate: { [Op.lt]: row.DailyPriceTable?.tableDate || "9999-12-31" } } }],
    order: [[DailyPriceTable, "tableDate", "DESC"]],
    transaction
  });
  const changeCopKg = previous
    ? money(decimal(row.supplierPriceCopKg).minus(previous.supplierPriceCopKg))
    : 0;
  const changePct = previous && decimal(previous.supplierPriceCopKg).gt(0)
    ? ratio(decimal(changeCopKg).div(previous.supplierPriceCopKg))
    : 0;
  const reason = await PriceChangeReason.findOne({
    where: { code: inferChangeReason(row, previous) },
    transaction
  });
  if (!reason) {
    return null;
  }
  return DailyPriceChange.create({
    currentRowId: row.id,
    previousRowId: previous?.id || null,
    reasonId: reason.id,
    changeCopKg,
    changePct
  }, { transaction });
}

async function resolveDestinationCity(destinationCityId) {
  if (destinationCityId) {
    return City.findByPk(destinationCityId);
  }
  return City.findOne({ where: { name: "Bogota" } });
}

async function generateDailyPriceTable({
  tableDate,
  clientId = null,
  originCityId = null,
  destinationCityId = null,
  notes = ""
}) {
  const targetDate = tableDate;
  const destination = await resolveDestinationCity(destinationCityId);
  if (!destination) {
    throw Object.assign(new Error("No existe ciudad destino Bogota"), { status: 400 });
  }

  return sequelize.transaction(async (transaction) => {
    const existing = await DailyPriceTable.findOne({
      where: { tableDate: targetDate },
      transaction
    });
    if (existing) {
      const existingRows = await DailyPriceTableRow.findAll({
        where: { dailyPriceTableId: existing.id },
        attributes: ["id"],
        transaction
      });
      const rowIds = existingRows.map((row) => row.id);
      if (rowIds.length > 0) {
        await DailyPriceChange.destroy({
          where: {
            [Op.or]: [
              { currentRowId: { [Op.in]: rowIds } },
              { previousRowId: { [Op.in]: rowIds } }
            ]
          },
          transaction
        });
      }
      await PriceGenerationIssue.destroy({
        where: { dailyPriceTableId: existing.id },
        transaction
      });
      await DailyPriceTableRow.destroy({
        where: { dailyPriceTableId: existing.id },
        transaction
      });
      await existing.destroy({ transaction });
    }
    const table = await DailyPriceTable.create(
      {
        tableDate: targetDate,
        calculationVersion: "v1",
        status: "generated",
        notes
      },
      { transaction }
    );

    const zones = await Zone.findAll({ transaction });
    const ranges = await WeightRange.findAll({ order: [["sortOrder", "ASC"]], transaction });
    const rangeMinKgValues = ranges.map((range) => toNumber(range.minKg)).filter((value) => value > 0);
    const minVolumeKg = Math.min(...rangeMinKgValues);
    const maxVolumeKg = Math.max(...rangeMinKgValues);
    const pricePeriods = await ClientPricePeriod.findAll({
      where: {
        status: "active",
        ...(clientId ? { clientId } : {}),
        validFrom: { [Op.lte]: targetDate },
        validTo: { [Op.gte]: targetDate }
      },
      include: [Product, Client, Currency],
      transaction
    });

    const activeProducts = clientId
      ? await Product.findAll({ where: { isActive: true }, transaction })
      : [];
    if (clientId) {
      const pricedProductIds = new Set(pricePeriods.map((period) => String(period.productId)));
      for (const product of activeProducts) {
        if (!pricedProductIds.has(String(product.id))) {
          await createIssue(table, {
            productId: product.id,
            clientId,
            issueCode: "CLIENT_PRICE_EXPIRED_OR_MISSING",
            message: "No hay precio cliente vigente. No se usa precio anterior."
          }, transaction);
        }
      }
    }

    for (const period of pricePeriods) {
      if (!period.Product?.isActive || !period.Client?.isActive) {
        continue;
      }

      const exchangeRate = await findExchangeRate(period.Currency, targetDate);
      if (period.Currency.code !== "COP" && !exchangeRate) {
        await createIssue(table, {
          productId: period.productId,
          clientId: period.clientId,
          issueCode: "EXCHANGE_RATE_MISSING",
          message: `No hay tasa ${period.Currency.code}/COP para ${targetDate}.`
        }, transaction);
        continue;
      }

      const rateToCop = period.Currency.code === "COP" ? 1 : exchangeRate.rateToCop;
      const clientPriceCopKg = money(decimal(period.pricePerKg).mul(rateToCop));

      for (const zone of zones) {
        const operationalCost = await findOperationalCost(zone.id, targetDate);
        if (!operationalCost) {
          await createIssue(table, {
            productId: period.productId,
            clientId: period.clientId,
            zoneId: zone.id,
            issueCode: "OPERATIONAL_COST_MISSING",
            message: `No hay gasto operativo vigente para zona ${zone.code}.`
          }, transaction);
          continue;
        }

        let previousSupplierPriceCopKg = 0;
        for (const range of ranges) {
          const policy = await findPricingPolicy({
            productId: period.productId,
            zoneId: zone.id,
            weightRangeId: range.id,
            rangeMinKg: range.minKg,
            targetDate
          });
          if (!policy) {
            await createIssue(table, {
              productId: period.productId,
              clientId: period.clientId,
              zoneId: zone.id,
              weightRangeId: range.id,
              issueCode: "PRICING_POLICY_MISSING",
              message: "No hay politica de margen vigente."
            }, transaction);
            continue;
          }

          const packageProfile = await PackageProfile.findOne({
            where: { weightRangeId: range.id }
          });
          if (!packageProfile) {
            await createIssue(table, {
              productId: period.productId,
              clientId: period.clientId,
              zoneId: zone.id,
              weightRangeId: range.id,
              issueCode: "PACKAGE_PROFILE_MISSING",
              message: "No hay perfil de caja para este rango."
            }, transaction);
            continue;
          }
          const realWeightKg = toNumber(range.minKg);
          const volumetricWeightKg = packageProfile
            ? calculateVolumetricWeight(packageProfile)
            : 0;
          const billableWeightKg = Math.max(realWeightKg, volumetricWeightKg);
          let freightTotalCop = 0;
          let freightRow = null;
          let carrier = null;

          if (zone.code === "nacional") {
            if (!originCityId) {
              await createIssue(table, {
                productId: period.productId,
                clientId: period.clientId,
                zoneId: zone.id,
                weightRangeId: range.id,
                issueCode: "ORIGIN_CITY_REQUIRED",
                message: "Para nacional se requiere ciudad origen."
              }, transaction);
              continue;
            }
            const freight = await findNationalFreight({
              originCityId,
              destinationCityId: destination.id,
              targetDate,
              billableWeightKg,
              realWeightKg,
              declaredValueCop: decimal(clientPriceCopKg).mul(realWeightKg)
            });
            if (!freight) {
              await createIssue(table, {
                productId: period.productId,
                clientId: period.clientId,
                zoneId: zone.id,
                weightRangeId: range.id,
                issueCode: "FREIGHT_RATE_MISSING",
                message: "No hay flete nacional vigente para origen, destino y peso."
              }, transaction);
              continue;
            }
            freightTotalCop = freight.total;
            freightRow = freight.row;
            carrier = freight.period.Carrier;
          }

          const calculated = calculatePrices({
            clientPriceCopKg,
            operationalCostCopKg: operationalCost.costCopPerKg,
            freightTotalCop,
            realWeightKg,
            minGrossMarginPct: policy.minGrossMarginPct,
            appliedGrossMarginPct: calculateMarginForVolume({
              minGrossMarginPct: policy.minGrossMarginPct || policy.targetGrossMarginPct,
              maxGrossMarginPct: policy.maxGrossMarginPct || policy.targetGrossMarginPct,
              realWeightKg,
              minVolumeKg,
              maxVolumeKg
            }),
            maxGrossMarginPct: policy.maxGrossMarginPct,
            minimumSupplierPriceCopKg: previousSupplierPriceCopKg,
            roundingCop: policy.roundingCop
          });
          previousSupplierPriceCopKg = calculated.supplierPriceCopKg;

          const row = await DailyPriceTableRow.create(
            {
              dailyPriceTableId: table.id,
              productId: period.productId,
              clientId: period.clientId,
              zoneId: zone.id,
              weightRangeId: range.id,
              clientPricePeriodId: period.id,
              exchangeRateId: exchangeRate?.id || null,
              operationalCostPeriodId: operationalCost.id,
              pricingPolicyPeriodId: policy.id,
              packageProfileId: packageProfile.id,
              freightRateRowId: freightRow?.id || null,
              carrierId: carrier?.id || null,
              originCityId: zone.code === "nacional" ? originCityId : null,
              destinationCityId: zone.code === "nacional" ? destination.id : null,
              realWeightKg,
              volumetricWeightKg,
              billableWeightKg,
              clientPriceCopKg,
              operationalCostCopKg: operationalCost.costCopPerKg,
              freightTotalCop,
              freightCopKg: calculated.freightCopKg,
              minGrossMarginPct: policy.minGrossMarginPct || policy.targetGrossMarginPct,
              targetGrossMarginPct: calculateMarginForVolume({
                minGrossMarginPct: policy.minGrossMarginPct || policy.targetGrossMarginPct,
                maxGrossMarginPct: policy.maxGrossMarginPct || policy.targetGrossMarginPct,
                realWeightKg,
                minVolumeKg,
                maxVolumeKg
              }).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber(),
              maxGrossMarginPct: policy.maxGrossMarginPct || policy.targetGrossMarginPct,
              netPurchasePriceCopKg: calculated.netPurchasePriceCopKg,
              aggressivePurchasePriceCopKg: calculated.aggressivePurchasePriceCopKg,
              supplierPriceCopKg: calculated.supplierPriceCopKg,
              maxPurchasePriceCopKg: calculated.maxPurchasePriceCopKg,
              totalPurchaseAndExpenseCop: calculated.totalPurchaseAndExpenseCop,
              expectedGrossMarginPct: calculated.expectedGrossMarginPct
            },
            { transaction }
          );
          row.DailyPriceTable = table;
          await createChangeRecord(row, transaction);
        }
      }
    }

    const issueCount = await PriceGenerationIssue.count({
      where: { dailyPriceTableId: table.id },
      transaction
    });
    const rowCount = await DailyPriceTableRow.count({
      where: { dailyPriceTableId: table.id },
      transaction
    });
    await table.update(
      {
        status: issueCount > 0 ? (rowCount > 0 ? "partial" : "failed") : "generated"
      },
      { transaction }
    );

    return getPriceTable(table.id, { historyDays: 30, transaction });
  });
}

async function getPriceTable(id, options = {}) {
  return DailyPriceTable.findByPk(id, {
    include: [
      {
        model: DailyPriceTableRow,
        as: "rows",
        include: [
          Product,
          Client,
          ClientPricePeriod,
          Zone,
          WeightRange,
          ExchangeRate,
          Carrier,
          { model: City, as: "originCity" },
          { model: City, as: "destinationCity" },
          { model: DailyPriceChange, as: "change", include: [{ model: PriceChangeReason, as: "reason" }] }
        ]
      },
      {
        model: PriceGenerationIssue,
        as: "issues",
        include: [Product, Client, Zone, WeightRange]
      }
    ],
    transaction: options.transaction
  });
}

async function getLatestPriceTable() {
  const table = await DailyPriceTable.findOne({
    order: [["tableDate", "DESC"]]
  });
  return table ? getPriceTable(table.id) : null;
}

function publicIssue(data) {
  return {
    productId: data.productId || null,
    clientId: data.clientId || null,
    cityId: data.cityId || null,
    zoneId: data.zoneId || null,
    weightRangeId: data.weightRangeId || null,
    issueCode: data.issueCode,
    message: data.message
  };
}

async function calculatePreviewRange({
  period,
  zone,
  city,
  destination,
  range,
  targetDate,
  minVolumeKg,
  maxVolumeKg,
  previousSupplierPriceCopKg
}) {
  const exchangeRate = await findExchangeRate(period.Currency, targetDate);
  if (period.Currency.code !== "COP" && !exchangeRate) {
    return {
      issue: publicIssue({
        productId: period.productId,
        clientId: period.clientId,
        cityId: city?.id || null,
        zoneId: zone.id,
        weightRangeId: range.id,
        issueCode: "EXCHANGE_RATE_MISSING",
        message: `No hay tasa ${period.Currency.code}/COP para ${targetDate}.`
      })
    };
  }

  const operationalCost = await findOperationalCost(zone.id, targetDate);
  if (!operationalCost) {
    return {
      issue: publicIssue({
        productId: period.productId,
        clientId: period.clientId,
        cityId: city?.id || null,
        zoneId: zone.id,
        weightRangeId: range.id,
        issueCode: "OPERATIONAL_COST_MISSING",
        message: `No hay gasto operativo vigente para zona ${zone.code}.`
      })
    };
  }

  const policy = await findPricingPolicy({
    productId: period.productId,
    zoneId: zone.id,
    weightRangeId: range.id,
    rangeMinKg: range.minKg,
    targetDate
  });
  if (!policy) {
    return {
      issue: publicIssue({
        productId: period.productId,
        clientId: period.clientId,
        cityId: city?.id || null,
        zoneId: zone.id,
        weightRangeId: range.id,
        issueCode: "PRICING_POLICY_MISSING",
        message: "No hay politica de margen vigente."
      })
    };
  }

  const rateToCop = period.Currency.code === "COP" ? 1 : exchangeRate.rateToCop;
  const clientPriceCopKg = money(decimal(period.pricePerKg).mul(rateToCop));
  const realWeightKg = toNumber(range.minKg);
  const volumetricWeightKg = 0;
  const billableWeightKg = realWeightKg;
  let freightTotalCop = 0;
  let freightRow = null;
  let carrier = null;

  if (zone.code === "nacional") {
    const freight = await findNationalFreight({
      originCityId: city.id,
      destinationCityId: destination.id,
      targetDate,
      billableWeightKg,
      realWeightKg,
      declaredValueCop: decimal(clientPriceCopKg).mul(realWeightKg)
    });
    if (!freight) {
      return {
        issue: publicIssue({
          productId: period.productId,
          clientId: period.clientId,
          cityId: city.id,
          zoneId: zone.id,
          weightRangeId: range.id,
          issueCode: "FREIGHT_RATE_MISSING",
          message: "No hay flete nacional vigente para origen, destino y peso."
        })
      };
    }
    freightTotalCop = freight.total;
    freightRow = freight.row;
    carrier = freight.period.Carrier;
  }

  const appliedGrossMarginPct = calculateMarginForVolume({
    minGrossMarginPct: policy.minGrossMarginPct || policy.targetGrossMarginPct,
    maxGrossMarginPct: policy.maxGrossMarginPct || policy.targetGrossMarginPct,
    realWeightKg,
    minVolumeKg,
    maxVolumeKg
  });
  const calculated = calculatePrices({
    clientPriceCopKg,
    operationalCostCopKg: operationalCost.costCopPerKg,
    freightTotalCop,
    realWeightKg,
    minGrossMarginPct: policy.minGrossMarginPct,
    appliedGrossMarginPct,
    maxGrossMarginPct: policy.maxGrossMarginPct,
    minimumSupplierPriceCopKg: previousSupplierPriceCopKg,
    roundingCop: policy.roundingCop
  });

  return {
    range: {
      productId: period.productId,
      clientId: period.clientId,
      zoneId: zone.id,
      weightRangeId: range.id,
      exchangeRateId: exchangeRate?.id || null,
      operationalCostPeriodId: operationalCost.id,
      pricingPolicyPeriodId: policy.id,
      freightRateRowId: freightRow?.id || null,
      carrierId: carrier?.id || null,
      originCityId: zone.code === "nacional" ? city.id : null,
      destinationCityId: zone.code === "nacional" ? destination.id : null,
      Product: period.Product,
      Client: period.Client,
      Currency: period.Currency,
      ClientPricePeriod: period,
      Zone: zone,
      WeightRange: range,
      ExchangeRate: exchangeRate,
      Carrier: carrier,
      originCity: zone.code === "nacional" ? city : null,
      destinationCity: zone.code === "nacional" ? destination : null,
      realWeightKg,
      volumetricWeightKg,
      billableWeightKg,
      clientPriceCopKg,
      operationalCostCopKg: operationalCost.costCopPerKg,
      freightTotalCop,
      freightCopKg: calculated.freightCopKg,
      minGrossMarginPct: policy.minGrossMarginPct || policy.targetGrossMarginPct,
      targetGrossMarginPct: appliedGrossMarginPct.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber(),
      maxGrossMarginPct: policy.maxGrossMarginPct || policy.targetGrossMarginPct,
      netPurchasePriceCopKg: calculated.netPurchasePriceCopKg,
      aggressivePurchasePriceCopKg: calculated.aggressivePurchasePriceCopKg,
      supplierPriceCopKg: calculated.supplierPriceCopKg,
      maxPurchasePriceCopKg: calculated.maxPurchasePriceCopKg,
      totalPurchaseAndExpenseCop: calculated.totalPurchaseAndExpenseCop,
      expectedGrossMarginPct: calculated.expectedGrossMarginPct
    }
  };
}

function summarizeCityProducts(products) {
  const prices = products.flatMap((product) =>
    product.ranges.map((range) => toNumber(range.supplierPriceCopKg))
  ).filter((value) => value > 0);
  return {
    productCount: products.length,
    rangeCount: products.reduce((sum, product) => sum + product.ranges.length, 0),
    minSupplierPriceCopKg: prices.length ? Math.min(...prices) : null,
    maxSupplierPriceCopKg: prices.length ? Math.max(...prices) : null
  };
}

async function previewPurchasePrices({ tableDate, clientId = null }) {
  const targetDate = tableDate || new Date().toISOString().slice(0, 10);
  const destination = await resolveDestinationCity(null);
  if (!destination) {
    throw Object.assign(new Error("No existe ciudad destino Bogota"), { status: 400 });
  }

  const [urbanZone, nationalZone, ranges, pricePeriods, freightCities] = await Promise.all([
    Zone.findOne({ where: { code: "urbano" } }),
    Zone.findOne({ where: { code: "nacional" } }),
    WeightRange.findAll({ order: [["sortOrder", "ASC"]] }),
    ClientPricePeriod.findAll({
      where: {
        status: "active",
        ...(clientId ? { clientId } : {}),
        validFrom: { [Op.lte]: targetDate },
        validTo: { [Op.gte]: targetDate }
      },
      include: [Product, Client, Currency],
      order: [[Product, "name", "ASC"], [Client, "name", "ASC"]]
    }),
    FreightRatePeriod.findAll({
      where: {
        destinationCityId: destination.id,
        ...dateWhere(targetDate)
      },
      include: [{ model: City, as: "originCity", where: { isActive: true } }],
      order: [[{ model: City, as: "originCity" }, "name", "ASC"]]
    })
  ]);

  if (!urbanZone || !nationalZone) {
    throw Object.assign(new Error("Faltan zonas urbano/nacional en catalogo"), { status: 400 });
  }

  const rangeMinKgValues = ranges.map((range) => toNumber(range.minKg)).filter((value) => value > 0);
  const minVolumeKg = Math.min(...rangeMinKgValues);
  const maxVolumeKg = Math.max(...rangeMinKgValues);
  const nationalCities = new Map();
  for (const period of freightCities) {
    if (period.originCity && period.originCity.id !== destination.id) {
      nationalCities.set(String(period.originCity.id), period.originCity);
    }
  }
  const cities = [
    { city: destination, zone: urbanZone, kind: "bogota" },
    ...[...nationalCities.values()].map((city) => ({ city, zone: nationalZone, kind: "nacional" }))
  ];

  const cards = [];
  const allIssues = [];
  const rateMap = new Map();

  for (const cityEntry of cities) {
    const products = [];
    const cityIssues = [];

    for (const period of pricePeriods) {
      if (!period.Product?.isActive || !period.Client?.isActive) {
        continue;
      }

      let previousSupplierPriceCopKg = 0;
      const productRanges = [];
      for (const range of ranges) {
        const result = await calculatePreviewRange({
          period,
          zone: cityEntry.zone,
          city: cityEntry.city,
          destination,
          range,
          targetDate,
          minVolumeKg,
          maxVolumeKg,
          previousSupplierPriceCopKg
        });
        if (result.issue) {
          cityIssues.push(result.issue);
          allIssues.push(result.issue);
          continue;
        }
        previousSupplierPriceCopKg = result.range.supplierPriceCopKg;
        if (result.range.ExchangeRate) {
          rateMap.set(
            `${result.range.ExchangeRate.currencyId}-${result.range.ExchangeRate.rateDate}`,
            result.range.ExchangeRate
          );
        }
        productRanges.push(result.range);
      }

      if (productRanges.length > 0) {
        const productPrices = productRanges.map((range) => toNumber(range.supplierPriceCopKg));
        products.push({
          product: period.Product,
          client: period.Client,
          currency: period.Currency,
          clientPricePeriod: period,
          minSupplierPriceCopKg: Math.min(...productPrices),
          maxSupplierPriceCopKg: Math.max(...productPrices),
          ranges: productRanges
        });
      }
    }

    cards.push({
      id: `${cityEntry.kind}-${cityEntry.city.id}`,
      kind: cityEntry.kind,
      city: cityEntry.city,
      zone: cityEntry.zone,
      products,
      issues: cityIssues,
      summary: summarizeCityProducts(products)
    });
  }

  return {
    tableDate: targetDate,
    destinationCity: destination,
    exchangeRates: [...rateMap.values()],
    cards,
    issues: allIssues
  };
}

async function listPriceHistory({ productId, clientId, zoneId, weightRangeId, from, to, limit = 31, offset = 0 }) {
  const tableWhere = {};
  if (from || to) {
    tableWhere.tableDate = {};
    if (from) {
      tableWhere.tableDate[Op.gte] = from;
    }
    if (to) {
      tableWhere.tableDate[Op.lte] = to;
    }
  }
  return DailyPriceTableRow.findAll({
    where: {
      ...(productId ? { productId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(zoneId ? { zoneId } : {}),
      ...(weightRangeId ? { weightRangeId } : {})
    },
    include: [
      { model: DailyPriceTable, where: tableWhere },
      Product,
      Client,
      Zone,
      WeightRange,
      ExchangeRate,
      { model: DailyPriceChange, as: "change", include: [{ model: PriceChangeReason, as: "reason" }] }
    ],
    order: [[DailyPriceTable, "tableDate", "DESC"]],
    limit: Math.min(Math.max(toNumber(limit, 31), 1), 365),
    offset: Math.max(toNumber(offset, 0), 0)
  });
}

module.exports = {
  generateDailyPriceTable,
  getLatestPriceTable,
  getPriceTable,
  previewPurchasePrices,
  listPriceHistory
};
