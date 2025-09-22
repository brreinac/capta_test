// src/utils/calendar.ts
import { DateTime } from "luxon";

/**
 * Tipos públicos
 */
export type HolidayList = string[]; // array de strings ISO o 'YYYY-MM-DD'

export interface WorkSegment {
  startHour: number; // inclusive hour (e.g. 8)
  endHour: number;   // exclusive hour (e.g. 12)
}

/**
 * Constantes
 */
export const TIMEZONE = "America/Bogota";
export const WORK_SEGMENTS: WorkSegment[] = [
  { startHour: 8, endHour: 12 },  // 08:00 - 12:00
  { startHour: 13, endHour: 17 }, // 13:00 - 17:00
];
export const LUNCH_START = 12;
export const LUNCH_END = 13;

/**
 * Convierte la lista de festivos a un Set de 'YYYY-MM-DD' para búsquedas rápidas.
 */
export function makeHolidaySet(holidays: HolidayList): Set<string> {
  const s = new Set<string>();
  for (const h of holidays) {
    // intentamos parsear como ISO; si falla, tomar primer segmento 'YYYY-MM-DD'
    const dt = DateTime.fromISO(h, { zone: "utc" });
    if (dt.isValid) {
      s.add(dt.toISODate() as string);
    } else {
      const maybeDate = h.split("T")[0];
      if (maybeDate) s.add(maybeDate);
    }
  }
  return s;
}

/**
 * isWeekend: true si sábado(6) o domingo(7)
 */
export function isWeekend(dt: DateTime): boolean {
  return dt.weekday === 6 || dt.weekday === 7;
}

/**
 * isHoliday: true si la fecha local (en zone) está en holidaySet
 */
export function isHoliday(dt: DateTime, holidaySet: Set<string>): boolean {
  return holidaySet.has(dt.toISODate() as string);
}

/**
 * adjustBackwardToWorking:
 * Dado un DateTime en timezone local (o convertible), mueve hacia ATRÁS hasta el instante laboral más cercano
 * Reglas:
 *  - Si día es fin de semana o festivo -> retroceder al día previo y fijar 17:00
 *  - Si hora < 08:00 -> retroceder al día previo 17:00
 *  - Si hora >= 17:00 -> fijar 17:00 del mismo día
 *  - Si dentro de almuerzo (12:00-13:00) -> fijar 12:00 (fin de la mañana)
 *  - Si en hora laboral [08:00-12:00) o [13:00-17:00) -> conservar
 *
 * dtIn puede ser en cualquier zona; la función lo convertirá a zone (p. ej. America/Bogota)
 */
export function adjustBackwardToWorking(dtIn: DateTime, holidaySet: Set<string>, zone: string = TIMEZONE): DateTime {
  let dt = dtIn.setZone(zone, { keepLocalTime: true }).set({ second: 0, millisecond: 0 });

  // bucle hasta que dt quede dentro de reglas
  while (true) {
    if (isWeekend(dt) || isHoliday(dt, holidaySet)) {
      // retroceder un día y poner 17:00
      dt = dt.minus({ days: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    const hourDecimal = dt.hour + dt.minute / 60;

    if (hourDecimal < 8) {
      // antes del horario -> retroceder al día anterior 17:00
      dt = dt.minus({ days: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    if (hourDecimal >= 17) {
      // después del horario -> fijar 17:00 mismo día
      dt = dt.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      return dt;
    }

    // entre 12:00 y 13:00 -> fijar a 12:00
    if (hourDecimal >= LUNCH_START && hourDecimal < LUNCH_END) {
      dt = dt.set({ hour: LUNCH_START, minute: 0, second: 0, millisecond: 0 });
      return dt;
    }

    // entre 08:00-12:00 o 13:00-17:00 -> ya es válido (si está entre 12 y 13 lo manejamos arriba)
    return dt;
  }
}

/**
 * nextWorkingDay: devuelve el siguiente día *calendario* que no sea fin de semana ni festivo,
 * manteniendo la hora local del instante original (se usa para preservar hora tras sumar días).
 */
export function nextWorkingDay(dtIn: DateTime, holidaySet: Set<string>, zone: string = TIMEZONE): DateTime {
  let candidate = dtIn.plus({ days: 1 }).setZone(zone, { keepLocalTime: true }).set({ second: 0, millisecond: 0 });
  while (isWeekend(candidate) || isHoliday(candidate, holidaySet)) {
    candidate = candidate.plus({ days: 1 });
  }
  return candidate;
}

/**
 * addBusinessDays:
 * Agrega N días hábiles (entero >= 0) a dtIn. Mantiene la hora local.
 * Ejemplo: Tue 15:00 + 1 business day -> Wed 15:00 (si Wed es hábil), sino siguiente día hábil a las 15:00.
 */
export function addBusinessDays(dtIn: DateTime, days: number, holidaySet: Set<string>, zone: string = TIMEZONE): DateTime {
  if (days <= 0) return dtIn.setZone(zone, { keepLocalTime: true });

  let dt = dtIn.setZone(zone, { keepLocalTime: true });
  for (let i = 0; i < days; i++) {
    dt = nextWorkingDay(dt, holidaySet, zone);
  }

  // asegurar que el landing day no sea feriado/fin de semana
  while (isWeekend(dt) || isHoliday(dt, holidaySet)) {
    dt = nextWorkingDay(dt, holidaySet, zone);
  }

  return dt;
}

/**
 * addWorkingHours:
 * Suma horas laborales (entero >= 0) empezando desde dtIn (que puede o no estar dentro de horario).
 * - Si dtIn está fuera de horario, la función moverá hacia ADELANTE al próximo inicio válido
 *   (esto es intencional: para las reglas del prompt se ha hecho el ajuste *hacia atrás* antes
 *    de llamar a esta función; sin embargo aquí se maneja el caso de seguridad).
 * - Maneja el bloqueo de almuerzo (12:00-13:00) y transiciones entre segmentos.
 * - hoursToAdd debe ser entero (según enunciado). Si se requiere fracciones, adaptar.
 *
 * Retorna DateTime en la misma zona (zone).
 */
export function addWorkingHours(dtIn: DateTime, hoursToAdd: number, holidaySet: Set<string>, zone: string = TIMEZONE): DateTime {
  let dt = dtIn.setZone(zone, { keepLocalTime: true }).set({ second: 0, millisecond: 0 });
  let hoursLeft = hoursToAdd;

  // Mueve al próximo inicio de trabajo si está fuera (si está en lunch, se moverá a 13:00; si antes de 8 -> 8:00; si >=17 -> next day 8:00)
  const moveToNextWorkStart = (): void => {
    const h = dt.hour + dt.minute / 60;
    if (h < 8) {
      dt = dt.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      return;
    }
    if (h >= 8 && h < 12) return;
    if (h >= 12 && h < 13) {
      dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
      return;
    }
    if (h >= 13 && h < 17) return;
    // >=17 -> next working day 08:00
    let next = dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    while (isWeekend(next) || isHoliday(next, holidaySet)) {
      next = next.plus({ days: 1 });
    }
    dt = next;
  };

  moveToNextWorkStart();

  while (hoursLeft > 0) {
    // si el día actual no es laboral -> mover al siguiente día laboral a las 08:00
    if (isWeekend(dt) || isHoliday(dt, holidaySet)) {
      dt = nextWorkingDay(dt, holidaySet, zone).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    // si está en almuerzo, saltar a 13:00
    if (dt.hour >= 12 && dt.hour < 13) {
      dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    // calcular minutos disponibles hasta el fin del segmento actual
    let segmentEnd: DateTime;
    const h = dt.hour + dt.minute / 60;
    if (h >= 8 && h < 12) {
      segmentEnd = dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    } else if (h >= 13 && h < 17) {
      segmentEnd = dt.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    } else if (h < 8) {
      segmentEnd = dt.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    } else {
      // h >= 17
      // move to next day 08:00
      let next = dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      while (isWeekend(next) || isHoliday(next, holidaySet)) next = next.plus({ days: 1 });
      dt = next;
      continue;
    }

    const availableMinutes = Math.max(0, Math.floor(segmentEnd.diff(dt, "minutes").minutes));
    const availableHours = Math.floor(availableMinutes / 60);

    if (availableMinutes <= 0) {
      // nada disponible: saltar al siguiente segmento
      if (segmentEnd.hour === 12) {
        dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
      } else {
        // segmentEnd 17:00 -> next working day 8:00
        let next = dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
        while (isWeekend(next) || isHoliday(next, holidaySet)) next = next.plus({ days: 1 });
        dt = next;
      }
      continue;
    }

    // Si puede consumir todo lo que queda en este segmento y cubrir hoursLeft
    if (availableMinutes >= hoursLeft * 60) {
      dt = dt.plus({ hours: hoursLeft });
      hoursLeft = 0;
      break;
    }

    // Consume las horas enteras disponibles
    const consumeHours = Math.floor(availableMinutes / 60);
    if (consumeHours > 0) {
      dt = dt.plus({ hours: consumeHours });
      hoursLeft -= consumeHours;
    }

    // Mover al final del segmento (si quedan minutos residuales) y luego al siguiente segmento
    dt = segmentEnd;
    if (segmentEnd.hour === 12) {
      // saltar a 13:00
      dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
    } else {
      // fin de jornada -> next day 08:00
      let next = dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      while (isWeekend(next) || isHoliday(next, holidaySet)) next = next.plus({ days: 1 });
      dt = next;
    }
  }

  return dt;
}
