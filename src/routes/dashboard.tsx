import html, { Html } from "@elysiajs/html"
import { Elysia } from "elysia"
import { FLOCI_ENDPOINT } from "../infrastructure/floci-clients"
import { loadDashboardData } from "../services/dashboard-service"
import { Dashboard } from "../views/dashboard"

export const dashboardRoutes = new Elysia().use(html()).get("/", async () => {
  const data = await loadDashboardData()
  return (
    <Dashboard
      dynamodb={data.dynamodb}
      s3={data.s3}
      sqs={data.sqs}
      ssm={data.ssm}
      secrets={data.secrets}
      cognito={data.cognito}
      endpoint={FLOCI_ENDPOINT}
      sidebarCounts={data.sidebarCounts}
    />
  )
})
