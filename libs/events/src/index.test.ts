import { describe, expect, it } from "vitest";
import { createEnvelope } from "./index";

describe("createEnvelope", () => {
  it("wraps payloads with required metadata", () => {
    const event = createEnvelope("FlowCreated", "tenant-a", { flowId: "f1", name: "Lead", version: 1 });

    expect(event.type).toBe("FlowCreated");
    expect(event.tenantId).toBe("tenant-a");
    expect(event.payload.flowId).toBe("f1");
    expect(event.id).toHaveLength(36);
  });
});

