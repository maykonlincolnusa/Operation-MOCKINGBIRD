import { connectMongo } from "@mockingbird/database";
import { createEnvelope, EventBus, SendMessageCommandPayload, StartFlowCommandPayload } from "@mockingbird/events";
import express from "express";
import { randomUUID } from "node:crypto";
import winston from "winston";
import { z } from "zod";

const logger = winston.createLogger({ format: winston.format.json(), transports: [new winston.transports.Console()] });
const eventBus = new EventBus(process.env.RABBITMQ_URL ?? "amqp://mockingbird:mockingbird@localhost:5672");

const flowSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(z.record(z.unknown())).default([]),
  edges: z.array(z.record(z.unknown())).default([]),
  featureFlag: z.string().optional()
});

function tenantId(req: express.Request): string {
  return req.header("x-tenant-id") ?? "public";
}

async function main(): Promise<void> {
  const mongo = await connectMongo(process.env.MONGO_URL ?? "mongodb://localhost:27017/flows");
  const db = mongo.db();
  const flows = db.collection("flows");
  const executions = db.collection("flow_executions");
  await flows.createIndex({ tenantId: 1, id: 1 }, { unique: true });
  await executions.createIndex({ tenantId: 1, executionId: 1 }, { unique: true });
  await eventBus.connect();

  await eventBus.subscribe("flow-service.commands", ["StartFlowCommand", "MessageFailed"], async (event) => {
    if (event.type === "StartFlowCommand") {
      const command = event.payload as StartFlowCommandPayload;
      const flow = await flows.findOne({ tenantId: event.tenantId, id: command.flowId });
      if (!flow) return;
      const firstNode = Array.isArray(flow.nodes) ? flow.nodes[0] : undefined;
      const executionId = randomUUID();
      await executions.insertOne({ executionId, tenantId: event.tenantId, status: "running", command, createdAt: new Date() });
      await eventBus.publish(createEnvelope<SendMessageCommandPayload & Record<string, unknown>>("SendMessageCommand", event.tenantId, {
        userId: command.userId,
        content: String(firstNode?.content ?? `Flow ${flow.name} started`),
        channel: "whatsapp",
        flowId: command.flowId,
        campaignId: command.campaignId
      }, event.correlationId ?? event.id));
    }
    if (event.type === "MessageFailed") {
      await eventBus.publish(createEnvelope("CompensateFlowCommand", event.tenantId, { failedMessage: event.payload }, event.correlationId ?? event.id));
    }
  });

  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/metrics", (_req, res) => res.type("text/plain").send("flow_service_up 1\n"));

  /**
   * @openapi
   * /flows:
   *   post:
   *     summary: Create a conversation flow graph.
   */
  app.post("/flows", async (req, res, next) => {
    try {
      const input = flowSchema.parse(req.body);
      const flow = { id: randomUUID(), tenantId: tenantId(req), version: 1, ...input, createdAt: new Date(), updatedAt: new Date() };
      await flows.insertOne(flow);
      await eventBus.publish(createEnvelope("FlowCreated", flow.tenantId, { flowId: flow.id, name: flow.name, version: flow.version }));
      res.status(201).json(flow);
    } catch (error) {
      next(error);
    }
  });

  app.get("/flows/:id", async (req, res, next) => {
    try {
      const flow = await flows.findOne({ tenantId: tenantId(req), id: req.params.id }, { projection: { _id: 0 } });
      if (!flow) {
        res.status(404).json({ error: "flow_not_found" });
        return;
      }
      res.json(flow);
    } catch (error) {
      next(error);
    }
  });

  app.put("/flows/:id", async (req, res, next) => {
    try {
      const input = flowSchema.partial().parse(req.body);
      const result = await flows.findOneAndUpdate(
        { tenantId: tenantId(req), id: req.params.id },
        { $set: { ...input, updatedAt: new Date() }, $inc: { version: 1 } },
        { returnDocument: "after", projection: { _id: 0 } }
      );
      if (!result) {
        res.status(404).json({ error: "flow_not_found" });
        return;
      }
      await eventBus.publish(createEnvelope("FlowUpdated", tenantId(req), { flowId: req.params.id, version: result.version }));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/flows/:id/execute", async (req, res, next) => {
    try {
      const body = z.object({ userId: z.string(), campaignId: z.string().optional() }).parse(req.body);
      await eventBus.publish(createEnvelope<StartFlowCommandPayload & Record<string, unknown>>("StartFlowCommand", tenantId(req), {
        flowId: req.params.id,
        userId: body.userId,
        campaignId: body.campaignId
      }));
      res.status(202).json({ status: "scheduled" });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("flow_service_error", { error: error.message });
    res.status(400).json({ error: error.message });
  });

  app.listen(Number(process.env.PORT ?? 4002), () => logger.info("flow_service_started"));
}

main().catch((error) => {
  logger.error("flow_service_boot_failed", { error: error.message });
  process.exit(1);
});

