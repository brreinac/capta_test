import { calculateWorkingTime } from "../src/utils/calendar";

describe("API Working Days - Cálculo de fechas", () => {
  it("Caso 1: 1 día desde 2023-06-19 08:00 (feriado) → 2023-06-20 08:00", () => {
    const result = calculateWorkingTime({
      days: 1,
      date: "2023-06-19T08:00:00Z"
    });
    expect(result).toBe("2023-06-20T13:00:00Z"); // 8am COL = 13:00 UTC
  });

  it("Caso 2: 2 días desde 2023-06-16 08:00 (viernes) → 2023-06-20 08:00", () => {
    const result = calculateWorkingTime({
      days: 2,
      date: "2023-06-16T08:00:00Z"
    });
    expect(result).toBe("2023-06-20T13:00:00Z");
  });

  it("Caso 3: 5 horas desde 2023-06-16 08:00 (viernes) → 2023-06-16 13:00", () => {
    const result = calculateWorkingTime({
      hours: 5,
      date: "2023-06-16T08:00:00Z"
    });
    expect(result).toBe("2023-06-16T18:00:00Z");
  });

  it("Caso 4: 1 hora desde 2023-06-16 16:00 (viernes) → 2023-06-19 08:00", () => {
    const result = calculateWorkingTime({
      hours: 1,
      date: "2023-06-16T16:00:00Z"
    });
    expect(result).toBe("2023-06-19T13:00:00Z");
  });

  it("Caso 5: 1 hora desde 2023-06-16 12:00 (almuerzo) → 2023-06-16 13:00", () => {
    const result = calculateWorkingTime({
      hours: 1,
      date: "2023-06-16T12:00:00Z"
    });
    expect(result).toBe("2023-06-16T18:00:00Z");
  });

  it("Caso 6: 9 horas desde 2023-06-16 08:00 (viernes) → 2023-06-19 09:00", () => {
    const result = calculateWorkingTime({
      hours: 9,
      date: "2023-06-16T08:00:00Z"
    });
    expect(result).toBe("2023-06-19T14:00:00Z");
  });

  it("Caso 7: 1 día y 1 hora desde 2023-06-16 16:00 → 2023-06-20 08:00", () => {
    const result = calculateWorkingTime({
      days: 1,
      hours: 1,
      date: "2023-06-16T16:00:00Z"
    });
    expect(result).toBe("2023-06-20T13:00:00Z");
  });

  it("Caso 8: 1 día y 1 hora desde 2023-06-16 08:00 → 2023-06-19 09:00", () => {
    const result = calculateWorkingTime({
      days: 1,
      hours: 1,
      date: "2023-06-16T08:00:00Z"
    });
    expect(result).toBe("2023-06-19T14:00:00Z");
  });

  it("Caso 9: 1 día y 2 horas desde 2023-06-16 08:00 → 2023-06-19 10:00", () => {
    const result = calculateWorkingTime({
      days: 1,
      hours: 2,
      date: "2023-06-16T08:00:00Z"
    });
    expect(result).toBe("2023-06-19T15:00:00Z");
  });
});
