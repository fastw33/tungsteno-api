const {
  Carrier,
  City,
  Currency,
  WeightRange,
  Zone
} = require("../models");

async function listCatalogs() {
  const [
    currencies,
    zones,
    weightRanges,
    carriers,
    cities
  ] = await Promise.all([
    Currency.findAll({ order: [["code", "ASC"]] }),
    Zone.findAll({ order: [["id", "ASC"]] }),
    WeightRange.findAll({ order: [["sortOrder", "ASC"]] }),
    Carrier.findAll({ order: [["name", "ASC"]] }),
    City.findAll({ order: [["name", "ASC"]] })
  ]);

  return {
    currencies,
    zones,
    weightRanges,
    carriers,
    cities
  };
}

module.exports = {
  listCatalogs
};
