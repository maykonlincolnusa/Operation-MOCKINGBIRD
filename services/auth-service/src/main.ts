import { createPostgresPool, migrations } from "@mockingbird/database";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import winston from "winston";
import { z } from "zod";

const logger = winston.createLogger({ format: winston.format.json(), transports: [new winston.transports.Console()] });
const pool = createPostgresPool(process.env.DATABASE_URL ?? "postgres://auth:auth@localhost:5432/auth");

async function ensureSeedAccount(): Promise<void> {
  const email = "admin@mockingbird.local";
  const existing = await pool.query("SELECT id FROM accounts WHERE email=$1", [email]);
  if (!existing.rowCount) {
    await pool.query(
      "INSERT INTO accounts (id, tenant_id, email, password_hash, roles) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), "demo", email, await bcrypt.hash("mockingbird", 10), ["admin"]]
    );
  }
}

async function main(): Promise<void> {
  await pool.query(migrations.auth);
  await ensureSeedAccount();
  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.post("/login", async (req, res, next) => {
    try {
      const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
      const result = await pool.query("SELECT * FROM accounts WHERE email=$1", [input.email]);
      const account = result.rows[0];
      if (!account || !(await bcrypt.compare(input.password, account.password_hash))) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }
      const token = jwt.sign(
        { sub: account.id, tenantId: account.tenant_id, roles: account.roles },
        process.env.JWT_SECRET ?? "dev_mockingbird_secret",
        { expiresIn: "8h" }
      );
      res.json({ token, user: { id: account.id, email: account.email, tenantId: account.tenant_id, roles: account.roles } });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("auth_service_error", { error: error.message });
    res.status(400).json({ error: error.message });
  });

  app.listen(Number(process.env.PORT ?? 4000), () => logger.info("auth_service_started"));
}

main().catch((error) => {
  logger.error("auth_service_boot_failed", { error: error.message });
  process.exit(1);
});

