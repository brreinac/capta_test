// src/server.ts
import express, { Request, Response } from "express";
import axios from "axios";
import { DateTime } from "luxon";
import {
  TIMEZONE,
  makeHolidaySet,
  adjustBackwardToWorking,
  addBusinessDays,
  addWorkingHours,
  HolidayList,
} from "./utils/calendar";

/**
 * Tipos explícitos para respuestas
 */
interface ApiSuccess {
  date: string; // UTC ISO 8601 with Z
}
interface ApiError {
  error: string;
  message: string;
}

/**
 * Config
 */
const HOLIDAYS_URL = "https://content.capta.co/Recruitment/WorkingDays.json";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

/**
 * fetchHolidays: intenta descargar la lista remota de festivos
 * Retorna HolidayList (array de strings). Si falla, retorna un fallback mínimo.
 */
async function fetchHolidaysRemote(): Promise<HolidayList> {
  try {
    const resp = await axios.get(HOLIDAYS_URL, { timeout: 5000 });
    if (Array.isArray(resp.data)) {
      return resp.data as HolidayList;
    }
    // detect shape { holidays: [...] }
    if (resp.data && Array.isArray(resp.data.holidays)) {
      return resp.data.holidays as HolidayList;
    }
    return [];
  } catch (err) {
    // fallback mínimo (recomendamos proveer la URL en producción)
    return [
      "2025-01-01",
      "2025-01-06",
      "2025-04-17",
      "2025-04-18",
      "2025-05-01",
      "2025-07-20",
      "2025-08-07",
      "2025-12-08",
      "2025-12-25",
    ];
  }
}

/**
 * GET /working-date
 * Query params:
 *  - days (optional, integer >=0)
 *  - hours (optional, integer >=0)
 *  - date (optional, ISO 8601 UTC ending with Z)
 *
 * Rules:
 *  - if neither days nor hours provided -> 400 InvalidParameters
 *  - parse date if provided (UTC) and convert to Colombia zone for calculations; else use now in Colombia
 *  - adjust start backwards to the nearest working instant
 *  - add days first (business days), then hours
 *  - return { "date": "<ISO UTC with Z>" } (only this key) on 200
 *  - errors follow contract: { error: "InvalidParameters", message: "..." }
 */
app.get("/working-date", async (req: Request, res: Response) => {
  try {
    const daysParam = req.query.days as string | undefined;
    const hoursParam = req.query.hours as string | undefined;
    const dateParam = req.query.date as string | undefined;

    if (!daysParam && !hoursParam) {
      const err: ApiError = { error: "InvalidParameters", message: "Se requiere al menos 'days' o 'hours' en query." };
      return res.status(400).json(err);
    }

    // parse numbers (if presentes)
    const days: number | undefined = daysParam !== undefined ? Number(daysParam) : undefined;
    const hours: number | undefined = hoursParam !== undefined ? Number(hoursParam) : undefined;

    if ((days !== undefined && (!Number.isInteger(days) || days < 0)) || (hours !== undefined && (!Number.isInteger(hours) || hours < 0))) {
      const err: ApiError = { error: "InvalidParameters", message: "'days' y 'hours' deben ser enteros no negativos." };
      return res.status(400).json(err);
    }

    // fetch holidays
    const holidaysList = await fetchHolidaysRemote();
    const holidaySet = makeHolidaySet(holidaysList || []);

    // Determine starting DateTime in Colombia
    let startUtc: DateTime;
    if (dateParam !== undefined) {
      // Must be a valid ISO with Z (UTC)
      startUtc = DateTime.fromISO(dateParam, { zone: "utc" });
      if (!startUtc.isValid) {
        const err: ApiError = { error: "InvalidParameters", message: "El parámetro 'date' debe ser ISO 8601 en UTC (ej. 2025-04-10T15:00:00.000Z)." };
        return res.status(400).json(err);
      }
    } else {
      // Now in UTC, but we will convert to Colombia zone for computation
      startUtc = DateTime.utc();
    }

    // Convert start to Colombia local time for computation
    let startLocal = startUtc.setZone(TIMEZONE);

    // Adjust backwards to nearest working instant per spec
    startLocal = adjustBackwardToWorking(startLocal, holidaySet, TIMEZONE);

    // First add days, then hours
    let resultLocal = startLocal;
    if (days !== undefined && days > 0) {
      resultLocal = addBusinessDays(resultLocal, days, holidaySet, TIMEZONE);
    }
    if (hours !== undefined && hours > 0) {
      resultLocal = addWorkingHours(resultLocal, hours, holidaySet, TIMEZONE);
    }

    // Convert resultLocal to UTC for response
    const resultUtc = resultLocal.setZone("utc", { keepLocalTime: false });

    // Format ISO with 'Z', suppress milliseconds to match examples
    const isoUtcString = resultUtc.toISO({ suppressMilliseconds: true });

    const success: ApiSuccess = { date: isoUtcString as string };
    return res.status(200).json(success);
  } catch (err) {
    // Unexpected internal error: respond 500 with InvalidParameters? Better 503/500, but contract for errors expects {error, message}.
    const message = err instanceof Error ? err.message : "Internal error";
    const errorObj: ApiError = { error: "InvalidParameters", message }; // keep structure but with real message
    return res.status(500).json(errorObj);
  }
});

/**
 * Not-found handler to return JSON as well
 */
app.use((_req: Request, res: Response) => {
  const err = { error: "InvalidParameters", message: "Endpoint no encontrado" };
  res.status(404).json(err);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Working-date API listening on port ${PORT}`);
});
