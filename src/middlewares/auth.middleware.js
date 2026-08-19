const jwt = require("jsonwebtoken");

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }
  return authHeader.slice("Bearer ".length).trim();
}

function authMiddleware(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const publicPaths = parseCsvEnv(process.env.AUTH_PUBLIC_PATHS);
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const internalServiceKey = String(process.env.INTERNAL_SERVICE_KEY || "").trim();
  const incomingInternalKey = String(req.headers["x-internal-service-key"] || "").trim();
  if (
    internalServiceKey &&
    incomingInternalKey &&
    incomingInternalKey === internalServiceKey
  ) {
    req.usuario = { internal_service: true };
    return next();
  }

  const jwtSecret = String(process.env.JWT_SECRET || "").trim();
  if (!jwtSecret) {
    return res.status(503).json({
      message: "JWT_SECRET no configurado en la API segura.",
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  try {
    req.usuario = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Token invalido o expirado" });
  }
}

module.exports = authMiddleware;
