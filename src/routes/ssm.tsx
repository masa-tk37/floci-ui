import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import {
  decodeResourceName,
  encodeResourceName,
} from "../infrastructure/resource-name-codec"
import { loadSidebarSafe } from "../services/sidebar-service"
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
import { loadPageData, loadSidebarPage, runJsonAction } from "./route-utils"

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
      const { data: parameters, sidebarCounts } = await loadPageData(deps, () =>
        deps.listParameters(),
      )
      return (
        <ParameterList parameters={parameters} sidebarCounts={sidebarCounts} />
      )
    })
    .get("/new", async () => {
      const { sidebarCounts } = await loadSidebarPage(deps)
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
          sidebarCounts={sidebarCounts}
        />
      )
    })
    .post(
      "/",
      async ({ body, set }) =>
        runJsonAction(set, async () => {
          await deps.createParameter(body)
          return { id: encodeResourceName(body.name.trim()) }
        }),
      { body: createParameterSchema },
    )
    .get("/:id", async ({ params }) => {
      const { data: detail, sidebarCounts } = await loadPageData(deps, () =>
        deps.getParameterDetail(decodeResourceName(params.id)),
      )
      return <ParameterDetail detail={detail} sidebarCounts={sidebarCounts} />
    })
    .get("/:id/edit", async ({ params }) => {
      const { data: detail, sidebarCounts } = await loadPageData(deps, () =>
        deps.getParameterDetail(decodeResourceName(params.id)),
      )
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
          sidebarCounts={sidebarCounts}
        />
      )
    })
    .post(
      "/:id",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.updateParameter(decodeResourceName(params.id), body)
          return { id: params.id }
        }),
      { body: updateParameterSchema },
    )
    .delete("/:id", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteParameter(decodeResourceName(params.id))
      }),
    )
}

export const ssmRoutes = createSsmRoutes()
