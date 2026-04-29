import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import {
  decodeResourceName,
  encodeResourceName,
} from "../infrastructure/resource-name-codec"
import {
  type CreateSecretInput,
  createSecret,
  deleteSecret,
  getSecretDetail,
  listSecrets,
  type UpdateSecretInput,
  updateSecret,
} from "../services/secrets/secret-service"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { SecretDetail } from "../views/secrets/secret-detail"
import { SecretForm } from "../views/secrets/secret-form"
import { SecretList } from "../views/secrets/secret-list"
import { respondWithError } from "./route-utils"

export const secretsRoutes = new Elysia({ prefix: "/secrets" })
  .use(html())
  .get("/", async () => {
    const [secrets, sidebarData] = await Promise.all([
      listSecrets(),
      loadSidebarSafe(),
    ])

    return (
      <SecretList
        secrets={secrets}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .get("/new", async () => {
    const sidebarData = await loadSidebarSafe()
    return (
      <SecretForm
        init={{
          mode: "create",
          actionUrl: "/secrets",
          name: "",
          secretString: "",
          description: "",
          kmsKeyId: "",
          tags: [],
          isBinary: false,
        }}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const payload = body as CreateSecretInput
        await createSecret(payload)
        return { success: true, id: encodeResourceName(payload.name.trim()) }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
  .get("/:id", async ({ params }) => {
    const [detail, sidebarData] = await Promise.all([
      getSecretDetail(decodeResourceName(params.id)),
      loadSidebarSafe(),
    ])

    return (
      <SecretDetail
        detail={detail}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .get("/:id/edit", async ({ params }) => {
    const [detail, sidebarData] = await Promise.all([
      getSecretDetail(decodeResourceName(params.id)),
      loadSidebarSafe(),
    ])

    return (
      <SecretForm
        init={{
          mode: "edit",
          actionUrl: `/secrets/${params.id}`,
          name: detail.name,
          secretString: detail.secretString,
          description: detail.description,
          kmsKeyId: detail.kmsKeyId,
          tags: detail.tags,
          isBinary: detail.isBinary,
        }}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .post(
    "/:id",
    async ({ params, body, set }) => {
      try {
        await updateSecret(
          decodeResourceName(params.id),
          body as UpdateSecretInput,
        )
        return { success: true, id: params.id }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
  .delete("/:id", async ({ params, set }) => {
    try {
      await deleteSecret(decodeResourceName(params.id))
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
