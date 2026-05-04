import amqp, { Channel, ConsumeMessage } from "amqplib";
import { randomUUID } from "crypto";
import { z } from "zod";

export const DOMAIN_EXCHANGE = "mockingbird.domain";
export const COMMAND_EXCHANGE = "mockingbird.commands";

export const EventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  occurredAt: z.string(),
  tenantId: z.string(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  payload: z.record(z.unknown())
});

export type EventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  type: DomainEventType | CommandType;
  occurredAt: string;
  tenantId: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
};

export type DomainEventType =
  | "UserUpdated"
  | "FlowCreated"
  | "FlowUpdated"
  | "MessageScheduled"
  | "MessageSent"
  | "MessageFailed"
  | "CampaignStarted"
  | "CampaignPaused"
  | "CampaignCompleted"
  | "AnalyticsUpdated"
  | "FlowCompleted";

export type CommandType = "SendMessageCommand" | "StartFlowCommand" | "CompensateFlowCommand";

export interface UserUpdatedPayload {
  userId: string;
  phone: string;
  tags: string[];
}

export interface FlowCreatedPayload {
  flowId: string;
  name: string;
  version: number;
}

export interface MessageSentPayload {
  messageId: string;
  userId: string;
  flowId?: string;
  campaignId?: string;
  channel: "whatsapp" | "sms" | "email";
}

export interface MessageFailedPayload extends MessageSentPayload {
  reason: string;
}

export interface StartFlowCommandPayload {
  flowId: string;
  userId: string;
  campaignId?: string;
}

export interface SendMessageCommandPayload {
  userId: string;
  content: string;
  channel: "whatsapp" | "sms" | "email";
  flowId?: string;
  campaignId?: string;
}

export function createEnvelope<TPayload extends Record<string, unknown>>(
  type: DomainEventType | CommandType,
  tenantId: string,
  payload: TPayload,
  correlationId?: string
): EventEnvelope<TPayload> {
  return {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    tenantId,
    correlationId,
    payload
  };
}

export class EventBus {
  private connection?: {
    createChannel: () => Promise<Channel>;
    close: () => Promise<void>;
  };
  private channel?: Channel;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url) as unknown as EventBus["connection"];
    this.channel = await this.connection!.createChannel();
    await this.channel.assertExchange(DOMAIN_EXCHANGE, "topic", { durable: true });
    await this.channel.assertExchange(COMMAND_EXCHANGE, "topic", { durable: true });
  }

  async publish(event: EventEnvelope): Promise<void> {
    const channel = this.requireChannel();
    const exchange = event.type.endsWith("Command") ? COMMAND_EXCHANGE : DOMAIN_EXCHANGE;
    channel.publish(exchange, event.type, Buffer.from(JSON.stringify(event)), {
      contentType: "application/json",
      persistent: true,
      messageId: event.id,
      correlationId: event.correlationId
    });
  }

  async subscribe(
    queueName: string,
    bindingKeys: string[],
    handler: (event: EventEnvelope) => Promise<void>
  ): Promise<void> {
    const channel = this.requireChannel();
    const exchanges = [DOMAIN_EXCHANGE, COMMAND_EXCHANGE];
    const deadLetterExchange = `${queueName}.dlx`;
    await channel.assertExchange(deadLetterExchange, "fanout", { durable: true });
    await channel.assertQueue(`${queueName}.dead`, { durable: true });
    await channel.bindQueue(`${queueName}.dead`, deadLetterExchange, "");
    await channel.assertQueue(queueName, {
      durable: true,
      deadLetterExchange
    });
    await channel.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 10));
    for (const exchange of exchanges) {
      for (const bindingKey of bindingKeys) {
        await channel.bindQueue(queueName, exchange, bindingKey);
      }
    }
    await channel.consume(queueName, async (message: ConsumeMessage | null) => {
      if (!message) return;
      try {
        const parsed = EventEnvelopeSchema.parse(JSON.parse(message.content.toString()));
        await handler(parsed as EventEnvelope);
        channel.ack(message);
      } catch (error) {
        channel.nack(message, false, false);
      }
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private requireChannel(): Channel {
    if (!this.channel) {
      throw new Error("EventBus is not connected");
    }
    return this.channel;
  }
}
