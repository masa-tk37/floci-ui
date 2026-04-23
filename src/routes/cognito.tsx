import { Html } from "@elysiajs/html"
import html from "@elysiajs/html"
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
  setUserPassword,
  type CreateAppClientInput,
  type CreateUserInput,
  type CreateUserPoolInput,
  type SetUserPasswordInput,
} from "../services/cognito/cognito-service"
import { loadSidebarSafe, toSidebarCounts } from "../services/sidebar-service"
import { respondWithError } from "./route-utils"
import { UserPoolDetail } from "../views/cognito/pool-detail"
import { UserPoolForm } from "../views/cognito/pool-form"
import { UserPoolList } from "../views/cognito/pool-list"
import { CognitoUserDetail } from "../views/cognito/user-detail"

export const cognitoRoutes = new Elysia({ prefix: "/cognito" })
  .use(html())
  .get("/", async () => {
    const [userPools, sidebarData] = await Promise.all([
      listUserPools(),
      loadSidebarSafe(),
    ])

    return (
      <UserPoolList
        userPools={userPools}
        sidebarCounts={toSidebarCounts(sidebarData)}
      />
    )
  })
  .get("/new", () => {
    return (
      <UserPoolForm
        init={{
          actionUrl: "/cognito",
          name: "",
          usernameMode: "username",
          autoVerifiedAttributes: [],
          mfaConfiguration: "OFF",
        }}
      />
    )
  })
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const id = await createUserPool(body as CreateUserPoolInput)
        return { success: true, id }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
  .get("/:poolId", async ({ params }) => {
    const [pool, appClients, users, sidebarData] = await Promise.all([
      getUserPoolDetail(params.poolId),
      listUserPoolClients(params.poolId),
      listUsers(params.poolId),
      loadSidebarSafe(),
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
      await deleteUserPool(params.poolId)
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
  .post(
    "/:poolId/clients",
    async ({ params, body, set }) => {
      try {
        const clientId = await createUserPoolClient(
          params.poolId,
          body as CreateAppClientInput,
        )
        return { success: true, clientId }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
  .delete("/:poolId/clients/:clientId", async ({ params, set }) => {
    try {
      await deleteUserPoolClient(params.poolId, params.clientId)
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
  .post(
    "/:poolId/users",
    async ({ params, body, set }) => {
      try {
        const username = await createUser(
          params.poolId,
          body as CreateUserInput,
        )
        return { success: true, username }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
  .get("/:poolId/users/:username", async ({ params }) => {
    const username = decodeResourceName(params.username)
    const [user, pool, sidebarData] = await Promise.all([
      getUserDetail(params.poolId, username),
      getUserPoolDetail(params.poolId),
      loadSidebarSafe(),
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
      await deleteUser(params.poolId, decodeResourceName(params.username))
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
  .post("/:poolId/users/:username/enable", async ({ params, set }) => {
    try {
      await enableUser(params.poolId, decodeResourceName(params.username))
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
  .post("/:poolId/users/:username/disable", async ({ params, set }) => {
    try {
      await disableUser(params.poolId, decodeResourceName(params.username))
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
  .post("/:poolId/users/:username/confirm", async ({ params, set }) => {
    try {
      await confirmUserSignUp(
        params.poolId,
        decodeResourceName(params.username),
      )
      return { success: true }
    } catch (error) {
      return respondWithError(error, set)
    }
  })
  .post(
    "/:poolId/users/:username/password",
    async ({ params, body, set }) => {
      try {
        await setUserPassword(
          params.poolId,
          decodeResourceName(params.username),
          body as SetUserPasswordInput,
        )
        return { success: true }
      } catch (error) {
        return respondWithError(error, set)
      }
    },
    { body: t.Any() },
  )
