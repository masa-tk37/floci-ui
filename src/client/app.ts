import Alpine from "alpinejs"
import {
  createCognitoPoolDetailController,
  createCognitoUserDetailController,
} from "./controllers/cognito"
import {
  createDynamoCreateTableController,
  createDynamoItemEditController,
  createDynamoItemListController,
  createDynamoQueryBuilderController,
  createDynamoUpdateTableController,
} from "./controllers/dynamodb"
import {
  createParameterFormController,
  createSecretFormController,
  createUserPoolFormController,
} from "./controllers/forms-basic"
import {
  createDeleteModalController,
  createListFilterController,
  createRevealToggleController,
  createThemeToggleController,
  createToastController,
  bindDeleteModalTriggers,
} from "./controllers/shared"
import {
  createS3CreateBucketController,
  createS3ObjectListController,
  createS3PreviewController,
  createS3SettingsController,
} from "./controllers/s3"
import {
  createSqsCreateQueueController,
  createSqsQueueDetailController,
  createSqsSettingsController,
} from "./controllers/sqs"
import { createMount } from "./lib/mount"

const registry = {
  "delete-modal": createDeleteModalController,
  toast: createToastController,
  "list-filter": createListFilterController,
  "reveal-toggle": createRevealToggleController,
  "theme-toggle": createThemeToggleController,
  "secret-form": createSecretFormController,
  "parameter-form": createParameterFormController,
  "user-pool-form": createUserPoolFormController,
  "ddb-create-table": createDynamoCreateTableController,
  "ddb-update-table": createDynamoUpdateTableController,
  "ddb-item-edit": createDynamoItemEditController,
  "ddb-item-list": createDynamoItemListController,
  "ddb-query-builder": createDynamoQueryBuilderController,
  "s3-create-bucket": createS3CreateBucketController,
  "s3-settings": createS3SettingsController,
  "s3-object-list": createS3ObjectListController,
  "s3-preview": createS3PreviewController,
  "sqs-create-queue": createSqsCreateQueueController,
  "sqs-settings": createSqsSettingsController,
  "sqs-queue-detail": createSqsQueueDetailController,
  "cognito-pool-detail": createCognitoPoolDetailController,
  "cognito-user-detail": createCognitoUserDetailController,
}

const mount = createMount(registry)

declare global {
  interface Window {
    Alpine: typeof Alpine
    mount: typeof mount
  }
}

window.Alpine = Alpine
window.mount = mount

bindDeleteModalTriggers()
Alpine.start()
