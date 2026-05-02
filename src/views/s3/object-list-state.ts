import {
  type AlpineStatePaths,
  jsonForScript,
  makeActionMenuSection,
  makeFolderModalSection,
  makePropertyModalSection,
  makeRenameModalSection,
  makeSelectionAndBulkDelete,
  makeUploadModalSection,
} from "./object-list-state-sections"

interface S3ObjectListAlpineStateInit {
  bucket: string
  prefix: string
  fileKeys: string[]
  folderPrefixes: string[]
}

export function makeS3ObjectListAlpineState(
  init: S3ObjectListAlpineStateInit,
): string {
  const bucketPath = `/s3/${encodeURIComponent(init.bucket)}`
  const paths: AlpineStatePaths = {
    bucketPath,
    objectDetailsPath: `${bucketPath}/object-details`,
    renameObjectPath: `${bucketPath}/rename-object`,
    renameFolderPath: `${bucketPath}/rename-folder`,
    objectPropertiesPath: `${bucketPath}/object-properties`,
  }

  return `{
  prefix: ${jsonForScript(init.prefix)},
  allFiles: ${jsonForScript(init.fileKeys)},
  allFolders: ${jsonForScript(init.folderPrefixes)},

  formatBytes(bytes) {
    if (bytes === undefined || bytes === null) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  },
${makeSelectionAndBulkDelete(paths)}
${makeFolderModalSection(paths)}
${makeUploadModalSection(paths)}
${makeRenameModalSection(paths)}
${makePropertyModalSection(paths)}
${makeActionMenuSection()}
}`
}
