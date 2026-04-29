import html from "@elysiajs/html"
import { staticPlugin } from "@elysiajs/static"
import { Elysia } from "elysia"
import { cognitoRoutes } from "./routes/cognito"
import { dashboardRoutes } from "./routes/dashboard"
import { dynamodbRoutes } from "./routes/dynamodb"
import { s3Routes } from "./routes/s3"
import { secretsRoutes } from "./routes/secrets"
import { sqsRoutes } from "./routes/sqs"
import { ssmRoutes } from "./routes/ssm"

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
