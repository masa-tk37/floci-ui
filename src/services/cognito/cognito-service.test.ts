import { beforeEach, describe, expect, it, mock } from "bun:test"

const sendMock = mock()

mock.module("../../infrastructure/floci-clients", () => ({
  cognitoIdentityProvider: { send: sendMock },
}))

const {
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
} = await import("./cognito-service")

beforeEach(() => {
  sendMock.mockReset()
})

describe("getUserPoolDetail", () => {
  it("maps pool detail with correct signInMode", async () => {
    sendMock.mockResolvedValueOnce({
      UserPool: {
        Id: "pool-123",
        Name: "dev-users",
        CreationDate: new Date("2026-01-01T00:00:00.000Z"),
        LastModifiedDate: new Date("2026-04-01T00:00:00.000Z"),
        UsernameAttributes: ["email"],
        AutoVerifiedAttributes: ["email"],
        MfaConfiguration: "OPTIONAL",
      },
    })

    await expect(getUserPoolDetail("pool-123")).resolves.toEqual({
      id: "pool-123",
      name: "dev-users",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      signInMode: "email",
      autoVerifiedAttributes: ["email"],
      mfaConfiguration: "OPTIONAL",
    })
  })

  it("maps ResourceNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("not found"), {
        name: "ResourceNotFoundException",
      }),
    )

    await expect(getUserPoolDetail("missing-pool")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("listUserPools", () => {
  it("loads and sorts user pools across pages", async () => {
    sendMock
      .mockResolvedValueOnce({
        UserPools: [
          { Id: "pool-b", Name: "beta" },
          { Id: "pool-a", Name: "alpha" },
        ],
        NextToken: "next-page",
      })
      .mockResolvedValueOnce({
        UserPools: [{ Id: "pool-c", Name: "gamma" }],
      })

    await expect(listUserPools()).resolves.toEqual([
      {
        id: "pool-a",
        name: "alpha",
        createdAt: undefined,
        updatedAt: undefined,
      },
      {
        id: "pool-b",
        name: "beta",
        createdAt: undefined,
        updatedAt: undefined,
      },
      {
        id: "pool-c",
        name: "gamma",
        createdAt: undefined,
        updatedAt: undefined,
      },
    ])
  })
})

describe("createUserPool", () => {
  it("creates a pool with normalized settings", async () => {
    sendMock.mockResolvedValueOnce({
      UserPool: {
        Id: "pool-123",
      },
    })

    await expect(
      createUserPool({
        name: " local-dev-users ",
        usernameMode: "email",
        autoVerifiedAttributes: ["email"],
        mfaConfiguration: "OPTIONAL",
      }),
    ).resolves.toBe("pool-123")

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      PoolName: "local-dev-users",
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      MfaConfiguration: "OPTIONAL",
      DeletionProtection: "INACTIVE",
    })
  })

  it("maps duplicate pool errors to AlreadyExists", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate"), {
        name: "ResourceConflictException",
      }),
    )

    await expect(
      createUserPool({
        name: "local-dev-users",
        usernameMode: "username",
      }),
    ).rejects.toMatchObject({
      code: "AlreadyExists",
    })
  })
})

describe("createUserPoolClient", () => {
  it("creates a client with the default local auth flows", async () => {
    sendMock.mockResolvedValueOnce({
      UserPoolClient: {
        ClientId: "client-123",
      },
    })

    await expect(
      createUserPoolClient("pool-123", { name: " local-web " }),
    ).resolves.toBe("client-123")

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      UserPoolId: "pool-123",
      ClientName: "local-web",
      GenerateSecret: false,
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
        "ALLOW_USER_SRP_AUTH",
      ],
    })
  })
})

describe("listUsers", () => {
  it("maps user summaries from the list response", async () => {
    sendMock.mockResolvedValueOnce({
      Users: [
        {
          Username: "alice",
          Enabled: true,
          UserStatus: "CONFIRMED",
          UserCreateDate: new Date("2026-04-01T00:00:00.000Z"),
          UserLastModifiedDate: new Date("2026-04-02T00:00:00.000Z"),
          Attributes: [
            { Name: "email", Value: "alice@example.com" },
            { Name: "phone_number", Value: "+819012345678" },
          ],
        },
      ],
    })

    await expect(listUsers("pool-123")).resolves.toEqual([
      {
        username: "alice",
        status: "CONFIRMED",
        enabled: true,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        email: "alice@example.com",
        phoneNumber: "+819012345678",
      },
    ])
  })
})

describe("getUserDetail", () => {
  it("maps user detail and attributes", async () => {
    sendMock.mockResolvedValueOnce({
      Username: "alice",
      Enabled: true,
      UserStatus: "FORCE_CHANGE_PASSWORD",
      UserCreateDate: new Date("2026-04-01T00:00:00.000Z"),
      UserLastModifiedDate: new Date("2026-04-02T00:00:00.000Z"),
      PreferredMfaSetting: "SMS_MFA",
      UserMFASettingList: ["SMS_MFA"],
      UserAttributes: [
        { Name: "sub", Value: "sub-123" },
        { Name: "email", Value: "alice@example.com" },
      ],
    })

    await expect(getUserDetail("pool-123", "alice")).resolves.toEqual({
      username: "alice",
      status: "FORCE_CHANGE_PASSWORD",
      enabled: true,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      email: "alice@example.com",
      phoneNumber: "",
      sub: "sub-123",
      preferredMfaSetting: "SMS_MFA",
      userMfaSettings: ["SMS_MFA"],
      attributes: [
        { name: "email", value: "alice@example.com" },
        { name: "sub", value: "sub-123" },
      ],
    })
  })
})

describe("createUser", () => {
  it("maps UsernameExistsException to AlreadyExists", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("exists"), { name: "UsernameExistsException" }),
    )

    await expect(
      createUser("pool-123", {
        username: "alice",
        temporaryPassword: "TempPassw0rd!",
      }),
    ).rejects.toMatchObject({
      code: "AlreadyExists",
    })
  })

  it("creates a suppressed user with optional attributes", async () => {
    sendMock.mockResolvedValueOnce({})

    await expect(
      createUser("pool-123", {
        username: " alice ",
        temporaryPassword: " TempPassw0rd! ",
        email: " alice@example.com ",
      }),
    ).resolves.toBe("alice")

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      UserPoolId: "pool-123",
      Username: "alice",
      TemporaryPassword: "TempPassw0rd!",
      MessageAction: "SUPPRESS",
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    })
  })
})

describe("deleteUser", () => {
  it("maps UserNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { name: "UserNotFoundException" }),
    )

    await expect(deleteUser("pool-123", "alice")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("enableUser", () => {
  it("maps UserNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { name: "UserNotFoundException" }),
    )

    await expect(enableUser("pool-123", "alice")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("disableUser", () => {
  it("maps UserNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { name: "UserNotFoundException" }),
    )

    await expect(disableUser("pool-123", "alice")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("confirmUserSignUp", () => {
  it("maps UserNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { name: "UserNotFoundException" }),
    )

    await expect(confirmUserSignUp("pool-123", "alice")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("setUserPassword", () => {
  it("sets a permanent password for a user", async () => {
    sendMock.mockResolvedValueOnce({})

    await setUserPassword("pool-123", "alice", {
      password: "NewStrongPassw0rd!",
      permanent: true,
    })

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      UserPoolId: "pool-123",
      Username: "alice",
      Password: "NewStrongPassw0rd!",
      Permanent: true,
    })
  })
})

describe("listUserPoolClients", () => {
  it("returns sorted app clients for a pool", async () => {
    sendMock.mockResolvedValueOnce({
      UserPoolClients: [
        { ClientId: "abc", ClientName: "ZApp" },
        { ClientId: "xyz", ClientName: "AApp" },
      ],
    })
    const result = await listUserPoolClients("pool-id")
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: "xyz", name: "AApp" })
    expect(result[1]).toMatchObject({ id: "abc", name: "ZApp" })
  })

  it("maps ResourceNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), {
        name: "ResourceNotFoundException",
      }),
    )
    await expect(listUserPoolClients("pool-id")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("deleteUserPoolClient", () => {
  it("deletes the specified app client", async () => {
    sendMock.mockResolvedValueOnce({})
    await expect(
      deleteUserPoolClient("pool-id", "client-id"),
    ).resolves.toBeUndefined()
  })

  it("maps ResourceNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), {
        name: "ResourceNotFoundException",
      }),
    )
    await expect(
      deleteUserPoolClient("pool-id", "client-id"),
    ).rejects.toMatchObject({ code: "NotFound" })
  })
})

describe("deleteUserPool", () => {
  it("deletes a user pool successfully", async () => {
    sendMock.mockResolvedValueOnce({})
    await expect(deleteUserPool("pool-id")).resolves.toBeUndefined()
  })

  it("maps ResourceNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), {
        name: "ResourceNotFoundException",
      }),
    )
    await expect(deleteUserPool("pool-id")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})
