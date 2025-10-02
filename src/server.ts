import express, { Request, Response } from "express";
import { DateTime } from "luxon";
import { addBusinessDays, addBusinessHours, normalizeToBusinessTime } from "./utils/calendar";

const app = express();
const PORT = process.env.PORT || 3000;

interface QueryParams {
  days?: string;
  hours?: string;
  date?: string;
}

app.get("/api/calculate", async (req: Request, res: Response) => {
  try {
    const { days, hours, date }: QueryParams = req.query;

    const numDays = days ? parseInt(days, 10) : 0;
    const numHours = hours ? parseInt(hours, 10) : 0;

    if ((!days && !hours) || (isNaN(numDays) && isNaN(numHours))) {
      return res.status(400).json({
        error: "InvalidParameters",
        message: "Debe proporcionar 'days' y/o 'hours' como enteros positivos."
      });
    }

    // Determinar fecha inicial
    let start: DateTime;
    if (date) {
      const parsed = DateTime.fromISO(date, { zone: "utc" });
      if (!parsed.isValid) {
        return res.status(400).json({
          error: "InvalidParameters",
          message: "Formato de fecha inválido. Use ISO8601 UTC con sufijo Z."
        });
      }
      start = parsed.setZone("America/Bogota");
    } else {
      start = DateTime.now().setZone("America/Bogota");
    }

    // Normalizar a tiempo laboral válido
    let result = normalizeToBusinessTime(start);

    // Sumar días primero
    if (!isNaN(numDays) && numDays > 0) {
      result = addBusinessDays(result, numDays);
    }

    // Luego sumar horas
    if (!isNaN(numHours) && numHours > 0) {
      result = addBusinessHours(result, numHours);
    }

    // Convertir a UTC ISO estrictamente con Z y sin milisegundos
    const finalISO = result
      .toUTC()
      .toISO({ suppressMilliseconds: true, includeOffset: false });

    return res.json({ date: finalISO });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(503).json({
      error: "ServerError",
      message: "Ha ocurrido un error inesperado en el servidor."
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

export default app;
