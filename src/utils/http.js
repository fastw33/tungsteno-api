function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error("Fecha invalida"), { status: 400 });
  }
  return date.toISOString().slice(0, 10);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  asyncHandler,
  cleanText,
  normalizeDate
};
