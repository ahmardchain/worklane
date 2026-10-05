import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Workers Builds sets WORKERS_CI=1. Ordinary local builds never touch an account.
const remote =
  process.env.WORKERS_CI === "1" || process.argv.includes("--remote");
const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = resolve(root, "wrangler.json");
const builtPath = resolve(root, "dist/server/wrangler.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const built = JSON.parse(readFileSync(builtPath, "utf8"));
const database = source.d1_databases.find((item) => item.binding === "DB");
if (built.name !== source.name || !database) {
  throw new Error(
    "Build configuration is stale. Run pnpm build before deploying.",
  );
}
if (!remote) {
  console.log(
    "Cloudflare bundle ready. Remote database preparation runs in Workers Builds or pnpm run deploy.",
  );
} else {
  const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
  const env = {
    ...process.env,
    CI: "true",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: resolve(root, ".wrangler/logs"),
  };
  function run(args, capture = false) {
    const result = spawnSync(process.execPath, [wrangler, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        "Cloudflare preparation failed. The Workers build API token needs D1 Edit and Workers Scripts Edit permissions for this account. See the Wrangler error above.",
      );
    }
    return result.stdout;
  }
  function findDatabase() {
    const databases = JSON.parse(
      run(["d1", "list", "--json", "--config", sourcePath], true),
    );
    if (!Array.isArray(databases))
      throw new Error("Unexpected D1 list response.");
    return databases.find((item) => item.name === database.database_name);
  }
  let id = database.database_id;
  if (!id) {
    let existing = findDatabase();
    if (!existing) {
      run([
        "d1",
        "create",
        database.database_name,
        "--config",
        sourcePath,
        "--no-update-config",
      ]);
      existing = findDatabase();
    }
    id = existing?.uuid;
  }
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new Error("Cloudflare did not return a valid D1 database ID.");
  }
  // Only modify the ignored build output. The same named database is reused on
  // every deployment; migration failures stop the build before Worker upload.
  built.d1_databases = [
    {
      ...database,
      database_id: id,
      migrations_dir: resolve(root, database.migrations_dir),
    },
  ];
  built.keep_vars = true;
  writeFileSync(builtPath, `${JSON.stringify(built, null, 2)}\n`);
  run(["d1", "migrations", "apply", "DB", "--remote", "--config", builtPath]);
  console.log("Cloudflare database and migrations ready for worklane.");
}
