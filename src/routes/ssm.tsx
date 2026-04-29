import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import {
  decodeResourceName,
  encodeResourceName,
} from "../infrastructure/resource-name-codec"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import {
  type CreateParameterInput,
  createParameter,
  deleteParameter,
  getParameterDetail,
  listParameters,
  type UpdateParameterInput,
  updateParameter,
} from "../services/ssm/parameter-service"
import { ParameterDetail } from "../views/ssm/parameter-detail"
import { ParameterForm } from "../views/ssm/parameter-form"
import { ParameterList } from "../views/ssm/parameter-list"
import { respondWithError } from "./route-utils"

export const ssmRoutes = new Elysia({ prefix: "/ssm" })
  .use(html())
  .get("/", async () => {
    const [parameters, sidebarData] = await Promise.all([
      listParameters(),
      loadSidebarSafe(),
    ])

    return (
      <ParameterList
        parameters={parameters}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .get("/new", () => {
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
      />
    )
  })
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const payload = body as CreateParameterInput
        await createParameter(payload)
        return { success: true, id: encodeResourceName(payload.name.trim()) }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
  .get("/:id", async ({ params }) => {
    const [detail, sidebarData] = await Promise.all([
      getParameterDetail(decodeResourceName(params.id)),
      loadSidebarSafe(),
    ])

    return (
      <ParameterDetail
        detail={detail}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .get("/:id/edit", async ({ params }) => {
    const detail = await getParameterDetail(decodeResourceName(params.id))

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
      />
    )
  })
  .post(
    "/:id",
    async ({ params, body, set }) => {
      try {
        await updateParameter(
          decodeResourceName(params.id),
          body as UpdateParameterInput,
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
      await deleteParameter(decodeResourceName(params.id))
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
