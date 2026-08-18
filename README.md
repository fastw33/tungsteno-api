# Tungsteno API

API Node.js + Express + Sequelize para generar la tabla diaria de precios de compra de tungsteno.

## Reglas base

- El precio cliente puede estar en `COP`, `USD` o `EUR`.
- Cada precio cliente tiene `valid_from` y `valid_to`.
- Si no hay precio cliente vigente para la fecha, la API registra un issue y no usa precios vencidos.
- La salida principal es una tabla diaria por producto, cliente, zona y rango de kg.
- Zonas iniciales: `urbano` y `nacional`.
- En nacional, el flete depende de origen, destino, transportadora y peso liquidable.
- Peso liquidable: mayor entre peso real y peso volumétrico.

## Instalación

```bash
cd tungsteno-api
npm install
copy .env.example .env
npm run db:sync
npm run dev
```

Por defecto escucha en:

```text
http://localhost:4070
```

## Variables

```env
PORT=4070
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=tungsteno
DB_USER=root
DB_PASSWORD=
DB_LOGGING=false
```

## Endpoints

```text
GET  /api/tungsteno/health
GET  /api/tungsteno/catalogs

GET  /api/tungsteno/products
POST /api/tungsteno/products

GET  /api/tungsteno/clients
POST /api/tungsteno/clients

GET  /api/tungsteno/client-prices
POST /api/tungsteno/client-prices

GET  /api/tungsteno/exchange-rates
POST /api/tungsteno/exchange-rates

GET  /api/tungsteno/operational-costs
POST /api/tungsteno/operational-costs

GET  /api/tungsteno/pricing-policies
POST /api/tungsteno/pricing-policies

GET  /api/tungsteno/freight-rates
POST /api/tungsteno/freight-rates

POST /api/tungsteno/price-tables/generate
GET  /api/tungsteno/price-tables/latest
GET  /api/tungsteno/price-tables/:id
GET  /api/tungsteno/price-tables/history
```

## Generar tabla diaria

Para nacional se debe enviar ciudad origen. Bogotá queda como destino por defecto.

```json
{
  "tableDate": "2026-08-03",
  "clientId": 1,
  "originCityId": 2,
  "notes": "Tabla diaria Medellin a Bogota"
}
```

La API calcula:

```text
costo_real_max_kg = precio_cliente_cop_kg / (1 + margen_bruto_objetivo)
neta_compra = costo_real_max_kg - gasto_operativo_kg - flete_kg
precio_proveedor = neta_compra redondeada hacia abajo
```
