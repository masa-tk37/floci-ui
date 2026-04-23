import {
  AdminConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  ListUsersCommand,
  type AttributeType,
  type ExplicitAuthFlowsType,
  type UserPoolClientDescription,
  type UserPoolDescriptionType,
  type UserPoolType,
  type UserType,
  type UserPoolMfaType,
  type UsernameAttributeType,
  type VerifiedAttributeType,
} from "@aws-sdk/client-cognito-identity-provider"
import { ServiceError } from "../../errors"
import { cognitoIdentityProvider } from "../../infrastructure/floci-clients"

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

function normalizeRequired(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new ServiceError("InvalidInput", `${label} is required`)
  }
  return normalized
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
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
  username: string,
  attributes: AttributeType[] | undefined,
  enabled: boolean | undefined,
  status: string | undefined,
  createdAt: Date | undefined,
  updatedAt: Date | undefined,
  preferredMfaSetting: string | undefined,
  userMfaSettings: string[] | undefined,
): UserDetail {
  const attributeMap = toAttributeMap(attributes)
  const mappedAttributes = [...attributeMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    username,
    status: status ?? "UNKNOWN",
    enabled: enabled ?? false,
    createdAt,
    updatedAt,
    email: attributeMap.get("email") ?? "",
    phoneNumber: attributeMap.get("phone_number") ?? "",
    sub: attributeMap.get("sub") ?? "",
    preferredMfaSetting: preferredMfaSetting ?? "",
    userMfaSettings: userMfaSettings ?? [],
    attributes: mappedAttributes,
  }
}

function toCognitoError(
  error: unknown,
  messages: {
    notFound?: string
    alreadyExists?: string
  } = {},
): never {
  if (error instanceof ServiceError) throw error

  if (error instanceof Error) {
    if (
      error.name === "ResourceNotFoundException" ||
      error.name === "UserNotFoundException"
    ) {
      throw new ServiceError(
        "NotFound",
        messages.notFound ?? error.message,
        error,
      )
    }

    if (
      error.name === "UsernameExistsException" ||
      error.name === "ResourceConflictException"
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
      error.name === "AliasExistsException"
    ) {
      throw new ServiceError("InvalidInput", error.message, error)
    }
  }

  throw new ServiceError(
    "OperationFailed",
    error instanceof Error ? error.message : String(error),
    error,
  )
}

export async function listUserPools(): Promise<UserPoolSummary[]> {
  const pools: UserPoolSummary[] = []
  let nextToken: string | undefined

  try {
    do {
      const result = await cognitoIdentityProvider.send(
        new ListUserPoolsCommand({
          MaxResults: 60,
          NextToken: nextToken,
        }),
      )

      for (const pool of result.UserPools ?? []) {
        const mapped = mapUserPoolSummary(pool)
        if (mapped) pools.push(mapped)
      }

      nextToken = result.NextToken
    } while (nextToken)

    return pools.sort((left, right) => left.name.localeCompare(right.name))
  } catch (error) {
    toCognitoError(error)
  }
}

export async function createUserPool(
  input: CreateUserPoolInput,
): Promise<string> {
  const name = normalizeRequired(input.name, "Pool name")
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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")

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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")

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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const clients: AppClientSummary[] = []
  let nextToken: string | undefined

  try {
    do {
      const result = await cognitoIdentityProvider.send(
        new ListUserPoolClientsCommand({
          UserPoolId: normalizedPoolId,
          MaxResults: 60,
          NextToken: nextToken,
        }),
      )

      for (const client of result.UserPoolClients ?? []) {
        const mapped = mapClientSummary(client)
        if (mapped) clients.push(mapped)
      }

      nextToken = result.NextToken
    } while (nextToken)

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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const name = normalizeRequired(input.name, "App client name")

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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedClientId = normalizeRequired(clientId, "App client ID")

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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const users: UserSummary[] = []
  let paginationToken: string | undefined

  try {
    do {
      const result = await cognitoIdentityProvider.send(
        new ListUsersCommand({
          UserPoolId: normalizedPoolId,
          Limit: 60,
          PaginationToken: paginationToken,
        }),
      )

      for (const user of result.Users ?? []) {
        const mapped = mapUserSummary(user)
        if (mapped) users.push(mapped)
      }

      paginationToken = result.PaginationToken
    } while (paginationToken)

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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedUsername = normalizeRequired(username, "Username")

  try {
    const result = await cognitoIdentityProvider.send(
      new AdminGetUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )

    return toUserDetail(
      result.Username ?? normalizedUsername,
      result.UserAttributes,
      result.Enabled,
      result.UserStatus,
      result.UserCreateDate,
      result.UserLastModifiedDate,
      result.PreferredMfaSetting,
      result.UserMFASettingList,
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function createUser(
  poolId: string,
  input: CreateUserInput,
): Promise<string> {
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const username = normalizeRequired(input.username, "Username")
  const temporaryPassword = normalizeRequired(
    input.temporaryPassword,
    "Temporary password",
  )
  const email = normalizeOptional(input.email)
  const phoneNumber = normalizeOptional(input.phoneNumber)

  const userAttributes: AttributeType[] = []
  if (email) {
    userAttributes.push({ Name: "email", Value: email })
  }
  if (phoneNumber) {
    userAttributes.push({ Name: "phone_number", Value: phoneNumber })
  }

  try {
    await cognitoIdentityProvider.send(
      new AdminCreateUserCommand({
        UserPoolId: normalizedPoolId,
        Username: username,
        TemporaryPassword: temporaryPassword,
        MessageAction: "SUPPRESS",
        UserAttributes: userAttributes.length > 0 ? userAttributes : undefined,
      }),
    )

    return username
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
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedUsername = normalizeRequired(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminDeleteUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function enableUser(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedUsername = normalizeRequired(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminEnableUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function disableUser(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedUsername = normalizeRequired(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminDisableUserCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function confirmUserSignUp(
  poolId: string,
  username: string,
): Promise<void> {
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedUsername = normalizeRequired(username, "Username")

  try {
    await cognitoIdentityProvider.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: normalizedPoolId,
        Username: normalizedUsername,
      }),
    )
  } catch (error) {
    toCognitoError(error, {
      notFound: `User ${normalizedUsername} not found`,
    })
  }
}

export async function setUserPassword(
  poolId: string,
  username: string,
  input: SetUserPasswordInput,
): Promise<void> {
  const normalizedPoolId = normalizeRequired(poolId, "User pool ID")
  const normalizedUsername = normalizeRequired(username, "Username")
  const password = normalizeRequired(input.password, "Password")

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
      notFound: `User ${normalizedUsername} not found`,
    })
  }
}
