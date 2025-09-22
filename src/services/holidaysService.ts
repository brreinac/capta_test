import axios from "axios";
import { HOLIDAYS_URL } from "../config";
import { HolidayList } from "../types";


export async function fetchHolidaysRemote(timeout = 5000): Promise<HolidayList> {
try {
const resp = await axios.get(HOLIDAYS_URL, { timeout });
if (Array.isArray(resp.data)) return resp.data as HolidayList;
if (resp.data && Array.isArray(resp.data.holidays)) return resp.data.holidays;
return [];
} catch (err) {
console.warn("Failed to fetch holidays", (err as Error).message);
return [];
}
}