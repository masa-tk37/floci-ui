import { Html } from "@elysiajs/html"

import { Layout } from "../layout"
import {
  IconFile,
  IconFolder,
  IconMoreVertical,
  IconPlus,
  IconSettings,
} from "../icons"
import { makeS3ObjectListAlpineState } from "./object-list-state"

interface S3Object {
  Key?: string
  Size?: number
  LastModified?: Date
}

interface CommonPrefix {
  Prefix?: string
}

interface ObjectListProps {
  bucket: string
  prefix: string
  objects: S3Object[]
  folders: CommonPrefix[]
  sidebarCounts?: import("../layout").SidebarCounts
}

interface PathCrumb {
  label: string
  prefix: string
}

function buildPrefixCrumbs(prefix: string): PathCrumb[] {
  if (!prefix) return []
  const parts = prefix.split("/").filter((part) => part.length > 0)
  const crumbs: PathCrumb[] = []
  let acc = ""
  for (const part of parts) {
    acc += `${part}/`
    crumbs.push({ label: part, prefix: acc })
  }
  return crumbs
}

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(date: Date | undefined): string {
  if (!date) return "—"
  return new Date(date).toISOString().slice(0, 19).replace("T", " ")
}

function stripPrefix(key: string, prefix: string): string {
  if (prefix && key.startsWith(prefix)) return key.slice(prefix.length)
  return key
}

export function ObjectList({
  bucket,
  prefix,
  objects,
  folders,
  sidebarCounts,
}: ObjectListProps) {
  const prefixCrumbs = buildPrefixCrumbs(prefix)
  const bucketPath = `/s3/${encodeURIComponent(bucket)}`
  const alpineState = makeS3ObjectListAlpineState({
    bucket,
    prefix,
    fileKeys: objects.map((object) => object.Key ?? "").filter(Boolean),
    folderPrefixes: folders
      .map((folder) => folder.Prefix ?? "")
      .filter(Boolean),
  })

  const layoutCrumbs = [
    { label: "S3", href: "/s3" },
    { label: bucket, href: bucketPath },
    ...prefixCrumbs.map((c) => ({
      label: c.label,
      href: `${bucketPath}?prefix=${encodeURIComponent(c.prefix)}`,
    })),
  ]

  return (
    <Layout
      title={`S3 · ${bucket}`}
      active="s3"
      crumbs={layoutCrumbs}
      sidebarCounts={sidebarCounts}
      stylesheets={["/public/styles/views/s3/object-list.css"]}
    >
      <div class="s3-object-list-page" x-data={alpineState}>
        <section class="page-header page-header--row">
          <div>
            <h1 class="page-title">
              <span safe>{bucket}</span>
              {prefix ? (
                <span class="s3-object-list-page__prefix" safe>
                  /{prefix}
                </span>
              ) : null}
            </h1>
            <p class="page-subtitle" safe>{`arn:aws:s3:::${bucket}`}</p>
          </div>
          <div class="s3-object-list-page__header-actions">
            <button
              type="button"
              class="btn btn--s3 btn--sm"
              {...{ "@click": "openFolderModal()" }}
            >
              {IconPlus}フォルダ作成
            </button>
            <button
              type="button"
              class="btn btn--s3 btn--sm"
              {...{ "@click": "openUploadModal()" }}
            >
              {IconPlus}アップロード
            </button>
            <a href={`${bucketPath}/settings`} class="btn btn--ghost btn--sm">
              {IconSettings}設定
            </a>
          </div>
        </section>

        <div
          x-show="isFolderModalOpen"
          class="modal-overlay"
          x-cloak
          {...{ "@click": "closeFolderModal()" }}
        >
          <div
            class="modal"
            {...{
              "@click.stop": "",
              "@keydown.escape.window": "closeFolderModal()",
            }}
          >
            <h2 class="modal__title">フォルダ作成</h2>
            <p class="modal__body">
              現在の保存先:
              <span
                class="badge badge--s3 s3-object-list-page__scope-badge"
                safe
              >
                {prefix || "/"}
              </span>
            </p>
            <div class="form-row">
              <label class="form-label" for="s3-folder-name-modal">
                フォルダ名
              </label>
              <input
                id="s3-folder-name-modal"
                type="text"
                class="input"
                placeholder="reports"
                x-model="folderName"
                x-ref="folderNameInput"
              />
            </div>
            <div class="error-inline" x-show="folderError" x-cloak>
              <span x-text="folderError" />
            </div>
            <div class="modal__actions">
              <button
                type="button"
                class="btn btn--s3"
                {...{
                  "@click": "createFolder()",
                  ":disabled": "folderSubmitting",
                }}
              >
                <span x-show="!folderSubmitting">作成</span>
                <span x-show="folderSubmitting">作成中…</span>
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                {...{
                  "@click": "closeFolderModal()",
                  ":disabled": "folderSubmitting",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>

        <div
          x-show="isUploadModalOpen"
          class="modal-overlay"
          x-cloak
          {...{ "@click": "closeUploadModal()" }}
        >
          <div
            class="modal modal--wide"
            {...{
              "@click.stop": "",
              "@keydown.escape.window": "closeUploadModal()",
            }}
          >
            <h2 class="modal__title">ファイルアップロード</h2>
            <p class="modal__body">
              現在の保存先:
              <span
                class="badge badge--s3 s3-object-list-page__scope-badge"
                safe
              >
                {prefix || "/"}
              </span>
            </p>
            <div class="form-row">
              <label class="form-label" for="s3-upload-files-modal">
                ファイル
              </label>
              <input
                id="s3-upload-files-modal"
                type="file"
                class="input s3-object-list-page__file-input"
                multiple
                x-ref="uploadInput"
                {...{ "@change": "onUploadSelection($event)" }}
              />
              <p class="form-help" x-show="uploadFiles.length > 0" x-cloak>
                <span x-text="uploadFiles.length + ' 件を選択中'" />
              </p>
            </div>
            <div class="error-inline" x-show="uploadError" x-cloak>
              <span x-text="uploadError" />
            </div>
            <div class="modal__actions">
              <button
                type="button"
                class="btn btn--s3"
                {...{ "@click": "upload()", ":disabled": "uploadSubmitting" }}
              >
                <span x-show="!uploadSubmitting">アップロード</span>
                <span x-show="uploadSubmitting">アップロード中…</span>
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                {...{
                  "@click": "closeUploadModal()",
                  ":disabled": "uploadSubmitting",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>

        <div
          x-show="isRenameModalOpen"
          class="modal-overlay"
          x-cloak
          {...{ "@click": "closeRenameModal()" }}
        >
          <div
            class="modal modal--wide"
            {...{
              "@click.stop": "",
              "@keydown.escape.window": "closeRenameModal()",
            }}
          >
            <h2 class="modal__title">
              <span x-text="renameTitle">名前変更</span>
            </h2>
            <p class="modal__body" x-text="renameDescription" />
            <div class="form-row">
              <label class="form-label" for="s3-rename-source">
                現在のキー
              </label>
              <input
                id="s3-rename-source"
                type="text"
                class="input"
                x-model="renameSource"
                readonly
              />
            </div>
            <div class="form-row">
              <label class="form-label" for="s3-rename-destination">
                新しいキー
              </label>
              <input
                id="s3-rename-destination"
                type="text"
                class="input"
                x-model="renameDestination"
                x-ref="renameInput"
              />
            </div>
            <div class="error-inline" x-show="renameError" x-cloak>
              <span x-text="renameError" />
            </div>
            <div class="modal__actions">
              <button
                type="button"
                class="btn btn--s3"
                {...{
                  "@click": "submitRename()",
                  ":disabled": "renameSubmitting",
                }}
              >
                <span x-show="!renameSubmitting">更新</span>
                <span x-show="renameSubmitting">更新中…</span>
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                {...{
                  "@click": "closeRenameModal()",
                  ":disabled": "renameSubmitting",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>

        <div
          x-show="isPropertyModalOpen"
          class="modal-overlay"
          x-cloak
          {...{ "@click": "closePropertyModal()" }}
        >
          <div
            class="modal modal--wide"
            {...{
              "@click.stop": "",
              "@keydown.escape.window": "closePropertyModal()",
            }}
          >
            <h2 class="modal__title">プロパティ編集</h2>
            <div class="s3-object-list-page__property-summary">
              <span class="s3-object-list-page__property-summary-label">
                対象オブジェクト
              </span>
              <code
                class="s3-object-list-page__code s3-object-list-page__code--block"
                x-text="propertyKey"
              />
            </div>

            <div x-show="propertyLoading" class="modal__body" x-cloak>
              読み込み中…
            </div>

            <div x-show="!propertyLoading" x-cloak>
              <div class="s3-object-list-page__meta-grid">
                <div class="s3-object-list-page__meta-card">
                  <span class="s3-object-list-page__meta-label">サイズ</span>
                  <span
                    class="s3-object-list-page__meta-value"
                    x-text="formatBytes(propertySize)"
                  />
                </div>
                <div class="s3-object-list-page__meta-card">
                  <span class="s3-object-list-page__meta-label">更新日時</span>
                  <span
                    class="s3-object-list-page__meta-value"
                    x-text="propertyLastModified || '—'"
                  />
                </div>
                <div class="s3-object-list-page__meta-card">
                  <span class="s3-object-list-page__meta-label">ETag</span>
                  <span
                    class="s3-object-list-page__meta-value s3-object-list-page__meta-value--mono"
                    x-text="propertyETag || '—'"
                  />
                </div>
              </div>

              <div class="form-row">
                <label class="form-label" for="s3-property-content-type">
                  Content-Type
                </label>
                <input
                  id="s3-property-content-type"
                  type="text"
                  class="input"
                  x-model="propertyContentType"
                  x-ref="propertyContentTypeInput"
                  placeholder="application/octet-stream"
                />
              </div>

              <div class="form-row" x-show="propertyMetadata" x-cloak>
                <label class="form-label">Metadata</label>
                <pre
                  class="s3-object-list-page__metadata-preview"
                  x-text="propertyMetadata"
                />
              </div>
            </div>

            <div class="error-inline" x-show="propertyError" x-cloak>
              <span x-text="propertyError" />
            </div>
            <div class="modal__actions">
              <button
                type="button"
                class="btn btn--s3"
                {...{
                  "@click": "saveProperties()",
                  ":disabled": "propertyLoading || propertySubmitting",
                }}
              >
                <span x-show="!propertySubmitting">保存</span>
                <span x-show="propertySubmitting">保存中…</span>
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                {...{
                  "@click": "closePropertyModal()",
                  ":disabled": "propertyLoading || propertySubmitting",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>

        <template x-teleport="body">
          <div
            x-show="actionMenuOpen"
            class="s3-object-list-page__action-menu-layer"
            x-cloak
            {...{ "x-on:keydown.escape.window": "closeActionMenu()" }}
          >
            <button
              type="button"
              class="s3-object-list-page__action-menu-backdrop"
              aria-label="Close action menu"
              {...{ "x-on:click": "closeActionMenu()" }}
            />
            <div
              class="s3-object-list-page__action-popover s3-object-list-page__action-popover--floating"
              role="menu"
              {...{
                "x-bind:style":
                  "{ top: actionMenuY + 'px', left: actionMenuX + 'px' }",
              }}
            >
              <a
                x-show="actionMenuKind === 'file'"
                x-cloak
                x-bind:href="actionMenuDownloadUrl"
                class="s3-object-list-page__action-item"
                role="menuitem"
                {...{ "x-on:click": "closeActionMenu()" }}
              >
                ダウンロード
              </a>
              <button
                type="button"
                class="s3-object-list-page__action-item"
                role="menuitem"
                {...{ "x-on:click": "openRenameFromActionMenu()" }}
              >
                名前変更
              </button>
              <button
                type="button"
                class="s3-object-list-page__action-item"
                role="menuitem"
                x-show="actionMenuKind === 'file'"
                x-cloak
                {...{ "x-on:click": "openPropertyFromActionMenu()" }}
              >
                プロパティ
              </button>
              <button
                type="button"
                class="s3-object-list-page__action-item s3-object-list-page__action-item--danger"
                role="menuitem"
                {...{ "x-on:click": "openDeleteFromActionMenu()" }}
              >
                削除
              </button>
            </div>
          </div>
        </template>

        {folders.length === 0 && objects.length === 0 ? (
          <p class="empty-state">このフォルダは空です</p>
        ) : (
          <>
            <section
              class="panel s3-object-list-page__bulk-actions"
              x-show="hasSelection"
              x-cloak
            >
              <div class="panel__header s3-object-list-page__bulk-actions-head">
                <h2 class="panel__title">選択中の項目</h2>
                <div class="s3-object-list-page__bulk-actions-controls">
                  <span
                    class="badge badge--s3"
                    x-text="selectedCount + ' 件'"
                  />
                  <button
                    type="button"
                    class="btn btn--danger btn--sm"
                    {...{ "@click": "openBulkDelete()" }}
                  >
                    選択した項目を削除
                  </button>
                </div>
              </div>
            </section>

            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="s3-object-list-page__select-col">
                      <input
                        type="checkbox"
                        aria-label="すべて選択"
                        {...{
                          "@change": "toggleAll($event)",
                          ":checked": "allSelected",
                        }}
                      />
                    </th>
                    <th>Name</th>
                    <th class="data-table__num">Size</th>
                    <th>Last modified</th>
                    <th class="data-table__actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder) => {
                    const folderPrefix = folder.Prefix ?? ""
                    const displayName = stripPrefix(folderPrefix, prefix)
                    return (
                      <tr class="data-table__row data-table__row--folder">
                        <td class="s3-object-list-page__select-col">
                          <input
                            type="checkbox"
                            value={folderPrefix}
                            x-model="selectedFolders"
                            aria-label={`Select folder ${displayName}`}
                          />
                        </td>
                        <td>
                          <a
                            href={`${bucketPath}?prefix=${encodeURIComponent(folderPrefix)}`}
                            class="folder-link"
                          >
                            <span class="folder-link__icon">{IconFolder}</span>
                            <span safe>{displayName}</span>
                          </a>
                        </td>
                        <td class="data-table__num">—</td>
                        <td>—</td>
                        <td class="data-table__actions s3-object-list-page__actions-cell">
                          <div class="s3-object-list-page__action-menu">
                            <button
                              type="button"
                              class="btn btn--ghost btn--sm s3-object-list-page__action-trigger"
                              aria-label={`Open actions for folder ${displayName}`}
                              aria-haspopup="menu"
                              data-menu-kind="folder"
                              data-menu-rename-source={folderPrefix}
                              data-menu-resource-name={displayName}
                              data-menu-detail-text="このフォルダを削除すると、配下のオブジェクトも削除されます。"
                              data-menu-delete-url={`${bucketPath}/delete-objects`}
                              data-menu-delete-method="POST"
                              data-menu-delete-body={JSON.stringify({
                                files: [],
                                folders: [folderPrefix],
                              })}
                              data-menu-content-type="application/json"
                              data-menu-on-success="reload"
                              {...{
                                "x-bind:aria-expanded":
                                  "(actionMenuOpen && actionMenuRenameSource === $el.dataset.menuRenameSource).toString()",
                                "x-on:click":
                                  "openActionMenu($event, $el.dataset)",
                              }}
                            >
                              {IconMoreVertical}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {objects.map((obj) => {
                    const key = obj.Key ?? ""
                    if (key === prefix) return null
                    const displayName = stripPrefix(key, prefix)
                    const encodedKey = encodeURIComponent(key)
                    const deleteUrl = `${bucketPath}/object?key=${encodedKey}`
                    return (
                      <tr class="data-table__row">
                        <td class="s3-object-list-page__select-col">
                          <input
                            type="checkbox"
                            value={key}
                            x-model="selectedFiles"
                            aria-label={`Select file ${displayName}`}
                          />
                        </td>
                        <td>
                          <a
                            href={`${bucketPath}/preview?key=${encodedKey}`}
                            class="object-name s3-object-list-page__object-link"
                          >
                            <span class="object-name__icon">{IconFile}</span>
                            <span safe>{displayName}</span>
                          </a>
                        </td>
                        <td class="data-table__num" safe>
                          {formatSize(obj.Size)}
                        </td>
                        <td safe>{formatDate(obj.LastModified)}</td>
                        <td class="data-table__actions s3-object-list-page__actions-cell">
                          <div class="s3-object-list-page__action-menu">
                            <button
                              type="button"
                              class="btn btn--ghost btn--sm s3-object-list-page__action-trigger"
                              aria-label={`Open actions for file ${displayName}`}
                              aria-haspopup="menu"
                              data-menu-kind="file"
                              data-menu-rename-source={key}
                              data-menu-object-key={key}
                              data-menu-download-url={`${bucketPath}/download?key=${encodedKey}`}
                              data-menu-resource-name={displayName}
                              data-menu-delete-url={deleteUrl}
                              data-menu-on-success="reload"
                              {...{
                                "x-bind:aria-expanded":
                                  "(actionMenuOpen && actionMenuRenameSource === $el.dataset.menuRenameSource).toString()",
                                "x-on:click":
                                  "openActionMenu($event, $el.dataset)",
                              }}
                            >
                              {IconMoreVertical}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
