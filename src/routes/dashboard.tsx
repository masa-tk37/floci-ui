import html, { Html } from "@elysiajs/html"
import { Elysia } from "elysia"
import { FLOCI_ENDPOINT } from "../infrastructure/floci-clients"
import { loadDashboardData } from "../services/dashboard-service"
import { Dashboard } from "../views/dashboard"

export interface DashboardRouteDeps {
  endpoint: string
  loadDashboardData: typeof loadDashboardData
}

const defaultDashboardRouteDeps: DashboardRouteDeps = {
  endpoint: FLOCI_ENDPOINT,
  loadDashboardData,
}

export function createDashboardRoutes(
  deps: DashboardRouteDeps = defaultDashboardRouteDeps,
) {
  return new Elysia().use(html()).get("/", async () => {
    const data = await deps.loadDashboardData()
    return (
      <Dashboard
        dynamodb={data.dynamodb}
        s3={data.s3}
        sqs={data.sqs}
        ssm={data.ssm}
        secrets={data.secrets}
        cognito={data.cognito}
        endpoint={deps.endpoint}
        sidebarCounts={data.sidebarCounts}
      />
    )
  })
}

export const dashboardRoutes = createDashboardRoutes()
