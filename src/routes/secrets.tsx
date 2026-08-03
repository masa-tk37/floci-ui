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
import { SecretDetail } from "../views/secrets/secret-detail"
import { SecretForm } from "../views/secrets/secret-form"
import { SecretList } from "../views/secrets/secret-list"
import { runJsonAction } from "./route-utils"

const secretTagSchema = t.Object({
  key: t.String(),
  value: t.String(),
})

const createSecretSchema = t.Object({
  name: t.String({ minLength: 1 }),
  secretString: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  kmsKeyId: t.Optional(t.String()),
  tags: t.Optional(t.Array(secretTagSchema)),
})

const updateSecretSchema = t.Object({
  secretString: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  kmsKeyId: t.Optional(t.String()),
  tags: t.Optional(t.Array(secretTagSchema)),
})

export interface SecretsRouteDeps {
  createSecret: typeof createSecret
  deleteSecret: typeof deleteSecret
  getSecretDetail: typeof getSecretDetail
  listSecrets: typeof listSecrets
  updateSecret: typeof updateSecret
}

const defaultSecretsRouteDeps: SecretsRouteDeps = {
  createSecret,
  deleteSecret,
  getSecretDetail,
  listSecrets,
  updateSecret,
}

export function createSecretsRoutes(
  deps: SecretsRouteDeps = defaultSecretsRouteDeps,
) {
  return new Elysia({ prefix: "/secrets" })
    .use(html())
    .get("/", async () => {
      const secrets = await deps.listSecrets()
      return <SecretList secrets={secrets} />
    })
    .get("/new", () => (
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
    ))
    .post(
      "/",
      async ({ body, set }) =>
        runJsonAction(set, async () => {
          await deps.createSecret(body)
          return { id: encodeResourceName(body.name.trim()) }
        }),
      { body: createSecretSchema },
    )
    .get("/:id", async ({ params }) => {
      const detail = await deps.getSecretDetail(decodeResourceName(params.id))
      return <SecretDetail detail={detail} />
    })
    .get("/:id/edit", async ({ params }) => {
      const detail = await deps.getSecretDetail(decodeResourceName(params.id))
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
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.updateSecret(decodeResourceName(params.id), body)
          return { id: params.id }
        }),
      { body: updateSecretSchema },
    )
    .delete("/:id", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteSecret(decodeResourceName(params.id))
      }),
    )
}

export const secretsRoutes = createSecretsRoutes()
