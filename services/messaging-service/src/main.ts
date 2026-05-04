import { createPostgresPool, migrations } from "@mockingbird/database";
import { createEnvelope, EventBus, SendMessageCommandPayload } from "@mockingbird/events";
import express from "express";
import { randomUUID } from "node:crypto";
import winston from "winston";
import { z } from "zod";

const logger = winston.createLogger({ format: winston.format.json(), transports: [new winston.transports.Console()] });
const pool = createPostgresPool(process.env.DATABASE_URL ?? "postgres://messaging:messaging@localhost:5432/messaging");
const eventBus = new EventBus(process.env.RABBITMQ_URL ?? "amqp://mockingbird:mockingbird@localhost:5672");

const sendSchema = z.object({
  userId: z.string(),
  content: z.string().min(1),
  channel: z.enum(["whatsapp", "sms", "email"]),
  flowId: z.string().optional(),
  campaignId: z.string().optional()
});

async function sendViaProvider(input: z.infer<typeof sendSchema>): Promise<{ providerMessageId: string }> {
  if (input.content.toLowerCase().includes("fail")) {
    throw new Error("provider_rejected_message");
  }
  // TODO: Replace with WhatsApp Business API, Twilio, or channel-specific provider client.
  return { providerMessageId: `stub_${randomUUID()}` };
}

async function sendMessage(tenantId: string, input: z.infer<typeof sendSchema>): Promise<Record<string, unknown>> {
  const id = randomUUID();
  try {
    const provider = await sendViaProvider(input);
    const result = await pool.query(
      "INSERT INTO messages (id, tenant_id, user_id, flow_id, campaign_id, channel, content, status, provider_message_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [id, tenantId, input.userId, input.flowId, input.campaignId, input.channel, input.content, "sent", provider.providerMessageId]
    );
    await eventBus.publish(createEnvelope("MessageSent", tenantId, {
      messageId: id,
      userId: input.userId,
      flowId: input.flowId,
      campaignId: input.campaignId,
      channel: input.channel
    }));
    return result.rows[0];
  } catch (error) {
    await pool.query(
      "INSERT INTO messages (id, tenant_id, user_id, flow_id, campaign_id, channel, content, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, tenantId, input.userId, input.flowId, input.campaignId, input.channel, input.content, "failed", (error as Error).message]
    );
    await eventBus.publish(createEnvelope("MessageFailed", tenantId, {
      messageId: id,
      userId: input.userId,
      flowId: input.flowId,
      campaignId: input.campaignId,
      channel: input.channel,
      reason: (error as Error).message
    }));
    throw error;
  }
}

async function main(): Promise<void> {
  await pool.query(migrations.messages);
  await eventBus.connect();
  await eventBus.subscribe("messaging-service.commands", ["SendMessageCommand"], async (event) => {
    await sendMessage(event.tenantId, sendSchema.parse(event.payload as SendMessageCommandPayload));
  });

  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/metrics", (_req, res) => res.type("text/plain").send("messaging_service_up 1\n"));

  app.post("/send", async (req, res, next) => {
    try {
      const message = await sendMessage(req.header("x-tenant-id") ?? "public", sendSchema.parse(req.body));
      res.status(202).json(message);
    } catch (error) {
      next(error);
    }
  });

  app.post("/templates", async (req, res) => {
    const input = z.object({ name: z.string(), content: z.string() }).parse(req.body);
    res.status(201).json({ id: randomUUID(), ...input, status: "draft" });
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("messaging_service_error", { error: error.message });
    res.status(400).json({ error: error.message });
  });

  app.listen(Number(process.env.PORT ?? 4003), () => logger.info("messaging_service_started"));
}

main().catch((error) => {
  logger.error("messaging_service_boot_failed", { error: error.message });
  process.exit(1);
});

