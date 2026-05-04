import { createPostgresPool, migrations, withTransaction } from "@mockingbird/database";
import { createEnvelope, EventBus, UserUpdatedPayload } from "@mockingbird/events";
import express from "express";
import { randomUUID } from "node:crypto";
import winston from "winston";
import { z } from "zod";

const logger = winston.createLogger({ format: winston.format.json(), transports: [new winston.transports.Console()] });
const pool = createPostgresPool(process.env.DATABASE_URL ?? "postgres://users:users@localhost:5432/users");
const eventBus = new EventBus(process.env.RABBITMQ_URL ?? "amqp://mockingbird:mockingbird@localhost:5672");

const userInput = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  tags: z.array(z.string()).default([]),
  credits: z.number().int().nonnegative().default(0)
});

function tenantId(req: express.Request): string {
  return req.header("x-tenant-id") ?? "public";
}

async function publishUserUpdated(user: { id: string; tenant_id: string; phone: string; tags: string[] }): Promise<void> {
  await eventBus.publish(createEnvelope<UserUpdatedPayload & Record<string, unknown>>("UserUpdated", user.tenant_id, {
    userId: user.id,
    phone: user.phone,
    tags: user.tags
  }));
}

async function main(): Promise<void> {
  await pool.query(migrations.users);
  await eventBus.connect();

  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/metrics", (_req, res) => res.type("text/plain").send("user_service_up 1\n"));

  /**
   * @openapi
   * /users:
   *   post:
   *     summary: Create a user/contact profile.
   */
  app.post("/users", async (req, res, next) => {
    try {
      const input = userInput.parse(req.body);
      const id = randomUUID();
      const result = await pool.query(
        "INSERT INTO users (id, tenant_id, name, phone, tags, credits) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        [id, tenantId(req), input.name, input.phone, input.tags, input.credits]
      );
      await publishUserUpdated(result.rows[0]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.get("/users", async (req, res, next) => {
    try {
      const tag = req.query.tag?.toString();
      const result = tag
        ? await pool.query("SELECT * FROM users WHERE tenant_id=$1 AND $2 = ANY(tags) ORDER BY created_at DESC", [tenantId(req), tag])
        : await pool.query("SELECT * FROM users WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId(req)]);
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  app.get("/users/:id", async (req, res, next) => {
    try {
      const result = await pool.query("SELECT * FROM users WHERE tenant_id=$1 AND id=$2", [tenantId(req), req.params.id]);
      if (!result.rowCount) {
        res.status(404).json({ error: "user_not_found" });
        return;
      }
      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.put("/users/:id", async (req, res, next) => {
    try {
      const input = userInput.partial().parse(req.body);
      const result = await pool.query(
        `UPDATE users SET
          name=COALESCE($3, name),
          phone=COALESCE($4, phone),
          tags=COALESCE($5, tags),
          credits=COALESCE($6, credits),
          updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [tenantId(req), req.params.id, input.name, input.phone, input.tags, input.credits]
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "user_not_found" });
        return;
      }
      await publishUserUpdated(result.rows[0]);
      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.post("/users/:id/credits/reserve", async (req, res, next) => {
    try {
      const amount = z.object({ amount: z.number().int().positive() }).parse(req.body).amount;
      const updated = await withTransaction(pool, async (client) => {
        const result = await client.query(
          "UPDATE users SET credits=credits-$3 WHERE tenant_id=$1 AND id=$2 AND credits >= $3 RETURNING *",
          [tenantId(req), req.params.id, amount]
        );
        if (!result.rowCount) throw new Error("insufficient_credits");
        return result.rows[0];
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("user_service_error", { error: error.message });
    res.status(error.message === "insufficient_credits" ? 409 : 400).json({ error: error.message });
  });

  app.listen(Number(process.env.PORT ?? 4001), () => logger.info("user_service_started"));
}

main().catch((error) => {
  logger.error("user_service_boot_failed", { error: error.message });
  process.exit(1);
});

