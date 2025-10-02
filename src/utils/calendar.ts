import { DateTime } from "luxon";

// Jornada laboral en Colombia
const WORK_START = 8;   // 8 AM
const LUNCH_START = 12; // 12 PM
const LUNCH_END = 13;   // 1 PM
const WORK_END = 17;    // 5 PM

// Cargar festivos desde JSON oficial
let holidays: string[] = [];

async function loadHolidays(): Promise<void> {
  if (holidays.length > 0) return;
  try {
    const response = await fetch("https://content.capta.co/Recruitment/WorkingDays.json");
    holidays = await response.json();
  } catch (err) {
    console.error("No se pudo cargar el calendario oficial, usando arreglo vacío:", err);
    holidays = [];
  }
}

function isHoliday(date: DateTime): boolean {
  return holidays.includes(date.toISODate() ?? "");
}

function isBusinessDay(date: DateTime): boolean {
  const weekday = date.weekday; // 1 = lunes, 7 = domingo
  return weekday >= 1 && weekday <= 5 && !isHoliday(date);
}

export function normalizeToBusinessTime(date: DateTime): DateTime {
  let current = date;

  // Mover atrás si cae en fin de semana o festivo
  while (!isBusinessDay(current)) {
    current = current.minus({ days: 1 }).set({ hour: WORK_END, minute: 0, second: 0, millisecond: 0 });
  }

  // Ajustar hora
  if (current.hour < WORK_START) {
    current = current.set({ hour: WORK_START, minute: 0, second: 0, millisecond: 0 });
  } else if (current.hour >= WORK_END) {
    current = current.set({ hour: WORK_END, minute: 0, second: 0, millisecond: 0 });
  } else if (current.hour >= LUNCH_START && current.hour < LUNCH_END) {
    // en rango almuerzo → fijar a las 12:00
    current = current.set({ hour: LUNCH_START, minute: 0, second: 0, millisecond: 0 });
  }

  return current;
}

export function addBusinessDays(date: DateTime, days: number): DateTime {
  let current = date;
  let added = 0;
  while (added < days) {
    current = current.plus({ days: 1 }).set({ hour: WORK_START, minute: 0, second: 0, millisecond: 0 });
    if (isBusinessDay(current)) {
      added++;
    }
  }
  return current;
}

export function addBusinessHours(date: DateTime, hours: number): DateTime {
  let current = date;
  let remaining = hours;

  while (remaining > 0) {
    // Calcular fin del bloque actual (mañana o tarde)
    let blockEnd: DateTime;
    if (current.hour < LUNCH_START) {
      blockEnd = current.set({ hour: LUNCH_START, minute: 0, second: 0, millisecond: 0 });
    } else if (current.hour >= LUNCH_END && current.hour < WORK_END) {
      blockEnd = current.set({ hour: WORK_END, minute: 0, second: 0, millisecond: 0 });
    } else {
      // fuera de bloques válidos → normalizar y continuar
      current = normalizeToBusinessTime(current);
      continue;
    }

    const diff = blockEnd.diff(current, "hours").hours;
    if (remaining <= diff) {
      return current.plus({ hours: remaining });
    } else {
      remaining -= diff;
      current = blockEnd;

      // Saltar almuerzo si justo terminó a las 12
      if (current.hour === LUNCH_START) {
        current = current.set({ hour: LUNCH_END, minute: 0 });
      }

      // Si terminó a las 17 → pasar al próximo día hábil
      if (current.hour === WORK_END) {
        do {
          current = current.plus({ days: 1 }).set({ hour: WORK_START, minute: 0 });
        } while (!isBusinessDay(current));
      }
    }
  }
  return current;
}

// ---- Nueva función central para los tests ----
export interface CalculationInput {
  days?: number;
  hours?: number;
  date?: string; // fecha inicial en UTC
}

export function calculateWorkingTime(input: CalculationInput): string {
  const { days = 0, hours = 0, date } = input;

  // punto de partida: si hay date usarlo, si no usar "ahora" en Colombia
  let current = date
    ? DateTime.fromISO(date, { zone: "utc" }).setZone("America/Bogota")
    : DateTime.now().setZone("America/Bogota");

  // normalizar al horario laboral
  current = normalizeToBusinessTime(current);

  // primero sumar días hábiles
  if (days > 0) {
    current = addBusinessDays(current, days);
  }

  // luego sumar horas hábiles
  if (hours > 0) {
    current = addBusinessHours(current, hours);
  }

  // devolver en UTC ISO
  const iso = current.toUTC().toISO();
  if (!iso) {
    throw new Error("Error al convertir a ISO");
  }
  return iso;
}

// Inicializar festivos al cargar módulo
loadHolidays().then(() => console.log("Festivos cargados:", holidays.length));
