# Working Days API (TypeScript)

API que suma días/hours hábiles en Colombia (America/Bogota) y devuelve la fecha resultado en UTC.

## Requisitos
- Node >= 18
- npm

## Instalación
1. `git clone <repo>`
2. `cd working-days-api`
3. `npm install`

## Desarrollo
`npm run dev` — arranca en `http://localhost:3000`.

## Compilar
`npm run build` y `npm start`.

## Endpoint
GET `/working-date?days=1&hours=4&date=2025-04-10T15:00:00.000Z`

- `days` y `hours` enteros no negativos (opcional al menos uno debe existir).
- `date` debe ser UTC ISO con `Z`. Si no se pasa, se usa la hora actual en Colombia.

Respuesta exitosa:
```json
{ "date": "2025-04-21T20:00:00Z" }
