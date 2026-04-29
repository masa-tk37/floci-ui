import { beforeEach, describe, expect, it, mock } from "bun:test"

const sendMock = mock()

mock.module("../../infrastructure/floci-clients", () => ({
  ssm: { send: sendMock },
}))

const {
  createParameter,
  deleteParameter,
  getParameterDetail,
  listParameters,
  updateParameter,
} = await import("./parameter-service")

beforeEach(() => {
  sendMock.mockReset()
})

describe("listParameters", () => {
  it("maps parameter metadata into summaries", async () => {
    sendMock.mockResolvedValueOnce({
      Parameters: [
        {
          Name: "/app/password",
          Type: "SecureString",
          Tier: "Advanced",
          Description: "db password",
          KeyId: "alias/aws/ssm",
          LastModifiedDate: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    })

    await expect(listParameters()).resolves.toEqual([
      {
        name: "/app/password",
        type: "SecureString",
        tier: "Advanced",
        description: "db password",
        keyId: "alias/aws/ssm",
        lastModifiedDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    ])
  })
})

describe("getParameterDetail", () => {
  it("loads metadata, value, and tags with decryption", async () => {
    sendMock
      .mockResolvedValueOnce({
        Parameters: [
          {
            Name: "/app/password",
            Type: "SecureString",
            Tier: "Advanced",
            Description: "db password",
            KeyId: "alias/aws/ssm",
          },
        ],
      })
      .mockResolvedValueOnce({
        Parameter: {
          Name: "/app/password",
          Value: "secret-value",
          Version: 3,
          ARN: "arn:aws:ssm:us-east-1:000000000000:parameter/app/password",
          DataType: "text",
        },
      })
      .mockResolvedValueOnce({
        TagList: [{ Key: "Environment", Value: "dev" }],
      })

    await expect(getParameterDetail("/app/password")).resolves.toEqual({
      name: "/app/password",
      type: "SecureString",
      tier: "Advanced",
      description: "db password",
      keyId: "alias/aws/ssm",
      lastModifiedDate: undefined,
      value: "secret-value",
      version: 3,
      arn: "arn:aws:ssm:us-east-1:000000000000:parameter/app/password",
      dataType: "text",
      tags: [{ key: "Environment", value: "dev" }],
    })
  })

  it("maps ParameterNotFound to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "ParameterNotFound" }),
    )
    await expect(getParameterDetail("/missing")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})

describe("createParameter", () => {
  it("creates a parameter with normalized tags", async () => {
    sendMock.mockResolvedValueOnce({})

    await createParameter({
      name: " /app/config ",
      type: "String",
      value: "value",
      tags: [
        { key: " Environment ", value: " dev " },
        { key: "", value: "ignored" },
      ],
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      Name: "/app/config",
      Type: "String",
      Value: "value",
      Tags: [{ Key: "Environment", Value: "dev" }],
    })
  })

  it("maps duplicate-name errors to AlreadyExists", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("exists"), { name: "ParameterAlreadyExists" }),
    )

    await expect(
      createParameter({
        name: "/app/config",
        type: "String",
        value: "value",
      }),
    ).rejects.toMatchObject({
      code: "AlreadyExists",
    })
  })
})

describe("updateParameter", () => {
  it("does not send KeyId when type is String", async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ TagList: [] })
      .mockResolvedValueOnce({})

    await updateParameter("/app/config", {
      type: "String",
      value: "plain-value",
      keyId: "alias/aws/ssm",
    })

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      Name: "/app/config",
      Type: "String",
      Value: "plain-value",
    })
    expect(sendMock.mock.calls[0]?.[0]?.input.KeyId).toBeUndefined()
  })

  it("overwrites the parameter and syncs tags", async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        TagList: [{ Key: "Team", Value: "platform" }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    await updateParameter("/app/config", {
      type: "SecureString",
      value: "new-value",
      description: "",
      tier: "Advanced",
      keyId: "alias/aws/ssm",
      tags: [{ key: "Environment", value: "dev" }],
    })

    expect(sendMock).toHaveBeenCalledTimes(4)
    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      Name: "/app/config",
      Type: "SecureString",
      Value: "new-value",
      Description: "",
      Tier: "Advanced",
      KeyId: "alias/aws/ssm",
      Overwrite: true,
    })
    expect(sendMock.mock.calls[2]?.[0]?.input).toMatchObject({
      ResourceType: "Parameter",
      ResourceId: "/app/config",
      TagKeys: ["Team"],
    })
    expect(sendMock.mock.calls[3]?.[0]?.input).toMatchObject({
      ResourceType: "Parameter",
      ResourceId: "/app/config",
      Tags: [{ Key: "Environment", Value: "dev" }],
    })
  })
})

describe("deleteParameter", () => {
  it("maps missing parameters to NotFound", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "ParameterNotFound" }),
    )

    await expect(deleteParameter("/missing")).rejects.toMatchObject({
      code: "NotFound",
    })
  })
})
