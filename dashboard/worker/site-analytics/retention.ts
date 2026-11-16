import { run, type Db } from "../db";
import { pktDay } from "../time";

const KEEP_DAYS = 400;

export const deleteOldEvents = (db: Db) => run(db, "DELETE FROM web_events WHERE day < ?", [pktDay(new Date(Date.now() - KEEP_DAYS * 86_400_000))]);
