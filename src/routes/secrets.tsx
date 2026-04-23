import { Html } from "@elysiajs/html"
import html from "@elysiajs/html"
import { Elysia, t } from "elysia"
import { respondWithError } from "./route-utils"
import {
  decodeResourceName,
  encodeResourceName,
} from "../infrastructure/resource-name-codec"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import {
  createSecret,
  deleteSecret,
  getSecretDetail,
  listSecrets,
  updateSecret,
  type CreateSecretInput,
  type UpdateSecretInput,
} from "../services/secrets/secret-service"
import { SecretDetail } from "../views/secrets/secret-detail"
import { SecretForm } from "../views/secrets/secret-form"
import { SecretList } from "../views/secrets/secret-list"

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
  .get("/new", () => {
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
    const detail = await getSecretDetail(decodeResourceName(params.id))

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
