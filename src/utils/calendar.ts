import { DateTime, Duration } from "luxon";
import { HolidayList } from "../types";

export type WorkSegment = {
  startHour: number; // inclusive
  endHour: number;   // exclusive
};

export const WORK_SEGMENTS: WorkSegment[] = [
  { startHour: 8, endHour: 12 }, // 08:00-12:00
  { startHour: 13, endHour: 17 } // 13:00-17:00
];

export const LUNCH_START = 12;
export const LUNCH_END = 13;

/**
 * Check weekend
 */
export function isWeekend(dt: DateTime): boolean {
  const weekday = dt.weekday; // 1=Mon .. 7=Sun
  return weekday === 6 || weekday === 7;
}

/**
 * Normalize holiday list into set of date strings in YYYY-MM-DD
 */
export function makeHolidaySet(holidays: HolidayList): Set<string> {
  const s = new Set<string>();
  holidays.forEach((h) => {
    // allow 'YYYY-MM-DD' or full ISO
    const d = DateTime.fromISO(h, { zone: "utc" });
    if (d.isValid) {
      s.add(d.toISODate() as string);
    } else {
      // try as plain date
      const trimmed = h.split("T")[0];
      if (trimmed) s.add(trimmed);
    }
  });
  return s;
}

export function isHoliday(dt: DateTime, holidaySet: Set<string>): boolean {
  return holidaySet.has(dt.toISODate() as string);
}

/**
 * Move dt backwards to the nearest working time according to rules:
 * - If non-working day (weekend or holiday) -> move to previous working day's 17:00.
 * - If time <08:00 -> move to previous working day's 17:00.
 * - If time >17:00 -> move to same day 17:00.
 * - If between 12:00 and 13:00 -> move to 12:00 same day.
 * - Otherwise keep.
 *
 * dt is in the Colombia timezone already.
 */
export function adjustBackwardToWorking(dtIn: DateTime, holidaySet: Set<string>, zone: string): DateTime {
  let dt = dtIn.setZone(zone, { keepLocalTime: true });
  while (true) {
    if (isWeekend(dt) || isHoliday(dt, holidaySet)) {
      // previous calendar day at 17:00
      dt = dt.minus({ days: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    const hour = dt.hour + dt.minute / 60;
    if (hour < 8) {
      // previous working day 17:00
      dt = dt.minus({ days: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    if (hour >= 17) {
      dt = dt.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      return dt;
    }

    // between lunch
    if (hour >= LUNCH_START && hour < LUNCH_END) {
      return dt.set({ hour: LUNCH_START, minute: 0, second: 0, millisecond: 0 });
    }

    // inside working hours (08:00-12:00 or 13:00-17:00)
    return dt;
  }
}

/**
 * Find next working day date (preserving time) skipping holidays/weekends
 */
export function nextWorkingDay(dt: DateTime, holidaySet: Set<string>, zone: string): DateTime {
  let candidate = dt.plus({ days: 1 }).setZone(zone, { keepLocalTime: true });
  while (isWeekend(candidate) || isHoliday(candidate, holidaySet)) {
    candidate = candidate.plus({ days: 1 });
  }
  return candidate;
}

/**
 * Add N business days. Each day addition preserves the same local time (but if resulting day is holiday/weekend we skip).
 * Example: from Tue 15:00 +1 day -> Wed 15:00 (if Wed working), else next working day with same time.
 */
export function addBusinessDays(dtIn: DateTime, days: number, holidaySet: Set<string>, zone: string): DateTime {
  let dt = dtIn.setZone(zone, { keepLocalTime: true });
  for (let i = 0; i < days; i++) {
    dt = nextWorkingDay(dt, holidaySet, zone);
  }
  // finally ensure the landing day is working (it should be)
  while (isWeekend(dt) || isHoliday(dt, holidaySet)) {
    dt = nextWorkingDay(dt, holidaySet, zone);
  }
  return dt;
}

/**
 * Add working hours (integer hours) starting from dt (which must already be in a working segment).
 * We advance through segments (morning, lunch gap, afternoon, next day).
 *
 * Rules:
 * - If currently not in working time, first move to the NEXT working time (not backward) — but usage in flow is:
 *   we will adjust the start backward before calling this function when spec says so. So here we assume dt is an allowed start.
 *
 * Returns final DateTime (in same zone) after adding the hours.
 */
export function addWorkingHours(dtIn: DateTime, hoursToAdd: number, holidaySet: Set<string>, zone: string): DateTime {
  let dt = dtIn.setZone(zone, { keepLocalTime: true });
  let hoursLeft = hoursToAdd;

  const segmentEnd = (d: DateTime): DateTime => {
    const hour = d.hour + d.minute / 60;
    if (hour >= 8 && hour < 12) {
      return d.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    } else if (hour >= 13 && hour < 17) {
      return d.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    } else if (hour < 8) {
      return d.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    } else {
      return d.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    }
  };

  // Helper to move to next available work start (8:00 or 13:00). If currently at end (17:00) move to next working day 8:00
  const moveToNextWorkStart = (d: DateTime): DateTime => {
    const h = d.hour + d.minute / 60;
    if (h < 8) return d.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    if (h >= 8 && h < 12) return d;
    if (h >= 12 && h < 13) return d.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
    if (h >= 13 && h < 17) return d;
    // >=17
    // next working day 8:00
    let next = d.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    while (isWeekend(next) || isHoliday(next, holidaySet)) {
      next = next.plus({ days: 1 });
    }
    return next;
  };

  dt = moveToNextWorkStart(dt);

  while (hoursLeft > 0) {
    // if current day is not working, move to next working day start 8:00
    if (isWeekend(dt) || isHoliday(dt, holidaySet)) {
      dt = nextWorkingDay(dt, holidaySet, zone).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    // If in lunch, jump to 13:00
    if (dt.hour >= 12 && dt.hour < 13) {
      dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    // Determine how many hours left in current working segment
    const segEnd = segmentEnd(dt);
    const diffMinutes = segEnd.diff(dt, "minutes").minutes;
    const diffHoursAvailable = Math.floor(diffMinutes / 60); // full hours available in this segment
    const remMinutes = diffMinutes % 60;

    if (diffMinutes <= 0) {
      // no time, move to next segment
      if (segEnd.hour === 12) {
        // jump to 13:00 same day
        dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
      } else {
        // segEnd 17:00 -> next working day 8:00
        let next = dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
        while (isWeekend(next) || isHoliday(next, holidaySet)) next = next.plus({ days: 1 });
        dt = next;
      }
      continue;
    }

    // If the available minutes are >= remaining hours * 60 -> do last add
    if (diffMinutes >= hoursLeft * 60) {
      dt = dt.plus({ hours: hoursLeft });
      hoursLeft = 0;
      break;
    }

    // Otherwise consume the whole segment (as much as possible)
    const consumeHours = Math.floor(diffMinutes / 60);
    if (consumeHours > 0) {
      dt = dt.plus({ hours: consumeHours });
      hoursLeft -= consumeHours;
    }

    // if there are leftover minutes in the segment (remMinutes > 0) but we only accept integer hours
    // we need to move dt to segment end and then continue.
    dt = segEnd;
    // Move to next segment start
    if (segEnd.hour === 12) {
      dt = dt.set({ hour: 13, minute: 0, second: 0, millisecond: 0 });
    } else {
      // segEnd 17 -> next day 8
      let next = dt.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      while (isWeekend(next) || isHoliday(next, holidaySet)) next = next.plus({ days: 1 });
      dt = next;
    }
  }

  return dt;
}
