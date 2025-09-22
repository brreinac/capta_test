import express, { Request, Response } from "express";
import axios from "axios";
import { DateTime } from "luxon";
import { HOLIDAYS_URL, TIMEZONE } from "./config";
import { makeHolidaySet, adjustBackwardToWorking, addBusinessDays, addWorkingHours } from "./utils/calendar";
import { ApiResponseError, ApiResponseSuccess, HolidayList } from "./types";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

/**
 * Fetch holidays JSON from provided URL. Expecting an array of date strings.
 * If fetch fails, fallback to an empty array (or embed a static sample).
 */
async function fetchHolidays(): Promise<HolidayList> {
  try {
    const resp = await axios.get(HOLIDAYS_URL, { timeout: 5000 });
    if (Array.isArray(resp.data)) {
      return resp.data as HolidayList;
    }
    // If JSON has object { holidays: [...] } try to detect common shapes
    if (resp.data && Array.isArray(resp.data.holidays)) {
      return resp.data.holidays;
    }
    return [];
  } catch (err) {
    // fallback: minimal sample (recommended to rely on remote JSON in production)
    console.warn("Failed to fetch holidays from remote URL, using fallback sample. Error:", (err as Error).message);
    return [
      // minimal fallback sample (YYYY-MM-DD)
      "2025-01-01",
      "2025-01-06",
      "2025-04-17",
      "2025-04-18",
      "2025-05-01",
      "2025-07-20",
      "2025-08-07",
      "2025-12-08",
      "2025-12-25"
    ];
  }
}

/**
 * Our endpoint
 */
app.get("/working-date", async (req: Request, res: Response) => {
  const { days: daysQ, hours: hoursQ, date: dateQ } = req.query;

  if (!daysQ && !hoursQ) {
    const err: ApiResponseError = { error: "InvalidParameters", message: "Se requiere al menos 'days' o 'hours'." };
    return res.status(400).json(err);
  }

  // parse params
  const days = typeof daysQ === "string" ? (daysQ === "" ? undefined : Number(daysQ)) : undefined;
  const hours = typeof hoursQ === "string" ? (hoursQ === "" ? undefined : Number(hoursQ)) : undefined;

  if ((days !== undefined && (!Number.isInteger(days) || days < 0))
    || (hours !== undefined && (!Number.isInteger(hours) || hours < 0))) {
    const err: ApiResponseError = { error: "InvalidParameters", message: "Params 'days' and 'hours' deben ser enteros no negativos." };
    return res.status(400).json(err);
  }

  // load holidays
  const holidaysArr = await fetchHolidays();
  const holidaySet = makeHolidaySet(holidaysArr);

  // Determine start DateTime in Colombia zone
  let startUTC: DateTime;
  if (typeof dateQ === "string" && dateQ) {
    // provided as UTC ISO with Z
    startUTC = DateTime.fromISO(dateQ, { zone: "utc" });
    if (!startUTC.isValid) {
      const err: ApiResponseError = { error: "InvalidParameters", message: "Parámetro 'date' inválido. Debe ser ISO 8601 con Z." };
      return res.status(400).json(err);
    }
  } else {
    startUTC = DateTime.utc(); // ahora en UTC
  }

  // convert to Colombia time for computation
  let startLocal = startUTC.setZone(TIMEZONE);

  // adjust start backwards to working time per rules
  startLocal = adjustBackwardToWorking(startLocal, holidaySet, TIMEZONE);

  // first add days (if any), then hours (if any)
  let resultLocal = startLocal;
  if (days !== undefined && days > 0) {
    resultLocal = addBusinessDays(resultLocal, days, holidaySet, TIMEZONE);
  }
  if (hours !== undefined && hours > 0) {
    // ensure we start at a valid working moment. Per spec we adjusted backwards already.
    // If resultLocal is not inside working hours (e.g., was exactly 17:00), addWorkingHours handles moving forward.
    resultLocal = addWorkingHours(resultLocal, hours, holidaySet, TIMEZONE);
  }

  // convert back to UTC for the response
  const resultUTC = resultLocal.setZone("utc", { keepLocalTime: false });
  // Format to ISO with Z and seconds (no milliseconds)
  const isoUtc = resultUTC.toISO({ suppressMilliseconds: true });

  const success: ApiResponseSuccess = { date: isoUtc as string };
  // Exactly the required JSON (single key)
  return res.status(200).json(success);
});

app.use((_, res) => {
  const err = { error: "NotFound", message: "Endpoint no encontrado" };
  res.status(404).json(err);
});

app.listen(PORT, () => {
  console.log(`Working days API listening on port ${PORT}`);
});
