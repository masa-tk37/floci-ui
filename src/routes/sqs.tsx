import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import {
  createQueue,
  deleteMessage,
  deleteQueue,
  getQueueAttributes,
  getQueueDetail,
  getQueueMessageBody,
  getQueueMessages,
  getQueueSettings,
  listQueues,
  purgeQueue,
  sendMessage,
  updateQueueSettings,
} from "../services/sqs/queue-service"
import { jsonData, jsonOk, respondWithError } from "./route-utils"
import { CreateQueueForm } from "../views/sqs/create-form"
import { QueueDetail } from "../views/sqs/queue-detail"
import { QueueList } from "../views/sqs/queue-list"
import { SQSSettingsForm } from "../views/sqs/settings-form"

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
  deleteQueue: typeof deleteQueue
  getQueueAttributes: typeof getQueueAttributes
  getQueueDetail: typeof getQueueDetail
  getQueueMessageBody: typeof getQueueMessageBody
  getQueueMessages: typeof getQueueMessages
  getQueueSettings: typeof getQueueSettings
  listQueues: typeof listQueues
  loadSidebarSafe: typeof loadSidebarSafe
  purgeQueue: typeof purgeQueue
  sendMessage: typeof sendMessage
  updateQueueSettings: typeof updateQueueSettings
}

const defaultSqsRouteDeps: SqsRouteDeps = {
  createQueue,
  deleteMessage,
  deleteQueue,
  getQueueAttributes,
  getQueueDetail,
  getQueueMessageBody,
  getQueueMessages,
  getQueueSettings,
  listQueues,
  loadSidebarSafe,
  purgeQueue,
  sendMessage,
  updateQueueSettings,
}

export function createSqsRoutes(deps: SqsRouteDeps = defaultSqsRouteDeps) {
  return new Elysia({ prefix: "/sqs" })
    .use(html())
    .get("/", async () => {
      const [queues, sidebarData] = await Promise.all([
        deps.listQueues(),
        deps.loadSidebarSafe(),
      ])
      return (
        <QueueList
          queues={queues}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/new", async () => {
      const sidebarData = await deps.loadSidebarSafe()
      return <CreateQueueForm sidebarCounts={toSidebarCounts(sidebarData)} />
    })
    .post(
      "/",
      async ({ body, set }) => {
        try {
          await deps.createQueue(body.name, body.attributes, body.tags)
          return jsonOk()
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: createQueueSchema },
    )
    .delete("/:queue", async ({ params, set }) => {
      try {
        await deps.deleteQueue(params.queue)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .get("/:queue/settings", async ({ params }) => {
      const [init, sidebarData] = await Promise.all([
        deps.getQueueSettings(params.queue),
        deps.loadSidebarSafe(),
      ])
      return (
        <SQSSettingsForm
          init={init}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/:queue/settings",
      async ({ params, body, set }) => {
        try {
          await deps.updateQueueSettings(
            params.queue,
            body.attributes ?? {},
            body.tags ?? {},
          )
          return jsonOk()
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: updateQueueSettingsSchema },
    )
    .get("/:queue", async ({ params }) => {
      const [detail, sidebarData, queues] = await Promise.all([
        deps.getQueueDetail(params.queue),
        deps.loadSidebarSafe(),
        deps.listQueues(),
      ])
      return (
        <QueueDetail
          name={params.queue}
          queues={queues}
          attributes={detail.attributes}
          messages={detail.messages}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/:queue/send",
      async ({ params, body, set }) => {
        try {
          const messageId = await deps.sendMessage(
            params.queue,
            body.body,
            body.groupId,
            body.messageDeduplicationId,
          )
          return jsonData({ messageId })
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      {
        body: t.Object({
          body: t.String({ minLength: 1 }),
          groupId: t.Optional(t.String()),
          messageDeduplicationId: t.Optional(t.String()),
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
      async ({ params, body, set }) => {
        try {
          await deps.deleteMessage(params.queue, body.receipt)
          return jsonOk()
        } catch (e) {
          return respondWithError(e, set)
        }
      },
      { body: t.Object({ receipt: t.String({ minLength: 1 }) }) },
    )
    .delete("/:queue/messages", async ({ params, set }) => {
      try {
        await deps.purgeQueue(params.queue)
        return jsonOk()
      } catch (e) {
        return respondWithError(e, set)
      }
    })
    .get("/:queue/messages/:messageId/body", async ({ params, set }) => {
      try {
        const body = await deps.getQueueMessageBody(
          params.queue,
          params.messageId,
        )
        return jsonData({ body })
      } catch (e) {
        return respondWithError(e, set)
      }
    })
}

export const sqsRoutes = createSqsRoutes()
