import { Elysia } from "elysia"
import html from "@elysiajs/html"
import { staticPlugin } from "@elysiajs/static"
import { dashboardRoutes } from "./routes/dashboard"
import { dynamodbRoutes } from "./routes/dynamodb"
import { cognitoRoutes } from "./routes/cognito"
import { secretsRoutes } from "./routes/secrets"
import { s3Routes } from "./routes/s3"
import { ssmRoutes } from "./routes/ssm"
import { sqsRoutes } from "./routes/sqs"

const port = Number(process.env.PORT ?? 3000)

const app = new Elysia()
  .use(html())
  .use(staticPlugin())
  .use(dashboardRoutes)
  .use(dynamodbRoutes)
  .use(s3Routes)
  .use(sqsRoutes)
  .use(ssmRoutes)
  .use(secretsRoutes)
  .use(cognitoRoutes)
  .listen(port)

console.log(
  `floci-ui listening on http://localhost:${app.server?.port ?? port}`,
)
