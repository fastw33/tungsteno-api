const { Currency, ExchangeRate } = require("../models");

const SFC_TRM_ENDPOINT =
  "https://www.superfinanciera.gov.co/SuperfinancieraWebServiceTRM/TCRMServicesWebService/TCRMServicesWebService";
const OPEN_ER_ENDPOINT = "https://open.er-api.com/v6/latest/EUR";

function tagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00-05:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function datesBetween(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

async function fetchTrmFromSuperfinanciera(targetDate) {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:act="http://action.trm.services.generic.action.superfinanciera.nexura.sc.com.co/">
  <soapenv:Header/>
  <soapenv:Body>
    <act:queryTCRM>
      <tcrmQueryAssociatedDate>${targetDate}</tcrmQueryAssociatedDate>
    </act:queryTCRM>
  </soapenv:Body>
</soapenv:Envelope>`;

  const response = await fetch(SFC_TRM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: soapBody
  });
  const xml = await response.text();
  if (!response.ok) {
    throw Object.assign(new Error("No fue posible consultar la TRM en Superfinanciera"), {
      status: 502
    });
  }

  const success = tagValue(xml, "success") === "true";
  const value = Number(tagValue(xml, "value"));
  if (!success || !Number.isFinite(value) || value <= 0) {
    throw Object.assign(
      new Error(tagValue(xml, "message") || "Superfinanciera no retorno una TRM valida"),
      { status: 502 }
    );
  }

  return {
    value,
    unit: tagValue(xml, "unit") || "COP",
    validityFrom: dateOnly(tagValue(xml, "validityFrom")) || targetDate,
    validityTo: dateOnly(tagValue(xml, "validityTo")) || targetDate,
    source: "Superfinanciera WebService TRM"
  };
}

async function syncUsdTrm(targetDate) {
  const usd = await Currency.findOne({ where: { code: "USD" } });
  if (!usd) {
    throw Object.assign(new Error("No existe moneda USD"), { status: 500 });
  }

  const trm = await fetchTrmFromSuperfinanciera(targetDate);
  const validDates = datesBetween(trm.validityFrom, trm.validityTo);
  const datesToStore = validDates.length > 0 ? validDates : [targetDate];
  for (const rateDate of datesToStore) {
    await ExchangeRate.upsert({
      currencyId: usd.id,
      rateDate,
      rateToCop: trm.value,
      source: trm.source
    });
  }

  return ExchangeRate.findOne({
    where: { currencyId: usd.id, rateDate: targetDate },
    include: [Currency]
  });
}

async function fetchEurCopRate(targetDate) {
  const response = await fetch(OPEN_ER_ENDPOINT);
  const payload = await response.json().catch(() => null);
  const value = Number(payload?.rates?.COP);
  if (!response.ok || payload?.result !== "success" || !Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error("No fue posible consultar EUR/COP"), { status: 502 });
  }
  return {
    value,
    rateDate: targetDate,
    source: `open.er-api.com EUR/COP ${payload.time_last_update_utc || "latest"}`
  };
}

async function syncEurCop(targetDate) {
  const eur = await Currency.findOne({ where: { code: "EUR" } });
  if (!eur) {
    throw Object.assign(new Error("No existe moneda EUR"), { status: 500 });
  }

  const rate = await fetchEurCopRate(targetDate);
  await ExchangeRate.upsert({
    currencyId: eur.id,
    rateDate: targetDate,
    rateToCop: rate.value,
    source: rate.source
  });

  return ExchangeRate.findOne({
    where: { currencyId: eur.id, rateDate: targetDate },
    include: [Currency]
  });
}

module.exports = {
  fetchTrmFromSuperfinanciera,
  syncEurCop,
  syncUsdTrm
};
