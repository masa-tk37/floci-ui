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
import { respondWithError } from "./route-utils"
import { CreateQueueForm } from "../views/sqs/create-form"
import {
  QueueAttributesCards,
  QueueDetail,
  QueueMessagesTable,
} from "../views/sqs/queue-detail"
import { QueueList } from "../views/sqs/queue-list"
import { SQSSettingsForm } from "../views/sqs/settings-form"

export const sqsRoutes = new Elysia({ prefix: "/sqs" })
  .use(html())
  .get("/", async () => {
    const [queues, sidebarData] = await Promise.all([
      listQueues(),
      loadSidebarSafe(),
    ])
    return (
      <QueueList queues={queues} sidebarCounts={toSidebarCounts(sidebarData)} />
    )
  })
  .get("/new", async () => {
    const sidebarData = await loadSidebarSafe()
    return <CreateQueueForm sidebarCounts={toSidebarCounts(sidebarData)} />
  })
  .post(
    "/",
    async ({ body, set }) => {
      const b = body as {
        name: string
        attributes?: Record<string, string>
        tags?: Record<string, string>
      }
      try {
        await createQueue(b.name, b.attributes, b.tags)
        return { success: true }
      } catch (e) {
        return respondWithError(e, set)
      }
    },
    { body: t.Any() },
  )
  .delete("/:queue", async ({ params, set }) => {
    try {
      await deleteQueue(params.queue)
      return { success: true }
    } catch (e) {
      return respondWithError(e, set)
    }
  })
  .get("/:queue/settings", async ({ params }) => {
    const [init, sidebarData] = await Promise.all([
      getQueueSettings(params.queue),
      loadSidebarSafe(),
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
      const b = body as {
        attributes?: Record<string, string>
        tags?: Record<string, string>
      }
      try {
        await updateQueueSettings(
          params.queue,
          b.attributes ?? {},
          b.tags ?? {},
        )
        return { success: true }
      } catch (e) {
        return respondWithError(e, set)
      }
    },
    { body: t.Any() },
  )
  .get("/:queue", async ({ params }) => {
    const [detail, sidebarData, queues] = await Promise.all([
      getQueueDetail(params.queue),
      loadSidebarSafe(),
      listQueues(),
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
        const messageId = await sendMessage(
          params.queue,
          body.body,
          body.groupId,
          body.messageDeduplicationId,
        )
        return { messageId }
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
  .get("/:queue/messages-fragment", async ({ params }) => {
    const messages = await getQueueMessages(params.queue)
    return <QueueMessagesTable messages={messages} />
  })
  .get("/:queue/attributes-fragment", async ({ params }) => {
    const attributes = await getQueueAttributes(params.queue)
    return <QueueAttributesCards attributes={attributes} />
  })
  .delete(
    "/:queue/message",
    async ({ params, body, set }) => {
      try {
        await deleteMessage(params.queue, body.receipt)
        return { success: true }
      } catch (e) {
        return respondWithError(e, set)
      }
    },
    { body: t.Object({ receipt: t.String({ minLength: 1 }) }) },
  )
  .delete("/:queue/messages", async ({ params, set }) => {
    try {
      await purgeQueue(params.queue)
      return { success: true }
    } catch (e) {
      return respondWithError(e, set)
    }
  })
  .get("/:queue/messages/:messageId/body", async ({ params, set }) => {
    try {
      const body = await getQueueMessageBody(params.queue, params.messageId)
      return { body }
    } catch (e) {
      return respondWithError(e, set)
    }
  })
