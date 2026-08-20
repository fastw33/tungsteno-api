const {
  City,
  Currency,
  FreightRatePeriod,
  FreightRateRow,
  OperationalCostPeriod,
  Op,
  WeightRange,
  Zone
} = require("../models");

const currencies = [
  { code: "COP", name: "Peso colombiano" },
  { code: "USD", name: "Dolar estadounidense" },
  { code: "EUR", name: "Euro" }
];

const zones = [
  { code: "urbano", name: "Urbano Bogota" },
  { code: "nacional", name: "Nacional Colombia" }
];

const weightRanges = [
  { code: "1_10", label: "1 a 10 kg", minKg: 1, maxKg: 10, sortOrder: 1 },
  { code: "10_20", label: "10 a 20 kg", minKg: 10, maxKg: 20, sortOrder: 2 },
  { code: "20_50", label: "20 a 50 kg", minKg: 20, maxKg: 50, sortOrder: 3 },
  { code: "50_100", label: "50 a 100 kg", minKg: 50, maxKg: 100, sortOrder: 4 },
  { code: "100_1000", label: "100 kg a 1 tonelada", minKg: 100, maxKg: 1000, sortOrder: 5 }
];

const cities = [
  { name: "Bogota", department: "Bogota D.C." }
];

async function upsertByUnique(model, where, payload) {
  const existing = await model.findOne({ where });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return model.create(payload);
}

async function createIfMissing(model, where, payload) {
  const existing = await model.findOne({ where });
  return existing || model.create(payload);
}

async function seedDefaults() {
  const placeholderFreights = await FreightRatePeriod.findAll({
    where: {
      sourceReference: {
        [Op.in]: ["base-inicial", "admin-w-simple"]
      }
    }
  });
  for (const period of placeholderFreights) {
    const rows = await FreightRateRow.findAll({ where: { freightRatePeriodId: period.id } });
    const allRowsAreZero = rows.every((row) =>
      Number(row.basePriceCop) === 0 &&
      Number(row.additionalKgPriceCop) === 0 &&
      Number(row.insurancePct) === 0 &&
      Number(row.minInsuranceCop) === 0
    );
    if (allRowsAreZero) {
      await FreightRateRow.destroy({ where: { freightRatePeriodId: period.id } });
      await period.destroy();
    }
  }

  for (const item of currencies) {
    await upsertByUnique(Currency, { code: item.code }, item);
  }

  for (const item of zones) {
    await upsertByUnique(Zone, { code: item.code }, item);
  }

  for (const item of weightRanges) {
    await upsertByUnique(WeightRange, { code: item.code }, item);
  }

  for (const item of cities) {
    await upsertByUnique(City, { name: item.name, department: item.department }, item);
  }

  const activeZones = await Zone.findAll();
  for (const zone of activeZones) {
    await createIfMissing(
      OperationalCostPeriod,
      { zoneId: zone.id, validFrom: "2000-01-01", validTo: "2099-12-31" },
      {
        zoneId: zone.id,
        costCopPerKg: 0,
        validFrom: "2000-01-01",
        validTo: "2099-12-31",
        notes: "Base inicial editable desde Admin W"
      }
    );
  }

}

module.exports = {
  seedDefaults
};
