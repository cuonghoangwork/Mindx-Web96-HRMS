// One-off migration — fills in the blank `actor.name` on audit rows written
// before the JWT started carrying the user's name (2026-09-07). Those rows
// recorded actor.id and actor.role but no name, so the Settings audit table
// showed "—" and the dashboard feed dropped its " by <name>" suffix.
//
// Safe to re-run: only matches rows still missing a name, so a second run is a
// no-op. Also runs automatically on server boot (see
// utils/startupMigrations.js, which this script calls into) — this file exists
// for running the fix manually without a full server start, and for seeing the
// counts, which the boot path does not print.
//
// Usage:
//   cd hrms-backend
//   node scripts/backfillAuditActorNames.js       (uses .env.dev)
//   NODE_ENV=prod node scripts/backfillAuditActorNames.js

import dotenv from "dotenv";
const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import { connectDB } from "../config/db.js";
import { backfillAuditActorNames } from "../utils/startupMigrations.js";
import mongoose from "mongoose";

async function run() {
  await connectDB();

  const { actors, resolved, updated } = await backfillAuditActorNames();
  console.log(`AuditLog: ${updated} row(s) given an actor name, from ${resolved} of ${actors} distinct actor(s).`);
  if (actors > resolved) {
    // Not an error — the account was hard-deleted, so the name is gone with
    // it. Reported so the leftover "—" rows in the UI have an explanation.
    console.log(`${actors - resolved} actor id(s) no longer have a User row; those rows keep a blank name.`);
  }

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
