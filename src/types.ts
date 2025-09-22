export interface ApiResponseSuccess {
  date: string; // UTC ISO with Z
}

export interface ApiResponseError {
  error: string;
  message: string;
}

export type HolidayList = string[]; // array of ISO date strings (yyyy-mm-dd or full ISO)
