import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import {
  createQueue,
  deleteMessage,
  deleteMessageById,
  deleteQueue,
  getQueueAttributes,
  getQueueDetail,
  getQueueMessages,
  getQueueSettings,
  listQueues,
  purgeQueue,
  sendMessage,
  sendMessageBatch,
  updateQueueSettings,
} from "../services/sqs/queue-service"
import { CreateQueueForm } from "../views/sqs/create-form"
import { QueueDetail } from "../views/sqs/queue-detail"
import { QueueList } from "../views/sqs/queue-list"
import { SQSSettingsForm } from "../views/sqs/settings-form"
import { jsonData, runJsonAction } from "./route-utils"

const stringRecordSchema = t.Record(t.String(), t.String())

const createQueueSchema = t.Object({
  name: t.String({ minLength: 1 }),
  attributes: t.Optional(stringRecordSchema),
  tags: t.Optional(stringRecordSchema),
})

const updateQueueSettingsSchema = t.Object({
  attributes: t.Optional(stringRecordSchema),
  tags: t.Optional(stringRecordSchema),
})

export interface SqsRouteDeps {
  createQueue: typeof createQueue
  deleteMessage: typeof deleteMessage
  deleteMessageById: typeof deleteMessageById
  deleteQueue: typeof deleteQueue
  getQueueAttributes: typeof getQueueAttributes
  getQueueDetail: typeof getQueueDetail
  getQueueMessages: typeof getQueueMessages
  getQueueSettings: typeof getQueueSettings
  listQueues: typeof listQueues
  purgeQueue: typeof purgeQueue
  sendMessage: typeof sendMessage
  sendMessageBatch: typeof sendMessageBatch
  updateQueueSettings: typeof updateQueueSettings
}

const defaultSqsRouteDeps: SqsRouteDeps = {
  createQueue,
  deleteMessage,
  deleteMessageById,
  deleteQueue,
  getQueueAttributes,
  getQueueDetail,
  getQueueMessages,
  getQueueSettings,
  listQueues,
  purgeQueue,
  sendMessage,
  sendMessageBatch,
  updateQueueSettings,
}

export function createSqsRoutes(deps: SqsRouteDeps = defaultSqsRouteDeps) {
  return new Elysia({ prefix: "/sqs" })
    .use(html())
    .get("/", async () => {
      const queues = await deps.listQueues()
      return <QueueList queues={queues} />
    })
    .get("/new", () => <CreateQueueForm />)
    .post(
      "/",
      async ({ body, set }) =>
        runJsonAction(set, async () => {
          await deps.createQueue(body.name, body.attributes, body.tags)
        }),
      { body: createQueueSchema },
    )
    .delete("/:queue", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteQueue(params.queue)
      }),
    )
    .get("/:queue/settings", async ({ params }) => {
      const init = await deps.getQueueSettings(params.queue)
      return <SQSSettingsForm init={init} />
    })
    .post(
      "/:queue/settings",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.updateQueueSettings(
            params.queue,
            body.attributes ?? {},
            body.tags ?? {},
          )
        }),
      { body: updateQueueSettingsSchema },
    )
    .get("/:queue", async ({ params }) => {
      const [detail, queues] = await Promise.all([
        deps.getQueueDetail(params.queue),
        deps.listQueues(),
      ])
      return (
        <QueueDetail
          name={params.queue}
          queues={queues}
          attributes={detail.attributes}
          messages={detail.messages}
        />
      )
    })
    .post(
      "/:queue/send",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => ({
          messageId: await deps.sendMessage(
            params.queue,
            body.body,
            body.groupId,
            body.messageDeduplicationId,
          ),
        })),
      {
        body: t.Object({
          body: t.String({ minLength: 1 }),
          groupId: t.Optional(t.String()),
          messageDeduplicationId: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/:queue/send-batch",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => ({
          result: await deps.sendMessageBatch(
            params.queue,
            body.entries.map((e, i) => ({
              id: e.id ?? `msg-${i}`,
              body: e.body,
              messageGroupId: e.groupId,
              messageDeduplicationId: e.messageDeduplicationId,
            })),
          ),
        })),
      {
        body: t.Object({
          entries: t.Array(
            t.Object({
              id: t.Optional(t.String()),
              body: t.String({ minLength: 1 }),
              groupId: t.Optional(t.String()),
              messageDeduplicationId: t.Optional(t.String()),
            }),
            { minItems: 1, maxItems: 10 },
          ),
        }),
      },
    )
    .get("/:queue/messages.json", async ({ params }) => {
      const messages = await deps.getQueueMessages(params.queue)
      return jsonData({ messages })
    })
    .get("/:queue/attributes.json", async ({ params }) => {
      const attributes = await deps.getQueueAttributes(params.queue)
      return jsonData({ attributes })
    })
    .delete(
      "/:queue/message",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.deleteMessageById(params.queue, body.messageId)
        }),
      { body: t.Object({ messageId: t.String({ minLength: 1 }) }) },
    )
    .delete("/:queue/messages", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.purgeQueue(params.queue)
      }),
    )
}

export const sqsRoutes = createSqsRoutes()
