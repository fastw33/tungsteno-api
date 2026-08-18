const {
  Op,
  PricingPolicyPeriod,
  Product,
  sequelize
} = require("../models");
const { syncUsdTrm } = require("../services/trmService");

const targetMarginPct = 1.41;

async function upsertProductPolicy(product, transaction) {
  const existing = await PricingPolicyPeriod.findOne({
    where: {
      productId: product.id,
      zoneId: null,
      weightRangeId: null
    },
    transaction
  });
  const payload = {
    productId: product.id,
    zoneId: null,
    weightRangeId: null,
    minGrossMarginPct: targetMarginPct,
    targetGrossMarginPct: targetMarginPct,
    maxGrossMarginPct: targetMarginPct,
    roundingCop: 1000,
    validFrom: "2000-01-01",
    validTo: "2099-12-31",
    notes: "Margen unico por producto"
  };
  return existing ? existing.update(payload, { transaction }) : PricingPolicyPeriod.create(payload, { transaction });
}

async function main() {
  await sequelize.authenticate();
  const trm = await syncUsdTrm("2026-08-03");

  await sequelize.transaction(async (transaction) => {
    await PricingPolicyPeriod.update({
      validFrom: "2026-08-02",
      validTo: "2026-08-02",
      notes: "Politica expirada al consolidar admin por producto"
    }, {
      where: {
        [Op.or]: [
          { weightRangeId: { [Op.ne]: null } },
          { productId: null }
        ]
      },
      transaction
    });

    const products = await Product.findAll({ order: [["name", "ASC"]], transaction });
    for (const product of products) {
      await upsertProductPolicy(product, transaction);
    }
  });

  const counts = {
    trmDate: trm.rateDate,
    trmValue: Number(trm.rateToCop),
    activeRangePolicies: await PricingPolicyPeriod.count({
      where: {
        productId: null,
        zoneId: null,
        weightRangeId: { [Op.ne]: null },
        validTo: { [Op.gte]: "2026-08-03" }
      }
    }),
    activeProductPolicies: await PricingPolicyPeriod.count({
      where: {
        productId: { [Op.ne]: null },
        zoneId: null,
        weightRangeId: null,
        validTo: { [Op.gte]: "2026-08-03" }
      }
    })
  };
  console.log(JSON.stringify(counts, null, 2));
  await sequelize.close();
}

main().catch(async (error) => {
  console.error(error);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
