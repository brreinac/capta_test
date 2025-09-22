# Working Days API


## Desarrollo
```bash
npm run dev
# abre http://localhost:3000
```


## Compilar y ejecutar
```bash
npm run build
npm start
```


## Endpoint
`GET /working-date`


Query params:
- `days` (opcional, entero >= 0)
- `hours` (opcional, entero >= 0)
- `date` (opcional, ISO 8601 UTC con Z)


Al menos uno de `days` o `hours` debe presentarse. Si no se presenta `date`, la API parte de la hora actual en Colombia.


Ejemplo:
```
GET /working-date?days=1&hours=4&date=2025-04-10T15:00:00.000Z
```


Respuesta exitosa (200):
```json
{ "date": "2025-04-21T20:00:00Z" }
```


Error (400):
```json
{ "error": "InvalidParameters", "message": "Detalle..." }
```


## Festivos
La API intenta descargar el JSON desde:
`https://content.capta.co/Recruitment/WorkingDays.json`.
Si la descarga falla, la API usa un fallback embebido (configurable).


## Notas
- Zona: `America/Bogota` para cálculos.
- Horario laboral: 08:00-12:00 y 13:00-17:00.
- Almuerzo: 12:00-13:00 (no se cuenta tiempo laboral durante este rango).
- Regla de ajuste: si la fecha inicial está fuera del horario laboral o en día no laboral, se aproxima hacia atrás al instante laboral más cercano antes de aplicar la suma.
- Suma: primero `days`, luego `hours`.