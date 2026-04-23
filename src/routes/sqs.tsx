import { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import html from "@elysiajs/html"
import {
  listQueues,
  createQueue,
  deleteQueue,
  getQueueDetail,
  getQueueMessages,
  getQueueAttributes,
  getQueueSettings,
  updateQueueSettings,
  sendMessage,
  deleteMessage,
  purgeQueue,
} from "../services/sqs/queue-service"
import { ServiceError, httpStatusFor } from "../errors"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { QueueList } from "../views/sqs/queue-list"
import {
  QueueDetail,
  QueueMessagesTable,
  QueueAttributesCards,
} from "../views/sqs/queue-detail"
import { CreateQueueForm } from "../views/sqs/create-form"
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
  .get("/new", () => {
    return <CreateQueueForm />
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
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .delete("/:queue", async ({ params, set }) => {
    try {
      await deleteQueue(params.queue)
      return { success: true }
    } catch (e) {
      if (e instanceof ServiceError) {
        set.status = httpStatusFor(e.code)
        return { error: e.message }
      }
      set.status = 500
      return { error: "Internal server error" }
    }
  })
  .get("/:queue/settings", async ({ params }) => {
    const init = await getQueueSettings(params.queue)
    return <SQSSettingsForm init={init} />
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
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Any() },
  )
  .get("/:queue", async ({ params }) => {
    const [detail, sidebarData] = await Promise.all([
      getQueueDetail(params.queue),
      loadSidebarSafe(),
    ])
    return (
      <QueueDetail
        name={params.queue}
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
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
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
        if (e instanceof ServiceError) {
          set.status = httpStatusFor(e.code)
          return { error: e.message }
        }
        set.status = 500
        return { error: "Internal server error" }
      }
    },
    { body: t.Object({ receipt: t.String({ minLength: 1 }) }) },
  )
  .delete("/:queue/messages", async ({ params }) => {
    await purgeQueue(params.queue)
    return { success: true }
  })
