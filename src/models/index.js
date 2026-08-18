const { DataTypes, Op } = require("sequelize");
const sequelize = require("../config/database");

const defaultModelOptions = {
  underscored: true,
  freezeTableName: true
};

const Currency = sequelize.define(
  "Currency",
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.CHAR(3), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(60), allowNull: false }
  },
  { ...defaultModelOptions, tableName: "currencies", timestamps: false }
);

const Client = sequelize.define(
  "Client",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    taxId: { type: DataTypes.STRING(40), allowNull: true },
    contactName: { type: DataTypes.STRING(120), allowNull: true },
    email: { type: DataTypes.STRING(160), allowNull: true },
    phone: { type: DataTypes.STRING(60), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  { ...defaultModelOptions, tableName: "clients" }
);

const Product = sequelize.define(
  "Product",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    family: { type: DataTypes.STRING(100), allowNull: false, defaultValue: "Tungsteno" },
    description: { type: DataTypes.STRING(500), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  { ...defaultModelOptions, tableName: "products" }
);

const Zone = sequelize.define(
  "Zone",
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(80), allowNull: false }
  },
  { ...defaultModelOptions, tableName: "zones", timestamps: false }
);

const WeightRange = sequelize.define(
  "WeightRange",
  {
    id: { type: DataTypes.SMALLINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    label: { type: DataTypes.STRING(80), allowNull: false },
    minKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    maxKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    sortOrder: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false }
  },
  { ...defaultModelOptions, tableName: "weight_ranges", timestamps: false }
);

const ClientPricePeriod = sequelize.define(
  "ClientPricePeriod",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    currencyId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    pricePerKg: { type: DataTypes.DECIMAL(18, 6), allowNull: false },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false },
    validTo: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM("active", "cancelled"),
      allowNull: false,
      defaultValue: "active"
    },
    sourceReference: { type: DataTypes.STRING(160), allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true }
  },
  {
    ...defaultModelOptions,
    tableName: "client_price_periods",
    indexes: [
      {
        fields: ["product_id", "client_id", "status", "valid_from", "valid_to"],
        name: "idx_client_price_lookup"
      }
    ],
    validate: {
      validRange() {
        if (this.validFrom && this.validTo && this.validTo < this.validFrom) {
          throw new Error("validTo debe ser mayor o igual a validFrom");
        }
      }
    },
    hooks: {
      beforeValidate: async (period) => {
        if (period.status !== "active") {
          return;
        }
        const overlap = await ClientPricePeriod.findOne({
          where: {
            id: period.id ? { [Op.ne]: period.id } : { [Op.ne]: 0 },
            productId: period.productId,
            clientId: period.clientId,
            status: "active",
            validFrom: { [Op.lte]: period.validTo },
            validTo: { [Op.gte]: period.validFrom }
          }
        });
        if (overlap) {
          throw new Error(
            "Ya existe un precio cliente activo traslapado para este producto y cliente"
          );
        }
      }
    }
  }
);

const ExchangeRate = sequelize.define(
  "ExchangeRate",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    currencyId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    rateToCop: { type: DataTypes.DECIMAL(18, 6), allowNull: false },
    rateDate: { type: DataTypes.DATEONLY, allowNull: false },
    source: { type: DataTypes.STRING(120), allowNull: false }
  },
  {
    ...defaultModelOptions,
    tableName: "exchange_rates",
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["currency_id", "rate_date"],
        name: "uq_exchange_rate_day"
      }
    ]
  }
);

const Carrier = sequelize.define(
  "Carrier",
  {
    id: { type: DataTypes.SMALLINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  { ...defaultModelOptions, tableName: "carriers", timestamps: false }
);

const City = sequelize.define(
  "City",
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    department: { type: DataTypes.STRING(120), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    ...defaultModelOptions,
    tableName: "cities",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["name", "department"],
        name: "uq_city_department"
      }
    ]
  }
);

const PackageProfile = sequelize.define(
  "PackageProfile",
  {
    id: { type: DataTypes.SMALLINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    weightRangeId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    lengthCm: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    widthCm: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    heightCm: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    volumetricDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 6000 }
  },
  { ...defaultModelOptions, tableName: "package_profiles", timestamps: false }
);

const FreightRatePeriod = sequelize.define(
  "FreightRatePeriod",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    carrierId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    originCityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    destinationCityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false },
    validTo: { type: DataTypes.DATEONLY, allowNull: false },
    sourceType: {
      type: DataTypes.ENUM("public_table", "manual_quote", "api", "estimated"),
      allowNull: false,
      defaultValue: "estimated"
    },
    sourceReference: { type: DataTypes.STRING(250), allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true }
  },
  {
    ...defaultModelOptions,
    tableName: "freight_rate_periods",
    indexes: [
      {
        fields: [
          "carrier_id",
          "origin_city_id",
          "destination_city_id",
          "valid_from",
          "valid_to"
        ],
        name: "idx_freight_period_lookup"
      }
    ]
  }
);

const FreightRateRow = sequelize.define(
  "FreightRateRow",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    freightRatePeriodId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    minBillableKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    maxBillableKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    basePriceCop: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    additionalKgPriceCop: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    insurancePct: { type: DataTypes.DECIMAL(10, 6), allowNull: false, defaultValue: 0 },
    minInsuranceCop: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 }
  },
  {
    ...defaultModelOptions,
    tableName: "freight_rate_rows",
    timestamps: false,
    indexes: [
      {
        fields: ["freight_rate_period_id", "min_billable_kg", "max_billable_kg"],
        name: "idx_freight_row_weight"
      }
    ]
  }
);

const OperationalCostPeriod = sequelize.define(
  "OperationalCostPeriod",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    zoneId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    costCopPerKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false },
    validTo: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true }
  },
  {
    ...defaultModelOptions,
    tableName: "operational_cost_periods",
    indexes: [
      {
        fields: ["zone_id", "valid_from", "valid_to"],
        name: "idx_operational_cost_lookup"
      }
    ]
  }
);

const PricingPolicyPeriod = sequelize.define(
  "PricingPolicyPeriod",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    zoneId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    weightRangeId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    minGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
    targetGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: false },
    maxGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
    roundingCop: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 1000 },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false },
    validTo: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true }
  },
  {
    ...defaultModelOptions,
    tableName: "pricing_policy_periods",
    indexes: [
      {
        fields: ["product_id", "zone_id", "weight_range_id", "valid_from", "valid_to"],
        name: "idx_policy_lookup"
      }
    ]
  }
);

const SupplierPurchasePricePeriod = sequelize.define(
  "SupplierPurchasePricePeriod",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    zoneId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    weightRangeId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    netPurchasePriceCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false },
    validTo: { type: DataTypes.DATEONLY, allowNull: false },
    sourceReference: { type: DataTypes.STRING(160), allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true }
  },
  {
    ...defaultModelOptions,
    tableName: "supplier_purchase_price_periods",
    indexes: [
      {
        fields: ["product_id", "zone_id", "weight_range_id", "valid_from", "valid_to"],
        name: "idx_supplier_purchase_lookup"
      }
    ]
  }
);

const DailyPriceTable = sequelize.define(
  "DailyPriceTable",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    tableDate: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    calculationVersion: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "v1" },
    status: {
      type: DataTypes.ENUM("generated", "partial", "failed"),
      allowNull: false,
      defaultValue: "generated"
    },
    generatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.STRING(500), allowNull: true }
  },
  {
    ...defaultModelOptions,
    tableName: "daily_price_tables",
    createdAt: false,
    updatedAt: false
  }
);

const DailyPriceTableRow = sequelize.define(
  "DailyPriceTableRow",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    dailyPriceTableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    zoneId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    weightRangeId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    clientPricePeriodId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    exchangeRateId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    operationalCostPeriodId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    pricingPolicyPeriodId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    packageProfileId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    freightRateRowId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    carrierId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    originCityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    destinationCityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    realWeightKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    volumetricWeightKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    billableWeightKg: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    clientPriceCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    operationalCostCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    freightTotalCop: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    freightCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    minGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
    targetGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: false },
    maxGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
    netPurchasePriceCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    aggressivePurchasePriceCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    supplierPriceCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    maxPurchasePriceCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    totalPurchaseAndExpenseCop: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    expectedGrossMarginPct: { type: DataTypes.DECIMAL(10, 6), allowNull: false }
  },
  {
    ...defaultModelOptions,
    tableName: "daily_price_table_rows",
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["daily_price_table_id", "product_id", "client_id", "zone_id", "weight_range_id"],
        name: "uq_daily_price_row"
      },
      {
        fields: ["product_id", "client_id", "zone_id", "weight_range_id", "created_at"],
        name: "idx_daily_row_history"
      }
    ]
  }
);

const PriceChangeReason = sequelize.define(
  "PriceChangeReason",
  {
    id: { type: DataTypes.SMALLINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false }
  },
  { ...defaultModelOptions, tableName: "price_change_reasons", timestamps: false }
);

const DailyPriceChange = sequelize.define(
  "DailyPriceChange",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    currentRowId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    previousRowId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reasonId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    changeCopKg: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    changePct: { type: DataTypes.DECIMAL(10, 6), allowNull: false }
  },
  { ...defaultModelOptions, tableName: "daily_price_changes", updatedAt: false }
);

const PriceGenerationIssue = sequelize.define(
  "PriceGenerationIssue",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    dailyPriceTableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    zoneId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    weightRangeId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    issueCode: { type: DataTypes.STRING(80), allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false }
  },
  {
    ...defaultModelOptions,
    tableName: "price_generation_issues",
    updatedAt: false,
    indexes: [{ fields: ["daily_price_table_id"], name: "idx_generation_issues_table" }]
  }
);

const AdminChangeLog = sequelize.define(
  "AdminChangeLog",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    entityType: { type: DataTypes.STRING(80), allowNull: false },
    entityId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    action: { type: DataTypes.STRING(40), allowNull: false },
    beforeData: { type: DataTypes.JSON, allowNull: true },
    afterData: { type: DataTypes.JSON, allowNull: true },
    changedBy: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "admin" },
    note: { type: DataTypes.STRING(500), allowNull: true },
    changedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  {
    ...defaultModelOptions,
    tableName: "admin_change_logs",
    createdAt: false,
    updatedAt: false,
    indexes: [
      {
        fields: ["entity_type", "entity_id", "changed_at"],
        name: "idx_admin_change_entity"
      }
    ]
  }
);

Product.hasMany(ClientPricePeriod, { foreignKey: "productId" });
Client.hasMany(ClientPricePeriod, { foreignKey: "clientId" });
Currency.hasMany(ClientPricePeriod, { foreignKey: "currencyId" });
ClientPricePeriod.belongsTo(Product, { foreignKey: "productId" });
ClientPricePeriod.belongsTo(Client, { foreignKey: "clientId" });
ClientPricePeriod.belongsTo(Currency, { foreignKey: "currencyId" });

Currency.hasMany(ExchangeRate, { foreignKey: "currencyId" });
ExchangeRate.belongsTo(Currency, { foreignKey: "currencyId" });

WeightRange.hasOne(PackageProfile, { foreignKey: "weightRangeId" });
PackageProfile.belongsTo(WeightRange, { foreignKey: "weightRangeId" });

Carrier.hasMany(FreightRatePeriod, { foreignKey: "carrierId" });
FreightRatePeriod.belongsTo(Carrier, { foreignKey: "carrierId" });
FreightRatePeriod.belongsTo(City, { as: "originCity", foreignKey: "originCityId" });
FreightRatePeriod.belongsTo(City, { as: "destinationCity", foreignKey: "destinationCityId" });
FreightRatePeriod.hasMany(FreightRateRow, { foreignKey: "freightRatePeriodId" });
FreightRateRow.belongsTo(FreightRatePeriod, { foreignKey: "freightRatePeriodId" });

Zone.hasMany(OperationalCostPeriod, { foreignKey: "zoneId" });
OperationalCostPeriod.belongsTo(Zone, { foreignKey: "zoneId" });
Product.hasMany(PricingPolicyPeriod, { foreignKey: "productId" });
Zone.hasMany(PricingPolicyPeriod, { foreignKey: "zoneId" });
WeightRange.hasMany(PricingPolicyPeriod, { foreignKey: "weightRangeId" });
PricingPolicyPeriod.belongsTo(Product, { foreignKey: "productId" });
PricingPolicyPeriod.belongsTo(Zone, { foreignKey: "zoneId" });
PricingPolicyPeriod.belongsTo(WeightRange, { foreignKey: "weightRangeId" });
Product.hasMany(SupplierPurchasePricePeriod, { foreignKey: "productId" });
Zone.hasMany(SupplierPurchasePricePeriod, { foreignKey: "zoneId" });
WeightRange.hasMany(SupplierPurchasePricePeriod, { foreignKey: "weightRangeId" });
SupplierPurchasePricePeriod.belongsTo(Product, { foreignKey: "productId" });
SupplierPurchasePricePeriod.belongsTo(Zone, { foreignKey: "zoneId" });
SupplierPurchasePricePeriod.belongsTo(WeightRange, { foreignKey: "weightRangeId" });

DailyPriceTable.hasMany(DailyPriceTableRow, { as: "rows", foreignKey: "dailyPriceTableId" });
DailyPriceTable.hasMany(PriceGenerationIssue, { as: "issues", foreignKey: "dailyPriceTableId" });
DailyPriceTableRow.belongsTo(DailyPriceTable, { foreignKey: "dailyPriceTableId" });
DailyPriceTableRow.belongsTo(Product, { foreignKey: "productId" });
DailyPriceTableRow.belongsTo(Client, { foreignKey: "clientId" });
DailyPriceTableRow.belongsTo(Zone, { foreignKey: "zoneId" });
DailyPriceTableRow.belongsTo(WeightRange, { foreignKey: "weightRangeId" });
DailyPriceTableRow.belongsTo(ClientPricePeriod, { foreignKey: "clientPricePeriodId" });
DailyPriceTableRow.belongsTo(ExchangeRate, { foreignKey: "exchangeRateId" });
DailyPriceTableRow.belongsTo(OperationalCostPeriod, { foreignKey: "operationalCostPeriodId" });
DailyPriceTableRow.belongsTo(PricingPolicyPeriod, { foreignKey: "pricingPolicyPeriodId" });
DailyPriceTableRow.belongsTo(PackageProfile, { foreignKey: "packageProfileId" });
DailyPriceTableRow.belongsTo(FreightRateRow, { foreignKey: "freightRateRowId" });
DailyPriceTableRow.belongsTo(Carrier, { foreignKey: "carrierId" });
DailyPriceTableRow.belongsTo(City, { as: "originCity", foreignKey: "originCityId" });
DailyPriceTableRow.belongsTo(City, { as: "destinationCity", foreignKey: "destinationCityId" });

DailyPriceChange.belongsTo(DailyPriceTableRow, { as: "currentRow", foreignKey: "currentRowId" });
DailyPriceChange.belongsTo(DailyPriceTableRow, { as: "previousRow", foreignKey: "previousRowId" });
DailyPriceChange.belongsTo(PriceChangeReason, { as: "reason", foreignKey: "reasonId" });
DailyPriceTableRow.hasOne(DailyPriceChange, { as: "change", foreignKey: "currentRowId" });

PriceGenerationIssue.belongsTo(Product, { foreignKey: "productId" });
PriceGenerationIssue.belongsTo(Client, { foreignKey: "clientId" });
PriceGenerationIssue.belongsTo(Zone, { foreignKey: "zoneId" });
PriceGenerationIssue.belongsTo(WeightRange, { foreignKey: "weightRangeId" });

module.exports = {
  sequelize,
  Op,
  Carrier,
  AdminChangeLog,
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
  OperationalCostPeriod,
  PackageProfile,
  PriceChangeReason,
  PriceGenerationIssue,
  PricingPolicyPeriod,
  Product,
  SupplierPurchasePricePeriod,
  WeightRange,
  Zone
};
