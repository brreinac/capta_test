export interface ApiResponseSuccess {
date: string; // UTC ISO with Z
}


export interface ApiResponseError {
error: string;
message: string;
}


export type HolidayList = string[];