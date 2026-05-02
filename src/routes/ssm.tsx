import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import {
  decodeResourceName,
  encodeResourceName,
} from "../infrastructure/resource-name-codec"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import {
  createParameter,
  deleteParameter,
  getParameterDetail,
  listParameters,
  updateParameter,
} from "../services/ssm/parameter-service"
import { ParameterDetail } from "../views/ssm/parameter-detail"
import { ParameterForm } from "../views/ssm/parameter-form"
import { ParameterList } from "../views/ssm/parameter-list"
import { jsonData, jsonOk, respondWithError } from "./route-utils"

const parameterTagSchema = t.Object({
  key: t.String(),
  value: t.String(),
})

const parameterTypeSchema = t.Union([
  t.Literal("String"),
  t.Literal("StringList"),
  t.Literal("SecureString"),
])

const parameterTierSchema = t.Union([
  t.Literal("Standard"),
  t.Literal("Advanced"),
  t.Literal("Intelligent-Tiering"),
])

const createParameterSchema = t.Object({
  name: t.String({ minLength: 1 }),
  type: parameterTypeSchema,
  value: t.String(),
  description: t.Optional(t.String()),
  tier: t.Optional(parameterTierSchema),
  keyId: t.Optional(t.String()),
  tags: t.Optional(t.Array(parameterTagSchema)),
})

const updateParameterSchema = t.Object({
  type: parameterTypeSchema,
  value: t.String(),
  description: t.Optional(t.String()),
  tier: t.Optional(parameterTierSchema),
  keyId: t.Optional(t.String()),
  tags: t.Optional(t.Array(parameterTagSchema)),
})

export interface SsmRouteDeps {
  createParameter: typeof createParameter
  deleteParameter: typeof deleteParameter
  getParameterDetail: typeof getParameterDetail
  listParameters: typeof listParameters
  loadSidebarSafe: typeof loadSidebarSafe
  updateParameter: typeof updateParameter
}

const defaultSsmRouteDeps: SsmRouteDeps = {
  createParameter,
  deleteParameter,
  getParameterDetail,
  listParameters,
  loadSidebarSafe,
  updateParameter,
}

export function createSsmRoutes(deps: SsmRouteDeps = defaultSsmRouteDeps) {
  return new Elysia({ prefix: "/ssm" })
    .use(html())
    .get("/", async () => {
      const [parameters, sidebarData] = await Promise.all([
        deps.listParameters(),
        deps.loadSidebarSafe(),
      ])

      return (
        <ParameterList
          parameters={parameters}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/new", async () => {
      const sidebarData = await deps.loadSidebarSafe()
      return (
        <ParameterForm
          init={{
            mode: "create",
            actionUrl: "/ssm",
            name: "",
            type: "String",
            value: "",
            description: "",
            tier: "Standard",
            keyId: "",
            tags: [],
          }}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/",
      async ({ body, set }) => {
        try {
          await deps.createParameter(body)
          return jsonData({ id: encodeResourceName(body.name.trim()) })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: createParameterSchema },
    )
    .get("/:id", async ({ params }) => {
      const [detail, sidebarData] = await Promise.all([
        deps.getParameterDetail(decodeResourceName(params.id)),
        deps.loadSidebarSafe(),
      ])

      return (
        <ParameterDetail
          detail={detail}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/:id/edit", async ({ params }) => {
      const [detail, sidebarData] = await Promise.all([
        deps.getParameterDetail(decodeResourceName(params.id)),
        deps.loadSidebarSafe(),
      ])

      return (
        <ParameterForm
          init={{
            mode: "edit",
            actionUrl: `/ssm/${params.id}`,
            name: detail.name,
            type: detail.type,
            value: detail.value,
            description: detail.description,
            tier: detail.tier,
            keyId: detail.keyId,
            tags: detail.tags,
          }}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/:id",
      async ({ params, body, set }) => {
        try {
          await deps.updateParameter(decodeResourceName(params.id), body)
          return jsonData({ id: params.id })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: updateParameterSchema },
    )
    .delete("/:id", async ({ params, set }) => {
      try {
        await deps.deleteParameter(decodeResourceName(params.id))
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
}

export const ssmRoutes = createSsmRoutes()
