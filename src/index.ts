import html from "@elysiajs/html"
import { staticPlugin } from "@elysiajs/static"
import { createApp } from "./app"

const port = Number(process.env.PORT ?? 3000)

const app = createApp().use(html()).use(staticPlugin()).listen(port)

console.log(
  `floci-ui listening on http://localhost:${app.server?.port ?? port}`,
)
