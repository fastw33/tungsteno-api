const Decimal = require("decimal.js");

function decimal(value, fallback = 0) {
  try {
    if (value === null || value === undefined || value === "") {
      return new Decimal(fallback);
    }
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : new Decimal(fallback);
  } catch (error) {
    return new Decimal(fallback);
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function ratio(value) {
  return decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
}

function roundDownTo(value, step) {
  const safeStep = decimal(step, 1000);
  if (safeStep.lte(0)) {
    return money(value);
  }
  return decimal(value).div(safeStep).floor().mul(safeStep).toNumber();
}

module.exports = {
  decimal,
  money,
  ratio,
  roundDownTo,
  toNumber
};
