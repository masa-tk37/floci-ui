import {
  AdminAddUserToGroupCommand,
  AdminConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  type AdminGetUserCommandOutput,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  type AttributeType,
  CreateGroupCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteGroupCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  type ExplicitAuthFlowsType,
  type GroupType,
  ListGroupsCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
  type UsernameAttributeType,
  type UserPoolClientDescription,
  type UserPoolDescriptionType,
  type UserPoolMfaType,
  type UserPoolType,
  type UserType,
  type VerifiedAttributeType,
} from "@aws-sdk/client-cognito-identity-provider"
import { ServiceError, toOperationFailed } from "../../errors"
import { cognitoIdentityProvider } from "../../infrastructure/floci-clients"
import { optionalTrimmed, requireTrimmed } from "../resource-tags"

const DEFAULT_EXPLICIT_AUTH_FLOWS: ExplicitAuthFlowsType[] = [
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
  "ALLOW_USER_SRP_AUTH",
]

export type CognitoUsernameMode = "username" | "email" | "phone_number"
export type CognitoVerifiedAttribute = "email" | "phone_number"
export type CognitoMfaConfiguration = "OFF" | "OPTIONAL" | "ON"
export type UserPoolSignInMode = CognitoUsernameMode | "email_or_phone_number"

export interface UserPoolSummary {
  id: string
  name: string
  createdAt?: Date
  updatedAt?: Date
}

export interface UserPoolDetail extends UserPoolSummary {
  signInMode: UserPoolSignInMode
  autoVerifiedAttributes: CognitoVerifiedAttribute[]
  mfaConfiguration: CognitoMfaConfiguration
}

export interface AppClientSummary {
  id: string
  name: string
}

export interface UserAttribute {
  name: string
  value: string
}

export interface UserSummary {
  username: string
  status: string
  enabled: boolean
  createdAt?: Date
  updatedAt?: Date
  email: string
  phoneNumber: string
}

export interface UserDetail extends UserSummary {
  sub: string
  preferredMfaSetting: string
  userMfaSettings: string[]
  attributes: UserAttribute[]
}

export interface CreateUserPoolInput {
  name: string
  usernameMode: CognitoUsernameMode
  autoVerifiedAttributes?: CognitoVerifiedAttribute[]
  mfaConfiguration?: CognitoMfaConfiguration
}

export interface CreateAppClientInput {
  name: string
}

export interface CreateUserInput {
  username: string
  temporaryPassword: string
  email?: string
  phoneNumber?: string
}

export interface SetUserPasswordInput {
  password: string
  permanent: boolean
}

export interface GroupSummary {
  name: string
  description: string
  createdAt?: Date
  updatedAt?: Date
}

export interface CreateGroupInput {
  name: string
  description?: string
}

function normalizeUsernameMode(value: string | undefined): CognitoUsernameMode {
  if (value === "username" || value === "email" || value === "phone_number") {
    return value
  }
  throw new ServiceError("InvalidInput", `Unsupported username mode: ${value}`)
}

function normalizeMfaConfiguration(
  value: string | undefined,
): CognitoMfaConfiguration {
  if (!value || value === "OFF" || value === "OPTIONAL" || value === "ON") {
    return (value ?? "OFF") as CognitoMfaConfiguration
  }
  throw new ServiceError(
    "InvalidInput",
    `Unsupported MFA configuration: ${value}`,
  )
}

function normalizeVerifiedAttributes(
  values: CognitoVerifiedAttribute[] | undefined,
): CognitoVerifiedAttribute[] {
  const normalized = new Set<CognitoVerifiedAttribute>()

  for (const value of values ?? []) {
    if (value === "email" || value === "phone_number") {
      normalized.add(value)
      continue
    }

    throw new ServiceError(
      "InvalidInput",
      `Unsupported auto verified attribute: ${value}`,
    )
  }

  return [...normalized]
}

function toAttributeMap(
  attributes: AttributeType[] | undefined,
): Map<string, string> {
  return new Map(
    (attributes ?? [])
      .filter((attribute) => attribute.Name)
      .map((attribute) => [attribute.Name ?? "", attribute.Value ?? ""]),
  )
}

function mapUserPoolSummary(
  pool: UserPoolDescriptionType,
): UserPoolSummary | null {
  if (!pool.Id || !pool.Name) return null
  return {
    id: pool.Id,
    name: pool.Name,
    createdAt: pool.CreationDate,
    updatedAt: pool.LastModifiedDate,
  }
}

function toSignInMode(
  usernameAttributes: UsernameAttributeType[] | undefined,
): UserPoolSignInMode {
  const values = new Set(usernameAttributes ?? [])
  if (values.has("email") && values.has("phone_number")) {
    return "email_or_phone_number"
  }
  if (values.has("email")) return "email"
  if (values.has("phone_number")) return "phone_number"
  return "username"
}

function mapUserPoolDetail(pool: UserPoolType): UserPoolDetail {
  if (!pool.Id || !pool.Name) {
    throw new ServiceError("OperationFailed", "User pool data is incomplete")
  }

  return {
    id: pool.Id,
    name: pool.Name,
    createdAt: pool.CreationDate,
    updatedAt: pool.LastModifiedDate,
    signInMode: toSignInMode(pool.UsernameAttributes),
    autoVerifiedAttributes: (pool.AutoVerifiedAttributes ??
      []) as CognitoVerifiedAttribute[],
    mfaConfiguration: (pool.MfaConfiguration ??
      "OFF") as CognitoMfaConfiguration,
  }
}

function mapClientSummary(
  client: UserPoolClientDescription,
): AppClientSummary | null {
  if (!client.ClientId || !client.ClientName) return null
  return {
    id: client.ClientId,
    name: client.ClientName,
  }
}

function mapGroupSummary(group: GroupType): GroupSummary | null {
  if (!group.GroupName) return null
  return {
    name: group.GroupName,
    description: group.Description ?? "",
    createdAt: group.CreationDate,
    updatedAt: group.LastModifiedDate,
  }
}

function mapUserSummary(user: UserType): UserSummary | null {
  if (!user.Username) return null
  const attributes = toAttributeMap(user.Attributes)

  return {
    username: user.Username,
    status: user.UserStatus ?? "UNKNOWN",
    enabled: user.Enabled ?? false,
    createdAt: user.UserCreateDate,
    updatedAt: user.UserLastModifiedDate,
    email: attributes.get("email") ?? "",
    phoneNumber: attributes.get("phone_number") ?? "",
  }
}

function toUserDetail(
  user: AdminGetUserCommandOutput,
  fallbackUsername: string,
): UserDetail {
  const attributeMap = toAttributeMap(user.UserAttributes)
  const mappedAttributes = [...attributeMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    username: user.Username ?? fallbackUsername,
    status: user.UserStatus ?? "UNKNOWN",
    enabled: user.Enabled ?? false,
    createdAt: user.UserCreateDate,
    updatedAt: user.UserLastModifiedDate,
    email: attributeMap.get("email") ?? "",
    phoneNumber: attributeMap.get("phone_number") ?? "",
    sub: attributeMap.get("sub") ?? "",
    preferredMfaSetting: user.PreferredMfaSetting ?? "",
    userMfaSettings: user.UserMFASettingList ?? [],
    attributes: mappedAttributes,
  }
}

async function collectPages<Raw, Item>(
  fetchPage: (
    token: string | undefined,
  ) => Promise<{ items: Raw[] | undefined; nextToken: string | undefined }>,
  map: (raw: Raw) => Item | null,
): Promise<Item[]> {
  const collected: Item[] = []
  let token: string | undefined

  do {
    const page = await fetchPage(token)
    for (const raw of page.items ?? []) {
      const mapped = map(raw)
      if (mapped) collected.push(mapped)
    }
    token = page.nextToken
  } while (token)

  return collected
}

// Passwords are sent as typed so Cognito validates surrounding whitespace itself.
function requireNonBlank(value: string, label: string): string {
  if (!value.trim()) {
    throw new ServiceError("InvalidInput", `${label} is required`)
  }
  return value
}

function toCognitoError(
  error: unknown,
  messages: {
    notFound?: string
    userNotFound?: string
    alreadyExists?: string
  } = {},
): never {
  if (error instanceof ServiceError) throw error

  if (error instanceof Error) {
    // Cognito raises this for a missing pool and a missing group alike, so group
    // operations omit `notFound` and keep the SDK message.
    if (error.name === "ResourceNotFoundException") {
      throw new ServiceError(
        "NotFound",
        messages.notFound ?? error.message,
        error,
      )
    }

    if (error.name === "UserNotFoundException") {
      throw new ServiceError(
        "NotFound",
        messages.userNotFound ?? error.message,
        error,
      )
    }

    if (
      error.name === "UsernameExistsException" ||
      error.name === "ResourceConflictException" ||
      error.name === "GroupExistsException"
    ) {
      throw new ServiceError(
        "AlreadyExists",
        messages.alreadyExists ?? error.message,
        error,
      )
    }

    if (
      error.name === "InvalidPasswordException" ||
      error.name === "InvalidParameterException" ||
      error.name === "AliasExistsException" ||
      error.name === "NotAuthorizedException"
    ) {
      throw new ServiceError("InvalidInput", error.message, error)
    }
  }

  toOperationFailed(error)
}

export async function listUserPools(): Promise<UserPoolSummary[]> {
  try {
    const pools = await collectPages(async (nextToken) => {
      const result = await cognitoIdentityProvider.send(
        new ListUserPoolsCommand({
          MaxResults: 60,
          NextToken: nextToken,
        }),
      )
      return { items: result.UserPools, nextToken: result.NextToken }
    }, mapUserPoolSummary)

    return pools.sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    toCognitoError(error)
  }
}

export async function createUserPool(
  input: CreateUserPoolInput,
): Promise<string> {
  const name = requireTrimmed(input.name, "Pool name")
  const usernameMode = normalizeUsernameMode(input.usernameMode)
  const autoVerifiedAttributes = normalizeVerifiedAttributes(
    input.autoVerifiedAttributes,
  )
  const mfaConfiguration = normalizeMfaConfiguration(input.mfaConfiguration)

  try {
    const result = await cognitoIdentityProvider.send(
      new CreateUserPoolCommand({
        PoolName: name,
        DeletionProtection: "INACTIVE",
        UsernameAttributes:
          usernameMode === "username"
            ? undefined
            : [usernameMode as UsernameAttributeType],
        AutoVerifiedAttributes:
          autoVerifiedAttributes.length > 0
            ? (autoVerifiedAttributes as VerifiedAttributeType[])
            : undefined,
        MfaConfiguration: mfaConfiguration as UserPoolMfaType,
      }),
    )

    const poolId = result.UserPool?.Id
    if (!poolId) {
      throw new ServiceError(
        "OperationFailed",
        "User pool was created but no ID was returned",
      )
    }

    return poolId
  } catch (error) {
    toCognitoError(error, {
      alreadyExists: `User pool ${name} already exists`,
    })
  }
}

export async function getUserPoolDetail(
  poolId: string,
): Promise<UserPoolDetail> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")

  try {
    const result = await cognitoIdentityProvider.send(
      new DescribeUserPoolCommand({
        UserPoolId: normalizedPoolId,
      }),
    )

    if (!result.UserPool) {
      throw new ServiceError(
        "NotFound",
        `User pool ${normalizedPoolId} not found`,
      )
    }

    return mapUserPoolDetail(result.UserPool)
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
    })
  }
}

export async function deleteUserPool(poolId: string): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")

  try {
    await cognitoIdentityProvider.send(
      new DeleteUserPoolCommand({
        UserPoolId: normalizedPoolId,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
    })
  }
}

export async function listUserPoolClients(
  poolId: string,
): Promise<AppClientSummary[]> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  try {
    const clients = await collectPages(async (nextToken) => {
      const result = await cognitoIdentityProvider.send(
        new ListUserPoolClientsCommand({
          UserPoolId: normalizedPoolId,
          MaxResults: 60,
          NextToken: nextToken,
        }),
      )
      return { items: result.UserPoolClients, nextToken: result.NextToken }
    }, mapClientSummary)

    return clients.sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
    })
  }
}

export async function createUserPoolClient(
  poolId: string,
  input: CreateAppClientInput,
): Promise<string> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const name = requireTrimmed(input.name, "App client name")

  try {
    const result = await cognitoIdentityProvider.send(
      new CreateUserPoolClientCommand({
        UserPoolId: normalizedPoolId,
        ClientName: name,
        GenerateSecret: false,
        ExplicitAuthFlows: DEFAULT_EXPLICIT_AUTH_FLOWS,
      }),
    )

    const clientId = result.UserPoolClient?.ClientId
    if (!clientId) {
      throw new ServiceError(
        "OperationFailed",
        "App client was created but no client ID was returned",
      )
    }

    return clientId
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      alreadyExists: `App client ${name} already exists`,
    })
  }
}

export async function deleteUserPoolClient(
  poolId: string,
  clientId: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedClientId = requireTrimmed(clientId, "App client ID")

  try {
    await cognitoIdentityProvider.send(
      new DeleteUserPoolClientCommand({
        UserPoolId: normalizedPoolId,
        ClientId: normalizedClientId,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `App client ${normalizedClientId} not found`,
    })
  }
}

export async function listUsers(poolId: string): Promise<UserSummary[]> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  try {
    const users = await collectPages(async (paginationToken) => {
      const result = await cognitoIdentityProvider.send(
        new ListUsersCommand({
          UserPoolId: normalizedPoolId,
          Limit: 60,
          PaginationToken: paginationToken,
        }),
      )
      return { items: result.Users, nextToken: result.PaginationToken }
    }, mapUserSummary)

    return users.sort((left, right) =>
      left.username.localeCompare(right.username),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
    })
  }
}

export async function getUserDetail(
  poolId: string,
  username: string,
): Promise<UserDetail> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    const result = await cognitoIdentityProvider.send(
      new AdminGetUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )

    return toUserDetail(result, normalizedUsername)
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function createUser(
  poolId: string,
  input: CreateUserInput,
): Promise<string> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const username = requireTrimmed(input.username, "Username")
  const temporaryPassword = requireNonBlank(
    input.temporaryPassword,
    "Temporary password",
  )
  const email = optionalTrimmed(input.email)
  const phoneNumber = optionalTrimmed(input.phoneNumber)

  const userAttributes: AttributeType[] = []
  if (email) {
    userAttributes.push({ Name: "email", Value: email })
  }
  if (phoneNumber) {
    userAttributes.push({ Name: "phone_number", Value: phoneNumber })
  }

  try {
    const result = await cognitoIdentityProvider.send(
      new AdminCreateUserCommand({
        UserPoolId: normalizedPoolId,
        Username: username,
        TemporaryPassword: temporaryPassword,
        MessageAction: "SUPPRESS",
        UserAttributes: userAttributes.length > 0 ? userAttributes : undefined,
      }),
    )

    return result.User?.Username ?? username
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      alreadyExists: `User ${username} already exists`,
    })
  }
}

export async function deleteUser(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminDeleteUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function enableUser(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminEnableUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function disableUser(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminDisableUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function confirmUserSignUp(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function setUserPassword(
  poolId: string,
  username: string,
  input: SetUserPasswordInput,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedUsername = requireTrimmed(username, "Username")
  const password = requireNonBlank(input.password, "Password")

  try {
    await cognitoIdentityProvider.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
        Password: password,
        Permanent: input.permanent,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function listGroups(poolId: string): Promise<GroupSummary[]> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  try {
    const groups = await collectPages(async (nextToken) => {
      const result = await cognitoIdentityProvider.send(
        new ListGroupsCommand({
          UserPoolId: normalizedPoolId,
          Limit: 60,
          NextToken: nextToken,
        }),
      )
      return { items: result.Groups, nextToken: result.NextToken }
    }, mapGroupSummary)

    return groups.sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
    })
  }
}

export async function createGroup(
  poolId: string,
  input: CreateGroupInput,
): Promise<string> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const name = requireTrimmed(input.name, "Group name")
  const description = optionalTrimmed(input.description)

  try {
    await cognitoIdentityProvider.send(
      new CreateGroupCommand({
        UserPoolId: normalizedPoolId,
        GroupName: name,
        Description: description,
      }),
    )

    return name
  } catch (error) {
    toCognitoError(error, {
      notFound: `User pool ${normalizedPoolId} not found`,
      alreadyExists: `Group ${name} already exists`,
    })
  }
}

export async function deleteGroup(
  poolId: string,
  groupName: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedGroupName = requireTrimmed(groupName, "Group name")

  try {
    await cognitoIdentityProvider.send(
      new DeleteGroupCommand({
        UserPoolId: normalizedPoolId,
        GroupName: normalizedGroupName,
      }),
    )
  } catch (error) {
    toCognitoError(error)
  }
}

export async function listUsersInGroup(
  poolId: string,
  groupName: string,
): Promise<UserSummary[]> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedGroupName = requireTrimmed(groupName, "Group name")
  try {
    const users = await collectPages(async (nextToken) => {
      const result = await cognitoIdentityProvider.send(
        new ListUsersInGroupCommand({
          UserPoolId: normalizedPoolId,
          GroupName: normalizedGroupName,
          Limit: 60,
          NextToken: nextToken,
        }),
      )
      return { items: result.Users, nextToken: result.NextToken }
    }, mapUserSummary)

    return users.sort((left, right) =>
      left.username.localeCompare(right.username),
    )
  } catch (error) {
    toCognitoError(error)
  }
}

export async function addUserToGroup(
  poolId: string,
  groupName: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedGroupName = requireTrimmed(groupName, "Group name")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: normalizedPoolId,
        GroupName: normalizedGroupName,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function removeUserFromGroup(
  poolId: string,
  groupName: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = requireTrimmed(poolId, "User pool ID")
  const normalizedGroupName = requireTrimmed(groupName, "Group name")
  const normalizedUsername = requireTrimmed(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: normalizedPoolId,
        GroupName: normalizedGroupName,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      userNotFound: `User ${normalizedUsername} not found`,
    })
  }
}
