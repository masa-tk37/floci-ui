import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import { decodeResourceName } from "../infrastructure/resource-name-codec"
import {
  confirmUserSignUp,
  createUser,
  createUserPool,
  createUserPoolClient,
  deleteUser,
  deleteUserPool,
  deleteUserPoolClient,
  disableUser,
  enableUser,
  getUserDetail,
  getUserPoolDetail,
  listUserPoolClients,
  listUserPools,
  listUsers,
  type SetUserPasswordInput,
  setUserPassword,
} from "../services/cognito/cognito-service"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { UserPoolDetail } from "../views/cognito/pool-detail"
import { UserPoolForm } from "../views/cognito/pool-form"
import { UserPoolList } from "../views/cognito/pool-list"
import { CognitoUserDetail } from "../views/cognito/user-detail"
import { jsonData, jsonOk, respondWithError } from "./route-utils"

const cognitoVerifiedAttributeSchema = t.Union([
  t.Literal("email"),
  t.Literal("phone_number"),
])

const createUserPoolSchema = t.Object({
  name: t.String({ minLength: 1 }),
  usernameMode: t.Union([
    t.Literal("username"),
    t.Literal("email"),
    t.Literal("phone_number"),
  ]),
  autoVerifiedAttributes: t.Optional(t.Array(cognitoVerifiedAttributeSchema)),
  mfaConfiguration: t.Optional(
    t.Union([t.Literal("OFF"), t.Literal("OPTIONAL"), t.Literal("ON")]),
  ),
})

const createAppClientSchema = t.Object({
  name: t.String({ minLength: 1 }),
})

const createUserSchema = t.Object({
  username: t.String({ minLength: 1 }),
  temporaryPassword: t.String({ minLength: 1 }),
  email: t.Optional(t.String()),
  phoneNumber: t.Optional(t.String()),
})

const setPasswordSchema = t.Object({
  password: t.String({ minLength: 1 }),
  permanent: t.Boolean(),
})

export interface CognitoRouteDeps {
  confirmUserSignUp: typeof confirmUserSignUp
  createUser: typeof createUser
  createUserPool: typeof createUserPool
  createUserPoolClient: typeof createUserPoolClient
  deleteUser: typeof deleteUser
  deleteUserPool: typeof deleteUserPool
  deleteUserPoolClient: typeof deleteUserPoolClient
  disableUser: typeof disableUser
  enableUser: typeof enableUser
  getUserDetail: typeof getUserDetail
  getUserPoolDetail: typeof getUserPoolDetail
  listUserPoolClients: typeof listUserPoolClients
  listUserPools: typeof listUserPools
  listUsers: typeof listUsers
  loadSidebarSafe: typeof loadSidebarSafe
  setUserPassword: typeof setUserPassword
}

const defaultCognitoRouteDeps: CognitoRouteDeps = {
  confirmUserSignUp,
  createUser,
  createUserPool,
  createUserPoolClient,
  deleteUser,
  deleteUserPool,
  deleteUserPoolClient,
  disableUser,
  enableUser,
  getUserDetail,
  getUserPoolDetail,
  listUserPoolClients,
  listUserPools,
  listUsers,
  loadSidebarSafe,
  setUserPassword,
}

export function createCognitoRoutes(
  deps: CognitoRouteDeps = defaultCognitoRouteDeps,
) {
  return new Elysia({ prefix: "/cognito" })
    .use(html())
    .get("/", async () => {
      const [userPools, sidebarData] = await Promise.all([
        deps.listUserPools(),
        deps.loadSidebarSafe(),
      ])

      return (
        <UserPoolList
          userPools={userPools}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .get("/new", async () => {
      const sidebarData = await deps.loadSidebarSafe()
      return (
        <UserPoolForm
          init={{
            actionUrl: "/cognito",
            name: "",
            usernameMode: "username",
            autoVerifiedAttributes: [],
            mfaConfiguration: "OFF",
          }}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .post(
      "/",
      async ({ body, set }) => {
        try {
          const id = await deps.createUserPool(body)
          return jsonData({ id })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: createUserPoolSchema },
    )
    .get("/:poolId", async ({ params }) => {
      const [pool, appClients, users, sidebarData] = await Promise.all([
        deps.getUserPoolDetail(params.poolId),
        deps.listUserPoolClients(params.poolId),
        deps.listUsers(params.poolId),
        deps.loadSidebarSafe(),
      ])

      return (
        <UserPoolDetail
          pool={pool}
          appClients={appClients}
          users={users}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .delete("/:poolId", async ({ params, set }) => {
      try {
        await deps.deleteUserPool(params.poolId)
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
    .post(
      "/:poolId/clients",
      async ({ params, body, set }) => {
        try {
          const clientId = await deps.createUserPoolClient(params.poolId, body)
          return jsonData({ clientId })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: createAppClientSchema },
    )
    .delete("/:poolId/clients/:clientId", async ({ params, set }) => {
      try {
        await deps.deleteUserPoolClient(params.poolId, params.clientId)
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
    .post(
      "/:poolId/users",
      async ({ params, body, set }) => {
        try {
          const username = await deps.createUser(params.poolId, body)
          return jsonData({ username })
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: createUserSchema },
    )
    .get("/:poolId/users/:username", async ({ params }) => {
      const username = decodeResourceName(params.username)
      const [user, pool, sidebarData] = await Promise.all([
        deps.getUserDetail(params.poolId, username),
        deps.getUserPoolDetail(params.poolId),
        deps.loadSidebarSafe(),
      ])

      return (
        <CognitoUserDetail
          poolId={params.poolId}
          poolName={pool.name}
          detail={user}
          sidebarCounts={toSidebarCounts(sidebarData)}
        />
      )
    })
    .delete("/:poolId/users/:username", async ({ params, set }) => {
      try {
        await deps.deleteUser(
          params.poolId,
          decodeResourceName(params.username),
        )
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
    .post("/:poolId/users/:username/enable", async ({ params, set }) => {
      try {
        await deps.enableUser(
          params.poolId,
          decodeResourceName(params.username),
        )
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
    .post("/:poolId/users/:username/disable", async ({ params, set }) => {
      try {
        await deps.disableUser(
          params.poolId,
          decodeResourceName(params.username),
        )
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
    .post("/:poolId/users/:username/confirm", async ({ params, set }) => {
      try {
        await deps.confirmUserSignUp(
          params.poolId,
          decodeResourceName(params.username),
        )
        return jsonOk()
      } catch (error) {
        return respondWithError(error, set)
      }
    })
    .post(
      "/:poolId/users/:username/password",
      async ({ params, body, set }) => {
        try {
          await deps.setUserPassword(
            params.poolId,
            decodeResourceName(params.username),
            body,
          )
          return jsonOk()
        } catch (error) {
          return respondWithError(error, set)
        }
      },
      { body: setPasswordSchema },
    )
}

export const cognitoRoutes = createCognitoRoutes()
