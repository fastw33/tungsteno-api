const {
  Carrier,
  City,
  Currency,
  PackageProfile,
  WeightRange,
  Zone
} = require("../models");

async function listCatalogs() {
  const [
    currencies,
    zones,
    weightRanges,
    carriers,
    cities,
    packageProfiles
  ] = await Promise.all([
    Currency.findAll({ order: [["code", "ASC"]] }),
    Zone.findAll({ order: [["id", "ASC"]] }),
    WeightRange.findAll({ order: [["sortOrder", "ASC"]] }),
    Carrier.findAll({ order: [["name", "ASC"]] }),
    City.findAll({ order: [["name", "ASC"]] }),
    PackageProfile.findAll({
      include: [{ model: WeightRange }],
      order: [[WeightRange, "sortOrder", "ASC"]]
    })
  ]);

  return {
    currencies,
    zones,
    weightRanges,
    carriers,
    cities,
    packageProfiles
  };
}

module.exports = {
  listCatalogs
};
