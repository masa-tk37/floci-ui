import { beforeEach, describe, expect, it, mock } from "bun:test"

const sendMock = mock()

mock.module("../../infrastructure/floci-clients", () => ({
  secretsManager: { send: sendMock },
}))

const { createSecret, deleteSecret, getSecretDetail, updateSecret } =
  await import("./secret-service")

beforeEach(() => {
  sendMock.mockReset()
})

describe("getSecretDetail", () => {
  it("loads metadata, string value, and tags", async () => {
    sendMock
      .mockResolvedValueOnce({
        Name: "app/dev/db",
        ARN: "arn:aws:secretsmanager:us-east-1:000000000000:secret:app/dev/db",
        Description: "database password",
        KmsKeyId: "alias/aws/secretsmanager",
        Tags: [{ Key: "Environment", Value: "dev" }],
      })
      .mockResolvedValueOnce({
        SecretString: '{"password":"secret"}',
        VersionId: "version-1",
        VersionStages: ["AWSCURRENT"],
        CreatedDate: new Date("2026-04-02T00:00:00.000Z"),
      })

    await expect(getSecretDetail("app/dev/db")).resolves.toEqual({
      name: "app/dev/db",
      arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:app/dev/db",
      description: "database password",
      kmsKeyId: "alias/aws/secretsmanager",
      lastChangedDate: undefined,
      secretString: '{"password":"secret"}',
      isBinary: false,
      versionId: "version-1",
      versionStages: ["AWSCURRENT"],
      createdDate: new Date("2026-04-02T00:00:00.000Z"),
      tags: [{ key: "Environment", value: "dev" }],
    })
  })

  it("flags binary secrets without exposing a string value", async () => {
    sendMock
      .mockResolvedValueOnce({
        Name: "binary-secret",
        ARN: "arn:aws:secretsmanager:us-east-1:000000000000:secret:binary-secret",
        Description: "",
        Tags: [],
      })
      .mockResolvedValueOnce({
        SecretBinary: new Uint8Array([1, 2, 3]),
      })

    await expect(getSecretDetail("binary-secret")).resolves.toMatchObject({
      name: "binary-secret",
      isBinary: true,
      secretString: "",
    })
  })

  it("maps ResourceNotFoundException to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), {
        name: "ResourceNotFoundException",
      }),
    )
    await expect(getSecretDetail("missing-secret")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("createSecret", () => {
  it("creates a secret with normalized tags", async () => {
    sendMock.mockResolvedValueOnce({})

    await createSecret({
      name: " app/dev/db ",
      secretString: "secret",
      tags: [{ key: " Environment ", value: " dev " }],
    })

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      Name: "app/dev/db",
      SecretString: "secret",
      Tags: [{ Key: "Environment", Value: "dev" }],
    })
  })

  it("maps ResourceExistsException to AlreadyExists", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("exists"), { name: "ResourceExistsException" }),
    )
    await expect(
      createSecret({ name: "name", secretString: "value" }),
    ).rejects.toMatchObject({ code: "AlreadyExists" })
  })
})

describe("updateSecret", () => {
  it("updates the value and syncs tags", async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Name: "app/dev/db",
        Tags: [{ Key: "Team", Value: "platform" }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    await updateSecret("app/dev/db", {
      secretString: "next-secret",
      description: "",
      tags: [{ key: "Environment", value: "dev" }],
    })

    expect(sendMock).toHaveBeenCalledTimes(4)
    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      SecretId: "app/dev/db",
      SecretString: "next-secret",
      Description: "",
    })
    expect(sendMock.mock.calls[2]?.[0]?.input).toMatchObject({
      SecretId: "app/dev/db",
      TagKeys: ["Team"],
    })
    expect(sendMock.mock.calls[3]?.[0]?.input).toMatchObject({
      SecretId: "app/dev/db",
      Tags: [{ Key: "Environment", Value: "dev" }],
    })
  })
})

describe("deleteSecret", () => {
  it("forces deletion without recovery", async () => {
    sendMock.mockResolvedValueOnce({})

    await deleteSecret("app/dev/db")

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      SecretId: "app/dev/db",
      ForceDeleteWithoutRecovery: true,
    })
  })

  it("maps missing secrets to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), {
        name: "ResourceNotFoundException",
      }),
    )

    await expect(deleteSecret("missing")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})
