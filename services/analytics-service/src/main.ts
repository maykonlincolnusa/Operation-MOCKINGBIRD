import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { createPostgresPool, migrations } from "@mockingbird/database";
import { createEnvelope, EventBus } from "@mockingbird/events";
import express, { Request } from "express";
import winston from "winston";

const logger = winston.createLogger({ format: winston.format.json(), transports: [new winston.transports.Console()] });
const pool = createPostgresPool(process.env.DATABASE_URL ?? "postgres://analytics:analytics@localhost:5432/analytics");
const eventBus = new EventBus(process.env.RABBITMQ_URL ?? "amqp://mockingbird:mockingbird@localhost:5672");

async function getFlowMetrics(tenantId: string, flowId: string) {
  const result = await pool.query("SELECT * FROM flow_metrics WHERE tenant_id=$1 AND flow_id=$2", [tenantId, flowId]);
  const row = result.rows[0] ?? { flow_id: flowId, messages_sent: 0, messages_failed: 0, conversions: 0 };
  const total = Number(row.messages_sent) + Number(row.messages_failed);
  return {
    flowId: row.flow_id,
    messagesSent: Number(row.messages_sent),
    messagesFailed: Number(row.messages_failed),
    conversions: Number(row.conversions),
    successRate: total === 0 ? 0 : Number(row.messages_sent) / total
  };
}

async function main(): Promise<void> {
  await pool.query(migrations.analytics);
  await pool.query(migrations.eventInbox);
  await eventBus.connect();
  await eventBus.subscribe("analytics-service.events", ["MessageSent", "MessageFailed", "FlowCompleted"], async (event) => {
    const inbox = await pool.query("INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING", [event.id]);
    if (!inbox.rowCount) return;
    const flowId = String(event.payload.flowId ?? "unknown");
    const campaignId = event.payload.campaignId ? String(event.payload.campaignId) : undefined;
    if (event.type === "MessageSent") {
      await pool.query(
        `INSERT INTO flow_metrics (tenant_id, flow_id, messages_sent) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, flow_id) DO UPDATE SET messages_sent=flow_metrics.messages_sent+1, updated_at=now()`,
        [event.tenantId, flowId]
      );
    }
    if (event.type === "MessageFailed") {
      await pool.query(
        `INSERT INTO flow_metrics (tenant_id, flow_id, messages_failed) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, flow_id) DO UPDATE SET messages_failed=flow_metrics.messages_failed+1, updated_at=now()`,
        [event.tenantId, flowId]
      );
    }
    if (campaignId) {
      const column = event.type === "MessageSent" ? "messages_sent" : "messages_failed";
      await pool.query(
        `INSERT INTO campaign_metrics (tenant_id, campaign_id, ${column}) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, campaign_id) DO UPDATE SET ${column}=campaign_metrics.${column}+1, updated_at=now()`,
        [event.tenantId, campaignId]
      );
    }
    await eventBus.publish(createEnvelope("AnalyticsUpdated", event.tenantId, { flowId, campaignId }));
  });

  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/metrics", (_req, res) => res.type("text/plain").send("analytics_service_up 1\n"));
  app.get("/analytics/flows/:flowId", async (req, res, next) => {
    try {
      res.json(await getFlowMetrics(req.header("x-tenant-id") ?? "public", req.params.flowId));
    } catch (error) {
      next(error);
    }
  });
  app.get("/analytics/campaigns/:campaignId", async (req, res, next) => {
    try {
      const result = await pool.query("SELECT * FROM campaign_metrics WHERE tenant_id=$1 AND campaign_id=$2", [req.header("x-tenant-id") ?? "public", req.params.campaignId]);
      res.json(result.rows[0] ?? { campaignId: req.params.campaignId, messages_sent: 0, messages_failed: 0 });
    } catch (error) {
      next(error);
    }
  });

  const gql = new ApolloServer({
    typeDefs: `#graphql
      type FlowMetrics { flowId: ID!, messagesSent: Int!, messagesFailed: Int!, conversions: Int!, successRate: Float! }
      type Query { flowMetrics(flowId: ID!): FlowMetrics! }
    `,
    resolvers: { Query: { flowMetrics: (_: unknown, args: { flowId: string }, ctx: { tenantId: string }) => getFlowMetrics(ctx.tenantId, args.flowId) } }
  });
  await gql.start();
  app.use("/graphql", expressMiddleware(gql, { context: async ({ req }: { req: Request }) => ({ tenantId: req.header("x-tenant-id") ?? "public" }) }));

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("analytics_service_error", { error: error.message });
    res.status(400).json({ error: error.message });
  });

  app.listen(Number(process.env.PORT ?? 4005), () => logger.info("analytics_service_started"));
}

main().catch((error) => {
  logger.error("analytics_service_boot_failed", { error: error.message });
  process.exit(1);
});
