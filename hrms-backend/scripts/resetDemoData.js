// Resets the demo dataset so seed.js can rebuild it from scratch.
//
// WHY: seed.js is idempotent by "exists → skip", which makes it safe to
// re-run but useless for REPAIRING a database that has drifted — pending
// leave requests keep their old dates, an ended parental leave is never
// extended, and attendance rows the nightly close job marked "no-show"
// (everyone, every day, on a system nobody clocks in to) stay exactly as
// they are. The only reliable path back to a clean demo is: reset, then seed.
//
// WHAT IT KEEPS:
//   - `_migrations`      — startup-migration markers; dropping them re-runs
//                          every one-off backfill on the next boot.
//   - `rolePermissions`  — the permission matrix HR may have customised.
//   - `users` rows that carry credentials or links you'd otherwise have to
//     recreate by hand: every account in KEEP_USER_EMAILS (the GitHub
//     Actions service account by default — its password is a repository
//     secret), plus any user with a linked Telegram chat or a web-push
//     subscription. Those users have their `employee` link cleared so
//     seed.js re-attaches them to the freshly created Employee record.
//   - `pushSubscriptions` / `telegramLinkCodes` for the users kept.
//
// EVERYTHING ELSE IS DROPPED. This is destructive and there is no undo
// beyond your own backup — hence the two-step usage:
//
//   cd hrms-backend
//   node scripts/resetDemoData.js                  # dry run: prints the plan, changes nothing
//   node scripts/resetDemoData.js --confirm        # actually does it
//   NODE_ENV=production node scripts/resetDemoData.js --confirm
//
// Then:  npm run seed:env   (or seed:prod)
//
// Dev and prod currently point at the SAME Atlas database — check
// CONNECT_STRING's database name in the dry-run banner before confirming.

import dotenv from "dotenv";
const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

const KEEP_USER_EMAILS = new Set(
  (process.env.RESET_KEEP_USERS || "ci@hrms.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const KEEP_COLLECTIONS = new Set(["_migrations", "rolePermissions", "users", "pushSubscriptions", "telegramLinkCodes"]);

const confirm = process.argv.includes("--confirm");

async function run() {
  await connectDB();
  const db = mongoose.connection.db;
  console.log(`\nDatabase: ${db.databaseName}   (NODE_ENV=${env})`);
  console.log(confirm ? "MODE: --confirm — changes WILL be applied\n" : "MODE: dry run — nothing will change\n");

  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();

  // Users to keep: explicit list + anyone with an out-of-app channel linked.
  const users = db.collection("users");
  const pushOwners = await db.collection("pushSubscriptions").distinct("user");
  const keepUsers = await users
    .find({
      $or: [
        { email: { $in: [...KEEP_USER_EMAILS] } },
        { "notify.telegramChatId": { $nin: [null, ""] } },
        { _id: { $in: pushOwners } },
      ],
    })
    .project({ email: 1, role: 1, "notify.telegramChatId": 1 })
    .toArray();
  const keepUserIds = keepUsers.map((u) => u._id);

  console.log("Users kept (employee link will be cleared so seed.js re-attaches them):");
  for (const u of keepUsers) {
    const why = [
      KEEP_USER_EMAILS.has(String(u.email).toLowerCase()) && "keep-list",
      u.notify?.telegramChatId && "telegram",
      pushOwners.some((id) => String(id) === String(u._id)) && "web-push",
    ].filter(Boolean).join(", ");
    console.log(`  - ${u.email} (${u.role}) — ${why}`);
  }
  if (!keepUsers.length) console.log("  (none)");

  console.log("\nPlan:");
  const plan = [];
  for (const name of collections) {
    const count = await db.collection(name).countDocuments();
    if (name === "users") {
      plan.push({ name, action: "delete all except kept", count, remove: count - keepUserIds.length });
    } else if (name === "pushSubscriptions" || name === "telegramLinkCodes") {
      const remove = await db.collection(name).countDocuments({ user: { $nin: keepUserIds } });
      plan.push({ name, action: "delete rows of removed users", count, remove });
    } else if (KEEP_COLLECTIONS.has(name)) {
      plan.push({ name, action: "keep", count, remove: 0 });
    } else {
      plan.push({ name, action: "DROP", count, remove: count });
    }
  }
  for (const p of plan) {
    console.log(`  ${p.name.padEnd(22)} ${String(p.count).padStart(6)} docs   ${p.action}${p.remove ? ` (−${p.remove})` : ""}`);
  }

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to apply.");
    await mongoose.connection.close();
    return;
  }

  console.log("\nApplying…");
  for (const p of plan) {
    if (p.action === "DROP") {
      await db.collection(p.name).drop();
      console.log(`  dropped ${p.name}`);
    } else if (p.name === "users") {
      const res = await users.deleteMany({ _id: { $nin: keepUserIds } });
      const unlinked = await users.updateMany({ _id: { $in: keepUserIds } }, { $set: { employee: null } });
      console.log(`  users: removed ${res.deletedCount}, cleared employee link on ${unlinked.modifiedCount}`);
    } else if (p.name === "pushSubscriptions" || p.name === "telegramLinkCodes") {
      const res = await db.collection(p.name).deleteMany({ user: { $nin: keepUserIds } });
      console.log(`  ${p.name}: removed ${res.deletedCount}`);
    }
  }
  console.log("\nDone. Now run:  npm run seed:env   (or npm run seed:prod)\n");
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
