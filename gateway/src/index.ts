import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

const services = {
  auth: process.env.AUTH_SERVICE_URL ?? "http://localhost:4000",
  users: process.env.USER_SERVICE_URL ?? "http://localhost:4001",
  flows: process.env.FLOW_SERVICE_URL ?? "http://localhost:4002",
  messaging: process.env.MESSAGING_SERVICE_URL ?? "http://localhost:4003",
  campaigns: process.env.CAMPAIGN_SERVICE_URL ?? "http://localhost:4004",
  analytics: process.env.ANALYTICS_SERVICE_URL ?? "http://localhost:4005"
};

type AuthenticatedRequest = Request & {
  user?: {
    sub: string;
    tenantId: string;
    roles: string[];
  };
};

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/healthz") || req.path.startsWith("/api/v1/auth")) {
    next();
    return;
  }

  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  try {
    req.user = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET ?? "dev_mockingbird_secret") as AuthenticatedRequest["user"];
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

async function proxyJson(req: AuthenticatedRequest, res: Response, targetBaseUrl: string, targetPath: string): Promise<void> {
  const response = await fetch(`${targetBaseUrl}${targetPath}`, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      "x-user-id": req.user?.sub ?? "anonymous",
      "x-tenant-id": req.user?.tenantId ?? "public",
      "x-roles": req.user?.roles?.join(",") ?? ""
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})
  });
  const body = await response.text();
  res.status(response.status).type(response.headers.get("content-type") ?? "application/json").send(body);
}

async function main(): Promise<void> {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 600 }));
  app.use(morgan("combined"));
  app.use(authenticate);

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.post("/api/v1/auth/login", (req, res) => proxyJson(req, res, services.auth, "/login"));

  app.post("/api/v1/flows", (req, res) => proxyJson(req, res, services.flows, "/flows"));
  app.get("/api/v1/flows/:id", (req, res) => proxyJson(req, res, services.flows, `/flows/${req.params.id}`));
  app.put("/api/v1/flows/:id", (req, res) => proxyJson(req, res, services.flows, `/flows/${req.params.id}`));

  app.get("/api/v1/analytics/:flowId", (req, res) => proxyJson(req, res, services.analytics, `/analytics/flows/${req.params.flowId}`));
  app.get("/api/web/dashboard/:flowId", async (req: AuthenticatedRequest, res) => {
    const [flow, analytics] = await Promise.all([
      fetch(`${services.flows}/flows/${req.params.flowId}`, { headers: { "x-tenant-id": req.user?.tenantId ?? "public" } }).then((r) => r.json()),
      fetch(`${services.analytics}/analytics/flows/${req.params.flowId}`, { headers: { "x-tenant-id": req.user?.tenantId ?? "public" } }).then((r) => r.json())
    ]);
    res.json({ flow, analytics });
  });

  app.use("/api/v1/users", (req, res) => proxyJson(req as AuthenticatedRequest, res, services.users, req.originalUrl.replace("/api/v1", "")));
  app.use("/api/v1/campaigns", (req, res) => proxyJson(req as AuthenticatedRequest, res, services.campaigns, req.originalUrl.replace("/api/v1", "")));
  app.use("/api/v1/messages", (req, res) => proxyJson(req as AuthenticatedRequest, res, services.messaging, req.originalUrl.replace("/api/v1/messages", "")));

  const gql = new ApolloServer({
    typeDefs: `#graphql
      type FlowMetrics { flowId: ID!, messagesSent: Int!, messagesFailed: Int!, conversions: Int!, successRate: Float! }
      type Query { flowMetrics(flowId: ID!): FlowMetrics! }
    `,
    resolvers: {
      Query: {
        flowMetrics: async (_parent, args: { flowId: string }, context: { tenantId: string }) => {
          const response = await fetch(`${services.analytics}/analytics/flows/${args.flowId}`, {
            headers: { "x-tenant-id": context.tenantId }
          });
          return response.json();
        }
      }
    }
  });
  await gql.start();
  app.use("/graphql", expressMiddleware(gql, {
    context: async ({ req }) => ({ tenantId: (req as AuthenticatedRequest).user?.tenantId ?? "public" })
  }));

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("gateway_error", { error: error.message, stack: error.stack });
    res.status(502).json({ error: "gateway_error" });
  });

  const port = Number(process.env.PORT ?? 8080);
  app.listen(port, () => logger.info("gateway_started", { port }));
}

main().catch((error) => {
  logger.error("gateway_boot_failed", { error: error.message });
  process.exit(1);
});

