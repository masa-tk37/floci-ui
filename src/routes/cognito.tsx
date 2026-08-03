import html, { Html } from "@elysiajs/html"
import { Elysia, t } from "elysia"
import { decodeResourceName } from "../infrastructure/resource-name-codec"
import {
  addUserToGroup,
  confirmUserSignUp,
  createGroup,
  createUser,
  createUserPool,
  createUserPoolClient,
  deleteGroup,
  deleteUser,
  deleteUserPool,
  deleteUserPoolClient,
  disableUser,
  enableUser,
  getUserDetail,
  getUserPoolDetail,
  listGroups,
  listUserPoolClients,
  listUserPools,
  listUsers,
  listUsersInGroup,
  removeUserFromGroup,
  setUserPassword,
} from "../services/cognito/cognito-service"
import { UserPoolDetail } from "../views/cognito/pool-detail"
import { UserPoolForm } from "../views/cognito/pool-form"
import { UserPoolList } from "../views/cognito/pool-list"
import { CognitoUserDetail } from "../views/cognito/user-detail"
import { runJsonAction } from "./route-utils"

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

const createGroupSchema = t.Object({
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
})

const addGroupMemberSchema = t.Object({
  username: t.String({ minLength: 1 }),
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
  addUserToGroup: typeof addUserToGroup
  confirmUserSignUp: typeof confirmUserSignUp
  createGroup: typeof createGroup
  createUser: typeof createUser
  createUserPool: typeof createUserPool
  createUserPoolClient: typeof createUserPoolClient
  deleteGroup: typeof deleteGroup
  deleteUser: typeof deleteUser
  deleteUserPool: typeof deleteUserPool
  deleteUserPoolClient: typeof deleteUserPoolClient
  disableUser: typeof disableUser
  enableUser: typeof enableUser
  getUserDetail: typeof getUserDetail
  getUserPoolDetail: typeof getUserPoolDetail
  listGroups: typeof listGroups
  listUserPoolClients: typeof listUserPoolClients
  listUserPools: typeof listUserPools
  listUsers: typeof listUsers
  listUsersInGroup: typeof listUsersInGroup
  removeUserFromGroup: typeof removeUserFromGroup
  setUserPassword: typeof setUserPassword
}

const defaultCognitoRouteDeps: CognitoRouteDeps = {
  addUserToGroup,
  confirmUserSignUp,
  createGroup,
  createUser,
  createUserPool,
  createUserPoolClient,
  deleteGroup,
  deleteUser,
  deleteUserPool,
  deleteUserPoolClient,
  disableUser,
  enableUser,
  getUserDetail,
  getUserPoolDetail,
  listGroups,
  listUserPoolClients,
  listUserPools,
  listUsers,
  listUsersInGroup,
  removeUserFromGroup,
  setUserPassword,
}

export function createCognitoRoutes(
  deps: CognitoRouteDeps = defaultCognitoRouteDeps,
) {
  return new Elysia({ prefix: "/cognito" })
    .use(html())
    .get("/", async () => {
      const userPools = await deps.listUserPools()
      return <UserPoolList userPools={userPools} />
    })
    .get("/new", () => (
      <UserPoolForm
        init={{
          actionUrl: "/cognito",
          name: "",
          usernameMode: "username",
          autoVerifiedAttributes: [],
          mfaConfiguration: "OFF",
        }}
      />
    ))
    .post(
      "/",
      async ({ body, set }) =>
        runJsonAction(set, async () => ({
          id: await deps.createUserPool(body),
        })),
      { body: createUserPoolSchema },
    )
    .get("/:poolId", async ({ params }) => {
      const [pool, appClients, users, groups] = await Promise.all([
        deps.getUserPoolDetail(params.poolId),
        deps.listUserPoolClients(params.poolId),
        deps.listUsers(params.poolId),
        deps.listGroups(params.poolId),
      ])
      return (
        <UserPoolDetail
          pool={pool}
          appClients={appClients}
          users={users}
          groups={groups}
        />
      )
    })
    .delete("/:poolId", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteUserPool(params.poolId)
      }),
    )
    .post(
      "/:poolId/groups",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => ({
          name: await deps.createGroup(params.poolId, body),
        })),
      { body: createGroupSchema },
    )
    .delete("/:poolId/groups/:groupName", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteGroup(
          params.poolId,
          decodeURIComponent(params.groupName),
        )
      }),
    )
    .get("/:poolId/groups/:groupName/users", async ({ params, set }) =>
      runJsonAction(set, async () => ({
        users: await deps.listUsersInGroup(
          params.poolId,
          decodeURIComponent(params.groupName),
        ),
      })),
    )
    .post(
      "/:poolId/groups/:groupName/users",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.addUserToGroup(
            params.poolId,
            decodeURIComponent(params.groupName),
            body.username,
          )
        }),
      { body: addGroupMemberSchema },
    )
    .delete(
      "/:poolId/groups/:groupName/users/:username",
      async ({ params, set }) =>
        runJsonAction(set, async () => {
          await deps.removeUserFromGroup(
            params.poolId,
            decodeURIComponent(params.groupName),
            decodeURIComponent(params.username),
          )
        }),
    )
    .post(
      "/:poolId/clients",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => ({
          clientId: await deps.createUserPoolClient(params.poolId, body),
        })),
      { body: createAppClientSchema },
    )
    .delete("/:poolId/clients/:clientId", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteUserPoolClient(params.poolId, params.clientId)
      }),
    )
    .post(
      "/:poolId/users",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => ({
          username: await deps.createUser(params.poolId, body),
        })),
      { body: createUserSchema },
    )
    .get("/:poolId/users/:username", async ({ params }) => {
      const username = decodeResourceName(params.username)
      const [user, pool] = await Promise.all([
        deps.getUserDetail(params.poolId, username),
        deps.getUserPoolDetail(params.poolId),
      ])
      return (
        <CognitoUserDetail
          poolId={params.poolId}
          poolName={pool.name}
          detail={user}
        />
      )
    })
    .delete("/:poolId/users/:username", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.deleteUser(
          params.poolId,
          decodeResourceName(params.username),
        )
      }),
    )
    .post("/:poolId/users/:username/enable", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.enableUser(
          params.poolId,
          decodeResourceName(params.username),
        )
      }),
    )
    .post("/:poolId/users/:username/disable", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.disableUser(
          params.poolId,
          decodeResourceName(params.username),
        )
      }),
    )
    .post("/:poolId/users/:username/confirm", async ({ params, set }) =>
      runJsonAction(set, async () => {
        await deps.confirmUserSignUp(
          params.poolId,
          decodeResourceName(params.username),
        )
      }),
    )
    .post(
      "/:poolId/users/:username/password",
      async ({ params, body, set }) =>
        runJsonAction(set, async () => {
          await deps.setUserPassword(
            params.poolId,
            decodeResourceName(params.username),
            body,
          )
        }),
      { body: setPasswordSchema },
    )
}

export const cognitoRoutes = createCognitoRoutes()
