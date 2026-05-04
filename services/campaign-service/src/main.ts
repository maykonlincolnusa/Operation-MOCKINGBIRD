import { createPostgresPool, migrations } from "@mockingbird/database";
import { createEnvelope, EventBus, StartFlowCommandPayload } from "@mockingbird/events";
import express from "express";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import winston from "winston";
import { z } from "zod";

const logger = winston.createLogger({ format: winston.format.json(), transports: [new winston.transports.Console()] });
const pool = createPostgresPool(process.env.DATABASE_URL ?? "postgres://campaigns:campaigns@localhost:5432/campaigns");
const eventBus = new EventBus(process.env.RABBITMQ_URL ?? "amqp://mockingbird:mockingbird@localhost:5672");
const scheduled = new Map<string, cron.ScheduledTask>();

const campaignSchema = z.object({
  name: z.string().min(1),
  flowId: z.string(),
  segmentation: z.object({
    tag: z.string().optional(),
    userIds: z.array(z.string()).optional()
  }),
  schedule: z.string()
});

function tenantId(req: express.Request): string {
  return req.header("x-tenant-id") ?? "public";
}

async function startCampaign(campaign: any): Promise<void> {
  const base = process.env.USER_SERVICE_URL ?? "http://localhost:4001";
  const usersUrl = campaign.segmentation.tag ? `${base}/users?tag=${encodeURIComponent(campaign.segmentation.tag)}` : `${base}/users`;
  const users = await fetch(usersUrl, { headers: { "x-tenant-id": campaign.tenant_id } }).then((r) => r.json()) as Array<{ id: string }>;
  const userIds = campaign.segmentation.userIds?.length ? campaign.segmentation.userIds : users.map((user) => user.id);
  await pool.query("UPDATE campaigns SET status='running', updated_at=now() WHERE id=$1", [campaign.id]);
  await eventBus.publish(createEnvelope("CampaignStarted", campaign.tenant_id, { campaignId: campaign.id, flowId: campaign.flow_id }));
  for (const userId of userIds) {
    await eventBus.publish(createEnvelope<StartFlowCommandPayload & Record<string, unknown>>("StartFlowCommand", campaign.tenant_id, {
      flowId: campaign.flow_id,
      userId,
      campaignId: campaign.id
    }));
  }
}

async function main(): Promise<void> {
  await pool.query(migrations.campaigns);
  await eventBus.connect();

  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/metrics", (_req, res) => res.type("text/plain").send("campaign_service_up 1\n"));

  app.post("/campaigns", async (req, res, next) => {
    try {
      const input = campaignSchema.parse(req.body);
      const id = randomUUID();
      const result = await pool.query(
        "INSERT INTO campaigns (id, tenant_id, name, flow_id, segmentation, schedule, status) VALUES ($1,$2,$3,$4,$5,$6,'draft') RETURNING *",
        [id, tenantId(req), input.name, input.flowId, input.segmentation, input.schedule]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.get("/campaigns/:id", async (req, res, next) => {
    try {
      const result = await pool.query("SELECT * FROM campaigns WHERE tenant_id=$1 AND id=$2", [tenantId(req), req.params.id]);
      if (!result.rowCount) {
        res.status(404).json({ error: "campaign_not_found" });
        return;
      }
      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.post("/campaigns/:id/activate", async (req, res, next) => {
    try {
      const result = await pool.query("SELECT * FROM campaigns WHERE tenant_id=$1 AND id=$2", [tenantId(req), req.params.id]);
      if (!result.rowCount) {
        res.status(404).json({ error: "campaign_not_found" });
        return;
      }
      const campaign = result.rows[0];
      if (cron.validate(campaign.schedule)) {
        const task = cron.schedule(campaign.schedule, () => void startCampaign(campaign), { scheduled: true });
        scheduled.set(campaign.id, task);
        await pool.query("UPDATE campaigns SET status='scheduled', updated_at=now() WHERE id=$1", [campaign.id]);
      } else {
        await startCampaign(campaign);
      }
      res.status(202).json({ status: "activated" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/campaigns/:id/pause", async (req, res, next) => {
    try {
      scheduled.get(req.params.id)?.stop();
      await pool.query("UPDATE campaigns SET status='paused', updated_at=now() WHERE tenant_id=$1 AND id=$2", [tenantId(req), req.params.id]);
      await eventBus.publish(createEnvelope("CampaignPaused", tenantId(req), { campaignId: req.params.id }));
      res.json({ status: "paused" });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("campaign_service_error", { error: error.message });
    res.status(400).json({ error: error.message });
  });

  app.listen(Number(process.env.PORT ?? 4004), () => logger.info("campaign_service_started"));
}

main().catch((error) => {
  logger.error("campaign_service_boot_failed", { error: error.message });
  process.exit(1);
});

