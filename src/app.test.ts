import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createApp, type AppRouteDeps } from "./app"
import { encodeResourceName } from "./infrastructure/resource-name-codec"

const sidebarDataMock = mock(async () => undefined)

const loadDashboardDataMock = mock(async () => ({
  dynamodb: { count: 1, items: ["users"] },
  s3: { count: 1, items: ["assets"] },
  sqs: { count: 1, items: ["jobs"] },
  ssm: { count: 1, items: ["/demo/param"] },
  secrets: { count: 1, items: ["demo-secret"] },
  cognito: { count: 1, items: [{ id: "pool-1", name: "local-pool" }] },
  endpoint: "http://localhost:4566",
  sidebarCounts: {
    tables: 1,
    buckets: 1,
    queues: 1,
    parameters: 1,
    secrets: 1,
    userPools: 1,
  },
}))

const createSecretMock = mock(async () => undefined)
const deleteSecretMock = mock(async () => undefined)
const getSecretDetailMock = mock(async () => ({
  name: "demo-secret",
  arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:demo-secret",
  description: "",
  kmsKeyId: "",
  lastChangedDate: undefined,
  secretString: "value",
  isBinary: false,
  versionId: "1",
  versionStages: ["AWSCURRENT"],
  createdDate: undefined,
  tags: [],
}))
const listSecretsMock = mock(async () => [])
const updateSecretMock = mock(async () => undefined)

const createParameterMock = mock(async () => undefined)
const deleteParameterMock = mock(async () => undefined)
const getParameterDetailMock = mock(async () => ({
  name: "/demo/param",
  type: "String" as const,
  tier: "Standard" as const,
  description: "",
  keyId: "",
  lastModifiedDate: undefined,
  value: "value",
  version: 1,
  arn: "arn:aws:ssm:us-east-1:000000000000:parameter/demo/param",
  dataType: "text",
  tags: [],
}))
const listParametersMock = mock(async () => [])
const updateParameterMock = mock(async () => undefined)

const createUserPoolMock = mock(async () => "pool-1")
const createUserPoolClientMock = mock(async () => "client-1")
const createUserMock = mock(async () => "alice")
const confirmUserSignUpMock = mock(async () => undefined)
const deleteUserMock = mock(async () => undefined)
const deleteUserPoolMock = mock(async () => undefined)
const deleteUserPoolClientMock = mock(async () => undefined)
const disableUserMock = mock(async () => undefined)
const enableUserMock = mock(async () => undefined)
const getUserDetailMock = mock(async () => ({
  username: "alice",
  status: "CONFIRMED",
  enabled: true,
  createdAt: undefined,
  updatedAt: undefined,
  email: "",
  phoneNumber: "",
  sub: "sub-1",
  preferredMfaSetting: "",
  userMfaSettings: [],
  attributes: [],
}))
const getUserPoolDetailMock = mock(async () => ({
  id: "pool-1",
  name: "local-pool",
  createdAt: undefined,
  updatedAt: undefined,
  signInMode: "username" as const,
  autoVerifiedAttributes: [],
  mfaConfiguration: "OFF" as const,
}))
const listUserPoolClientsMock = mock(async () => [])
const listUserPoolsMock = mock(async () => [])
const listUsersMock = mock(async () => [])
const setUserPasswordMock = mock(async () => undefined)

const createQueueMock = mock(async () => undefined)
const deleteMessageMock = mock(async () => undefined)
const deleteQueueMock = mock(async () => undefined)
const getQueueAttributesMock = mock(async () => ({
  depth: 1,
  inFlight: 0,
  delayed: 0,
  visibilityTimeout: 30,
  messageRetention: 60,
  dlqName: null,
  contentBasedDeduplication: false,
  queueArn: "arn:aws:sqs:us-east-1:000000000000:demo",
}))
const getQueueMessagesMock = mock(async () => [
  {
    messageId: "msg-1",
    receiptHandle: "receipt-1",
    body: "hello world",
    sentTimestamp: 1_714_960_000_000,
  },
])
const getQueueDetailMock = mock(async () => ({
  attributes: await getQueueAttributesMock(),
  messages: await getQueueMessagesMock(),
}))
const getQueueMessageBodyMock = mock(async () => "hello world")
const getQueueSettingsMock = mock(async () => ({
  name: "demo",
  isFifo: false,
  visibilityTimeout: 30,
  messageRetentionPeriod: 60,
  delaySeconds: 0,
  receiveMessageWaitTimeSeconds: 0,
  maximumMessageSize: 262144,
  dlqEnabled: false,
  dlqTargetArn: "",
  dlqMaxReceiveCount: 3,
  kmsEnabled: false,
  kmsMasterKeyId: "",
  tags: [],
}))
const listQueuesMock = mock(async () => [
  { name: "demo", depth: 1, dlqName: null },
])
const purgeQueueMock = mock(async () => undefined)
const sendMessageMock = mock(async () => "msg-1")
const updateQueueSettingsMock = mock(async () => undefined)

const createBucketMock = mock(async () => ({ warnings: [] as string[] }))
const createFolderObjectMock = mock(async () => ({ key: "reports/" }))
const deleteBucketMock = mock(async () => undefined)
const deleteObjectMock = mock(async () => undefined)
const deleteSelectedObjectsMock = mock(async () => ({
  deletedCount: 1,
  errors: [],
}))
const getBucketSettingsMock = mock(async () => ({
  bucket: "demo-bucket",
  versioning: "Suspended",
  encryption: "none",
  kmsKeyId: "",
  ownership: "BucketOwnerEnforced",
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
  tags: [],
  corsRules: [],
  lifecycleRules: [],
}))
const getObjectDetailsMock = mock(async () => ({
  key: "notes.txt",
  contentType: "text/plain",
  size: 12,
  lastModified: undefined,
  eTag: '"etag"',
  metadata: { team: "infra" },
}))
const getObjectForDownloadMock = mock(async () => {
  throw new Error("unexpected download call")
})
const getObjectPreviewMock = mock(async () => ({
  contentType: "text/plain",
  mode: "text" as const,
  text: "preview",
  truncated: false,
}))
const listBucketsMock = mock(async () => [])
const listObjectsMock = mock(async () => ({ objects: [], folders: [] }))
const renameFolderMock = mock(async () => ({
  copiedCount: 1,
  deletedCount: 1,
  errors: [],
  prefix: "archive/",
}))
const renameObjectMock = mock(async () => ({ key: "renamed.txt" }))
const updateBucketSettingsMock = mock(async () => ({
  warnings: [] as string[],
}))
const updateObjectPropertiesMock = mock(async () => ({
  key: "notes.txt",
  contentType: "text/plain",
  size: 12,
  lastModified: undefined,
  eTag: '"etag"',
  metadata: {},
}))
const uploadObjectsMock = mock(async () => ({ uploadedCount: 1, errors: [] }))

const createTableMock = mock(async () => undefined)
const deleteItemMock = mock(async () => undefined)
const deleteTableMock = mock(async () => undefined)
const getItemMock = mock(async () => ({
  item: { pk: "1" },
  hashKey: "pk",
  sortKey: undefined,
  tableArn: "arn:aws:dynamodb:us-east-1:000000000000:table/demo",
}))
const getTableDetailMock = mock(async () => ({
  tableName: "demo",
  billingMode: "PAY_PER_REQUEST" as const,
  rcu: 5,
  wcu: 5,
  streamEnabled: false,
  streamViewType: "NEW_AND_OLD_IMAGES" as const,
  ttlEnabled: false,
  ttlAttr: "",
  deletionProtection: false,
}))
const listTablesMock = mock(async () => ["demo"])
const queryItemsMock = mock(async () => ({
  items: [{ pk: "1", status: "OPEN" }],
  cursor: "cursor-1",
}))
const saveItemMock = mock(async () => undefined)
const scanItemsMock = mock(async () => ({
  items: [{ pk: "1" }],
  nextCursor: undefined,
  hashKey: "pk",
  sortKey: undefined,
  tableArn: "arn:aws:dynamodb:us-east-1:000000000000:table/demo",
}))
const updateTableMock = mock(async () => undefined)

function buildTestApp() {
  const deps: AppRouteDeps = {
    dashboard: {
      endpoint: "http://localhost:4566",
      loadDashboardData: loadDashboardDataMock,
    },
    secrets: {
      createSecret: createSecretMock,
      deleteSecret: deleteSecretMock,
      getSecretDetail: getSecretDetailMock,
      listSecrets: listSecretsMock,
      loadSidebarSafe: sidebarDataMock,
      updateSecret: updateSecretMock,
    },
    ssm: {
      createParameter: createParameterMock,
      deleteParameter: deleteParameterMock,
      getParameterDetail: getParameterDetailMock,
      listParameters: listParametersMock,
      loadSidebarSafe: sidebarDataMock,
      updateParameter: updateParameterMock,
    },
    cognito: {
      confirmUserSignUp: confirmUserSignUpMock,
      createUser: createUserMock,
      createUserPool: createUserPoolMock,
      createUserPoolClient: createUserPoolClientMock,
      deleteUser: deleteUserMock,
      deleteUserPool: deleteUserPoolMock,
      deleteUserPoolClient: deleteUserPoolClientMock,
      disableUser: disableUserMock,
      enableUser: enableUserMock,
      getUserDetail: getUserDetailMock,
      getUserPoolDetail: getUserPoolDetailMock,
      listUserPoolClients: listUserPoolClientsMock,
      listUserPools: listUserPoolsMock,
      listUsers: listUsersMock,
      loadSidebarSafe: sidebarDataMock,
      setUserPassword: setUserPasswordMock,
    },
    sqs: {
      createQueue: createQueueMock,
      deleteMessage: deleteMessageMock,
      deleteQueue: deleteQueueMock,
      getQueueAttributes: getQueueAttributesMock,
      getQueueDetail: getQueueDetailMock,
      getQueueMessageBody: getQueueMessageBodyMock,
      getQueueMessages: getQueueMessagesMock,
      getQueueSettings: getQueueSettingsMock,
      listQueues: listQueuesMock,
      loadSidebarSafe: sidebarDataMock,
      purgeQueue: purgeQueueMock,
      sendMessage: sendMessageMock,
      updateQueueSettings: updateQueueSettingsMock,
    },
    s3: {
      createBucket: createBucketMock,
      createFolderObject: createFolderObjectMock,
      deleteBucket: deleteBucketMock,
      deleteObject: deleteObjectMock,
      deleteSelectedObjects: deleteSelectedObjectsMock,
      getBucketSettings: getBucketSettingsMock,
      getObjectDetails: getObjectDetailsMock,
      getObjectForDownload: getObjectForDownloadMock,
      getObjectPreview: getObjectPreviewMock,
      listBuckets: listBucketsMock,
      listObjects: listObjectsMock,
      loadSidebarSafe: sidebarDataMock,
      renameFolder: renameFolderMock,
      renameObject: renameObjectMock,
      updateBucketSettings: updateBucketSettingsMock,
      updateObjectProperties: updateObjectPropertiesMock,
      uploadObjects: uploadObjectsMock,
    },
    dynamodb: {
      createTable: createTableMock,
      deleteItem: deleteItemMock,
      deleteTable: deleteTableMock,
      getItem: getItemMock,
      getTableDetail: getTableDetailMock,
      listTables: listTablesMock,
      loadSidebarSafe: sidebarDataMock,
      queryItems: queryItemsMock,
      saveItem: saveItemMock,
      scanItems: scanItemsMock,
      updateTable: updateTableMock,
    },
  }

  return createApp(deps)
}

beforeEach(() => {
  for (const fn of [
    loadDashboardDataMock,
    createSecretMock,
    createParameterMock,
    createUserPoolMock,
    createQueueMock,
    getQueueMessagesMock,
    getObjectDetailsMock,
    queryItemsMock,
  ]) {
    fn.mockClear()
  }
})

describe("createApp", () => {
  it("returns HTML for the dashboard route", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/"),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toContain("floci-ui")
    expect(loadDashboardDataMock).toHaveBeenCalledTimes(1)
  })

  it("returns HTML fragments for SQS message list updates", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/sqs/demo/messages-fragment"),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toContain("hello world")
    expect(getQueueMessagesMock).toHaveBeenCalledTimes(1)
  })

  it("wraps successful secret creation in ok/data envelope", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: " demo-secret ",
          secretString: "value",
          tags: [{ key: "team", value: "infra" }],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: encodeResourceName("demo-secret") },
    })
    expect(createSecretMock).toHaveBeenCalledTimes(1)
  })

  it("returns structured validation errors for invalid JSON payloads", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretString: "value" }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "InvalidInput",
        message: expect.any(String),
      },
    })
    expect(createSecretMock).not.toHaveBeenCalled()
  })

  it("creates SSM parameters with the normalized JSON envelope", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/ssm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "/demo/param",
          type: "String",
          value: "value",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: encodeResourceName("/demo/param") },
    })
    expect(createParameterMock).toHaveBeenCalledTimes(1)
  })

  it("creates Cognito user pools with the normalized JSON envelope", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/cognito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "local-pool",
          usernameMode: "username",
          autoVerifiedAttributes: [],
          mfaConfiguration: "OFF",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "pool-1" },
    })
    expect(createUserPoolMock).toHaveBeenCalledTimes(1)
  })

  it("creates SQS queues with ok/null responses", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/sqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "demo",
          attributes: { VisibilityTimeout: "30" },
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, data: null })
    expect(createQueueMock).toHaveBeenCalledTimes(1)
  })

  it("returns DynamoDB query results in the data envelope", async () => {
    const response = await buildTestApp().handle(
      new Request("http://localhost/dynamodb/demo/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "query",
          keyConditionExpression: "pk = :pk",
          expressionAttributeValues: JSON.stringify({ ":pk": "1" }),
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        items: [{ pk: "1", status: "OPEN" }],
        cursor: "cursor-1",
      },
    })
    expect(queryItemsMock).toHaveBeenCalledTimes(1)
  })

  it("returns S3 object details in the data envelope", async () => {
    const response = await buildTestApp().handle(
      new Request(
        "http://localhost/s3/demo-bucket/object-details?key=notes.txt",
      ),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        key: "notes.txt",
        contentType: "text/plain",
        size: 12,
        lastModified: undefined,
        eTag: '"etag"',
        metadata: { team: "infra" },
      },
    })
    expect(getObjectDetailsMock).toHaveBeenCalledTimes(1)
  })
})
