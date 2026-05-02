import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import {
  decodeResourceName,
  encodeResourceName,
} from "../infrastructure/resource-name-codec"
import {
  createSecret,
  deleteSecret,
  getSecretDetail,
  listSecrets,
  updateSecret,
} from "../services/secrets/secret-service"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { SecretDetail } from "../views/secrets/secret-detail"
import { SecretForm } from "../views/secrets/secret-form"
import { SecretList } from "../views/secrets/secret-list"
import { jsonData, jsonOk, respondWithError } from "./route-utils"

const secretTagSchema = t.Object({
  key: t.String(),
  value: t.String(),
})

const createSecretSchema = t.Object({
  name: t.String({ minLength: 1 }),
  secretString: t.String(),
  description: t.Optional(t.String()),
  kmsKeyId: t.Optional(t.String()),
  tags: t.Optional(t.Array(secretTagSchema)),
})

const updateSecretSchema = t.Object({
  secretString: t.String(),
  description: t.Optional(t.String()),
  kmsKeyId: t.Optional(t.String()),
  tags: t.Optional(t.Array(secretTagSchema)),
})

export interface SecretsRouteDeps {
  createSecret: typeof createSecret
  deleteSecret: typeof deleteSecret
  getSecretDetail: typeof getSecretDetail
  listSecrets: typeof listSecrets
  loadSidebarSafe: typeof loadSidebarSafe
  updateSecret: typeof updateSecret
}

const defaultSecretsRouteDeps: SecretsRouteDeps = {
  createSecret,
  deleteSecret,
  getSecretDetail,
  listSecrets,
  loadSidebarSafe,
  updateSecret,
}

export function createSecretsRoutes(
  deps: SecretsRouteDeps = defaultSecretsRouteDeps,
) {
  return new Elysia({ prefix: "/secrets" })
    .use(html())
    .get("/", async () => {
      const [secrets, sidebarData] = await Promise.all([
        deps.listSecrets(),
        deps.loadSidebarSafe(),
      ])

      return (
        <SecretList
          secrets={secrets}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/new", async () => {
      const sidebarData = await deps.loadSidebarSafe()
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
          await deps.createSecret(body)
          return jsonData({ id: encodeResourceName(body.name.trim()) })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: createSecretSchema },
    )
    .get("/:id", async ({ params }) => {
      const [detail, sidebarData] = await Promise.all([
        deps.getSecretDetail(decodeResourceName(params.id)),
        deps.loadSidebarSafe(),
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
        deps.getSecretDetail(decodeResourceName(params.id)),
        deps.loadSidebarSafe(),
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
          await deps.updateSecret(decodeResourceName(params.id), body)
          return jsonData({ id: params.id })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: updateSecretSchema },
    )
    .delete("/:id", async ({ params, set }) => {
      try {
        await deps.deleteSecret(decodeResourceName(params.id))
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
}

export const secretsRoutes = createSecretsRoutes()
