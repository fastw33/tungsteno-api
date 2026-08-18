const {
  Carrier,
  City,
  Currency,
  FreightRatePeriod,
  FreightRateRow,
  OperationalCostPeriod,
  PackageProfile,
  PriceChangeReason,
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

const carriers = [
  { code: "interrapidisimo", name: "Inter Rapidisimo" },
  { code: "envia", name: "Envia" },
  { code: "coordinadora", name: "Coordinadora" }
];

const cities = [
  { name: "Bogota", department: "Bogota D.C." },
  { name: "Medellin", department: "Antioquia" },
  { name: "Cali", department: "Valle del Cauca" },
  { name: "Barranquilla", department: "Atlantico" },
  { name: "Cartagena", department: "Bolivar" }
];

const changeReasons = [
  { code: "trm", name: "Cambio por TRM" },
  { code: "eur_rate", name: "Cambio por tasa EUR" },
  { code: "client_price", name: "Cambio por precio cliente" },
  { code: "freight", name: "Cambio por flete" },
  { code: "operational_cost", name: "Cambio por gasto operativo" },
  { code: "margin_policy", name: "Cambio por margen objetivo" },
  { code: "new_row", name: "Fila nueva sin comparativo anterior" },
  { code: "no_change", name: "Sin cambio relevante" }
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
  for (const item of currencies) {
    await upsertByUnique(Currency, { code: item.code }, item);
  }

  for (const item of zones) {
    await upsertByUnique(Zone, { code: item.code }, item);
  }

  for (const item of weightRanges) {
    await upsertByUnique(WeightRange, { code: item.code }, item);
  }

  for (const item of carriers) {
    await upsertByUnique(Carrier, { code: item.code }, item);
  }

  for (const item of cities) {
    await upsertByUnique(City, { name: item.name, department: item.department }, item);
  }

  for (const item of changeReasons) {
    await upsertByUnique(PriceChangeReason, { code: item.code }, item);
  }

  const ranges = await WeightRange.findAll();
  for (const range of ranges) {
    await upsertByUnique(
      PackageProfile,
      { weightRangeId: range.id },
      {
        weightRangeId: range.id,
        name: `Caja ${range.label}`,
        lengthCm: 30,
        widthCm: 30,
        heightCm: 30,
        volumetricDivisor: 6000
      }
    );
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

  const inter = await Carrier.findOne({ where: { code: "interrapidisimo" } });
  const medellin = await City.findOne({ where: { name: "Medellin" } });
  const bogota = await City.findOne({ where: { name: "Bogota" } });
  if (inter && medellin && bogota) {
    const freightPeriod = await createIfMissing(
      FreightRatePeriod,
      {
        carrierId: inter.id,
        originCityId: medellin.id,
        destinationCityId: bogota.id,
        validFrom: "2000-01-01",
        validTo: "2099-12-31"
      },
      {
        carrierId: inter.id,
        originCityId: medellin.id,
        destinationCityId: bogota.id,
        validFrom: "2000-01-01",
        validTo: "2099-12-31",
        sourceType: "estimated",
        sourceReference: "base-inicial",
        notes: "Base inicial editable desde Admin W"
      }
    );
    for (const range of ranges) {
      await createIfMissing(
        FreightRateRow,
        {
          freightRatePeriodId: freightPeriod.id,
          minBillableKg: range.minKg,
          maxBillableKg: range.maxKg
        },
        {
          freightRatePeriodId: freightPeriod.id,
          minBillableKg: range.minKg,
          maxBillableKg: range.maxKg,
          basePriceCop: 0,
          additionalKgPriceCop: 0,
          insurancePct: 0,
          minInsuranceCop: 0
        }
      );
    }
  }
}

module.exports = {
  seedDefaults
};
