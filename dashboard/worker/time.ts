// Business days are Pakistan days (PKT, UTC+5, no daylight saving); shared by the Worker and the dashboard UI.
export const TIME_ZONE = "Asia/Karachi";
const OFFSET = "+05:00";
const OFFSET_MS = 5 * 3_600_000;

/** The PKT calendar day ("2026-11-16") an instant falls on. */
export const pktDay = (instant: Date | string = new Date()) => new Date(new Date(instant).getTime() + OFFSET_MS).toISOString().slice(0, 10);

/** The instant a PKT calendar day starts. */
export const pktDayStart = (day: string) => new Date(`${day}T00:00:00${OFFSET}`);

/** "2026-11-16T15:30" (a datetime-local value) read as PKT wall time. */
export const fromPktWallTime = (value: string) => new Date(`${value}:00${OFFSET}`);

/** An instant as PKT wall time for a datetime-local input. */
export const toPktWallTime = (instant: string) => new Date(new Date(instant).getTime() + OFFSET_MS).toISOString().slice(0, 16);
