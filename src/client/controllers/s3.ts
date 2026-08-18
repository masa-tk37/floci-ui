import { formatBytes, PLACEHOLDER } from "../../views/format"
import type { S3SettingsInitial } from "../../views/s3/settings-form-state"
import {
  type AlpineMagic,
  dispatchToast,
  errorMessage,
  openDeleteModal,
  requestJson,
  tagMixin,
} from "../lib/floci"

function buildEncryptionPayload(encryption: string, kmsKeyId: string) {
  if (encryption === "none") return null
  return {
    type: encryption,
    kmsKeyId: encryption === "aws:kms" && kmsKeyId ? kmsKeyId : undefined,
  }
}

export function normalizeUploadPrefix(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "")
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

function buildS3TagsPayload(tags: { key: string; value: string }[]) {
  return tags
    .filter((tag) => tag.key.trim())
    .map((tag) => ({ key: tag.key, value: tag.value }))
}

type CreateBucketProps = Record<string, never>

interface S3ObjectListProps {
  bucket: string
  prefix: string
  fileKeys: string[]
  folderPrefixes: string[]
}

interface S3PreviewProps {
  downloadHref: string
  mode: "text" | "image" | "pdf" | "binary"
}

export function createS3CreateBucketController(
  _el: HTMLElement,
  _props: CreateBucketProps,
) {
  return {
    name: "",
    versioning: "Suspended",
    encryption: "none",
    kmsKeyId: "",
    ownership: "BucketOwnerEnforced",
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: true,
    restrictPublicBuckets: true,
    tags: [] as { key: string; value: string }[],
    error: null as string | null,
    warnings: [] as string[],
    submitting: false,

    ...tagMixin,

    buildPayload() {
      return {
        name: this.name,
        versioning: this.versioning !== "Suspended" ? this.versioning : null,
        encryption: buildEncryptionPayload(this.encryption, this.kmsKeyId),
        ownership:
          this.ownership !== "BucketOwnerEnforced" ? this.ownership : null,
        publicAccessBlock: {
          blockPublicAcls: this.blockPublicAcls,
          ignorePublicAcls: this.ignorePublicAcls,
          blockPublicPolicy: this.blockPublicPolicy,
          restrictPublicBuckets: this.restrictPublicBuckets,
        },
        tags: buildS3TagsPayload(this.tags),
      }
    },

    async submit() {
      this.error = null
      this.warnings = []
      this.submitting = true

      try {
        const data = await requestJson<{ warnings?: string[] }>("/s3/bucket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildPayload()),
        })

        if (data.warnings?.length) {
          this.warnings = data.warnings
          this.submitting = false
          return
        }

        window.location.href = "/s3"
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createS3SettingsController(
  _el: HTMLElement,
  init: S3SettingsInitial,
) {
  return {
    bucket: init.bucket,
    versioning: init.versioning,
    encryption: init.encryption,
    kmsKeyId: init.kmsKeyId,
    ownership: init.ownership,
    blockPublicAcls: init.blockPublicAcls,
    ignorePublicAcls: init.ignorePublicAcls,
    blockPublicPolicy: init.blockPublicPolicy,
    restrictPublicBuckets: init.restrictPublicBuckets,
    tags: [...init.tags],
    corsRules: [...init.corsRules],
    lifecycleRules: [...init.lifecycleRules],
    error: null as string | null,
    warnings: [] as string[],
    submitting: false,

    ...tagMixin,
    addCors() {
      this.corsRules.push({
        allowedMethods: ["GET"],
        allowedOrigins: ["*"],
        allowedHeaders: [],
        maxAge: 0,
      })
    },
    addCorsMethod(ruleIndex: number) {
      this.corsRules[ruleIndex].allowedMethods.push("")
    },
    removeCorsMethod(ruleIndex: number, methodIndex: number) {
      this.corsRules[ruleIndex].allowedMethods.splice(methodIndex, 1)
    },
    addCorsOrigin(ruleIndex: number) {
      this.corsRules[ruleIndex].allowedOrigins.push("")
    },
    removeCorsOrigin(ruleIndex: number, originIndex: number) {
      this.corsRules[ruleIndex].allowedOrigins.splice(originIndex, 1)
    },
    addCorsHeader(ruleIndex: number) {
      this.corsRules[ruleIndex].allowedHeaders.push("")
    },
    removeCorsHeader(ruleIndex: number, headerIndex: number) {
      this.corsRules[ruleIndex].allowedHeaders.splice(headerIndex, 1)
    },
    removeCors(index: number) {
      this.corsRules.splice(index, 1)
    },
    addLifecycle() {
      this.lifecycleRules.push({ id: "", prefix: "", expirationDays: 30 })
    },
    removeLifecycle(index: number) {
      this.lifecycleRules.splice(index, 1)
    },

    buildPayload() {
      return {
        versioning: this.versioning,
        encryption: buildEncryptionPayload(this.encryption, this.kmsKeyId),
        ownership: this.ownership,
        publicAccessBlock: {
          blockPublicAcls: this.blockPublicAcls,
          ignorePublicAcls: this.ignorePublicAcls,
          blockPublicPolicy: this.blockPublicPolicy,
          restrictPublicBuckets: this.restrictPublicBuckets,
        },
        tags: buildS3TagsPayload(this.tags),
        corsRules: this.corsRules.map((rule) => ({
          allowedMethods: rule.allowedMethods.filter(Boolean),
          allowedOrigins: rule.allowedOrigins.filter(Boolean),
          allowedHeaders: rule.allowedHeaders.filter(Boolean),
          maxAge: Number(rule.maxAge) || 0,
        })),
        lifecycleRules: this.lifecycleRules
          .filter((rule) => rule.id)
          .map((rule) => ({
            id: rule.id,
            prefix: rule.prefix,
            expirationDays: Number(rule.expirationDays) || 30,
          })),
      }
    },

    async submit() {
      this.error = null
      this.warnings = []
      this.submitting = true

      try {
        const data = await requestJson<{ warnings?: string[] }>(
          `/s3/${encodeURIComponent(this.bucket)}/settings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.buildPayload()),
          },
        )

        if (data.warnings?.length) {
          this.warnings = data.warnings
        }
        dispatchToast({ kind: "success", message: "設定を保存しました" })
        this.submitting = false
      } catch (error) {
        this.error = errorMessage(error)
        this.submitting = false
      }
    },
  }
}

export function createS3ObjectListController(
  _el: HTMLElement,
  props: S3ObjectListProps,
) {
  const bucketPath = `/s3/${encodeURIComponent(props.bucket)}`
  const objectDetailsPath = `${bucketPath}/object-details`
  const objectTagsPath = `${bucketPath}/object-tags`
  const renameObjectPath = `${bucketPath}/rename-object`
  const renameFolderPath = `${bucketPath}/rename-folder`
  const objectPropertiesPath = `${bucketPath}/object-properties`
  const folderPath = `${bucketPath}/folder`
  const uploadPath = `${bucketPath}/upload`
  const bulkDeletePath = `${bucketPath}/delete-objects`

  return {
    prefix: props.prefix,
    allFiles: [...props.fileKeys],
    allFolders: [...props.folderPrefixes],

    selectedFiles: [] as string[],
    selectedFolders: [] as string[],

    isFolderModalOpen: false,
    folderName: "",
    folderError: "",
    folderSubmitting: false,

    isUploadModalOpen: false,
    uploadPrefix: props.prefix,
    uploadFiles: [] as File[],
    uploadError: "",
    uploadSubmitting: false,

    isRenameModalOpen: false,
    renameKind: "file",
    renameSource: "",
    renameDestination: "",
    renameError: "",
    renameSubmitting: false,

    isPropertyModalOpen: false,
    propertyKey: "",
    propertyContentType: "",
    propertyError: "",
    propertyLoading: false,
    propertySubmitting: false,
    propertySize: 0,
    propertyLastModified: "",
    propertyETag: "",
    propertyMetadata: "",
    propertyTags: [] as { key: string; value: string }[],

    actionMenuOpen: false,
    actionMenuKind: "",
    actionMenuRenameSource: "",
    actionMenuObjectKey: "",
    actionMenuDownloadUrl: "",
    actionMenuResourceName: "",
    actionMenuDeleteUrl: "",
    actionMenuDeleteMethod: "DELETE",
    actionMenuDeleteBody: "",
    actionMenuDetailText: "",
    actionMenuContentType: "",
    actionMenuOnSuccess: "reload" as "reload" | "remove-row",
    actionMenuX: 0,
    actionMenuY: 0,

    formatBytes,

    get selectedCount() {
      return this.selectedFiles.length + this.selectedFolders.length
    },
    get hasSelection() {
      return this.selectedCount > 0
    },
    get allSelected() {
      return (
        this.selectedCount > 0 &&
        this.selectedFiles.length === this.allFiles.length &&
        this.selectedFolders.length === this.allFolders.length
      )
    },
    get renameTitle() {
      return this.renameKind === "folder" ? "フォルダ名変更" : "ファイル名変更"
    },
    get renameDescription() {
      return this.renameKind === "folder"
        ? "プレフィックス全体を変更します。末尾の / は自動で補完されます。"
        : "オブジェクト key 全体を変更します。別フォルダへの移動もここで行えます。"
    },

    toggleAll(event: Event) {
      const input = event.target as HTMLInputElement
      if (input.checked) {
        this.selectedFiles = [...this.allFiles]
        this.selectedFolders = [...this.allFolders]
        return
      }
      this.selectedFiles = []
      this.selectedFolders = []
    },

    openBulkDelete() {
      if (!this.hasSelection) return
      openDeleteModal({
        resourceName: `${this.selectedCount} 件の項目`,
        detailText:
          this.selectedFolders.length > 0
            ? "選択したフォルダは配下のオブジェクトも削除します。"
            : "",
        deleteUrl: bulkDeletePath,
        method: "POST",
        body: JSON.stringify({
          files: this.selectedFiles,
          folders: this.selectedFolders,
        }),
        contentType: "application/json",
        onSuccess: "reload",
      })
    },

    _closeAllModals() {
      this.closeActionMenu()
      this.closeFolderModal(true)
      this.closeUploadModal(true)
      this.closeRenameModal(true)
      this.closePropertyModal(true)
    },

    openFolderModal() {
      this._closeAllModals()
      this.folderName = ""
      this.folderError = ""
      this.isFolderModalOpen = true
      setTimeout(() => {
        ;(this as unknown as AlpineMagic).$refs.folderNameInput?.focus()
      }, 0)
    },
    closeFolderModal(force = false) {
      if (!force && this.folderSubmitting) return
      this.isFolderModalOpen = false
      this.folderName = ""
      this.folderError = ""
    },
    async createFolder() {
      const folderName = this.folderName.trim()
      if (!folderName) {
        this.folderError = "フォルダ名を入力してください"
        return
      }
      this.folderSubmitting = true
      this.folderError = ""
      try {
        await requestJson(folderPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: this.prefix, folderName }),
        })
        this.folderSubmitting = false
        this.closeFolderModal()
        window.location.reload()
      } catch (error) {
        this.folderError = errorMessage(error)
        this.folderSubmitting = false
      }
    },

    openUploadModal() {
      this._closeAllModals()
      this.uploadError = ""
      this.uploadFiles = []
      this.uploadPrefix = this.prefix
      this.isUploadModalOpen = true
      const uploadInput = (this as unknown as AlpineMagic).$refs.uploadInput as
        | HTMLInputElement
        | undefined
      if (uploadInput) uploadInput.value = ""
    },
    closeUploadModal(force = false) {
      if (!force && this.uploadSubmitting) return
      this.isUploadModalOpen = false
      this.uploadFiles = []
      this.uploadError = ""
      const uploadInput = (this as unknown as AlpineMagic).$refs.uploadInput as
        | HTMLInputElement
        | undefined
      if (uploadInput) uploadInput.value = ""
    },
    onUploadSelection(event: Event) {
      const input = event.target as HTMLInputElement
      this.uploadFiles = Array.from(input.files || [])
      this.uploadError = ""
    },
    get uploadTargetKey(): string {
      const normalized = normalizeUploadPrefix(this.uploadPrefix)
      const first = this.uploadFiles[0]
      if (!first) return `${normalized}…`
      const suffix =
        this.uploadFiles.length > 1
          ? ` ほか ${this.uploadFiles.length - 1} 件`
          : ""
      return `${normalized}${first.name}${suffix}`
    },
    async upload() {
      if (this.uploadFiles.length === 0) {
        this.uploadError = "ファイルを選択してください"
        return
      }
      this.uploadSubmitting = true
      this.uploadError = ""
      const destination = normalizeUploadPrefix(this.uploadPrefix)
      try {
        const formData = new FormData()
        formData.append("prefix", destination)
        for (const file of this.uploadFiles) {
          formData.append("files", file)
        }
        await requestJson(uploadPath, { method: "POST", body: formData })
        this.uploadSubmitting = false
        this.closeUploadModal()
        // Uploading outside the current folder would otherwise reload a listing
        // that cannot show the new files.
        if (destination === normalizeUploadPrefix(this.prefix)) {
          window.location.reload()
          return
        }
        window.location.href = destination
          ? `${bucketPath}?prefix=${encodeURIComponent(destination)}`
          : bucketPath
      } catch (error) {
        this.uploadError = errorMessage(error)
        this.uploadSubmitting = false
      }
    },

    openRenameModal(kind: string, source: string) {
      this._closeAllModals()
      this.renameKind = kind
      this.renameSource = source
      this.renameDestination = source
      this.renameError = ""
      this.renameSubmitting = false
      this.isRenameModalOpen = true
      setTimeout(() => {
        const renameInput = (this as unknown as AlpineMagic).$refs
          .renameInput as
          | (HTMLInputElement & { select?: () => void })
          | undefined
        renameInput?.focus()
        renameInput?.select?.()
      }, 0)
    },
    closeRenameModal(force = false) {
      if (!force && this.renameSubmitting) return
      this.isRenameModalOpen = false
      this.renameKind = "file"
      this.renameSource = ""
      this.renameDestination = ""
      this.renameError = ""
    },
    async submitRename() {
      const destination = this.renameDestination.trim()
      if (!destination) {
        this.renameError =
          this.renameKind === "folder"
            ? "新しいフォルダ prefix を入力してください"
            : "新しい object key を入力してください"
        return
      }
      this.renameSubmitting = true
      this.renameError = ""
      try {
        await requestJson(
          this.renameKind === "folder" ? renameFolderPath : renameObjectPath,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              this.renameKind === "folder"
                ? {
                    fromPrefix: this.renameSource,
                    toPrefix: destination,
                  }
                : { fromKey: this.renameSource, toKey: destination },
            ),
          },
        )
        this.renameSubmitting = false
        this.closeRenameModal()
        window.location.reload()
      } catch (error) {
        this.renameError = errorMessage(error)
        this.renameSubmitting = false
      }
    },

    async openPropertyModal(key: string) {
      this._closeAllModals()
      this.propertyKey = key
      this.propertyContentType = ""
      this.propertyError = ""
      this.propertyLoading = true
      this.propertySubmitting = false
      this.propertySize = 0
      this.propertyLastModified = ""
      this.propertyETag = ""
      this.propertyMetadata = ""
      this.propertyTags = []
      this.isPropertyModalOpen = true

      try {
        const [data, tagsData] = await Promise.allSettled([
          requestJson<{
            contentType: string
            size: number
            lastModified?: string
            eTag?: string
            metadata?: Record<string, string>
          }>(`${objectDetailsPath}?key=${encodeURIComponent(key)}`),
          requestJson<{ tags: { key: string; value: string }[] }>(
            `${objectTagsPath}?key=${encodeURIComponent(key)}`,
          ),
        ])

        if (data.status === "rejected") {
          throw data.reason
        }

        this.propertyContentType =
          data.value.contentType || "application/octet-stream"
        this.propertySize = data.value.size || 0
        this.propertyLastModified = data.value.lastModified
          ? new Date(data.value.lastModified)
              .toISOString()
              .slice(0, 19)
              .replace("T", " ")
          : ""
        this.propertyETag = data.value.eTag
          ? String(data.value.eTag).replace(/^"|"$/g, "")
          : ""
        this.propertyMetadata =
          data.value.metadata && Object.keys(data.value.metadata).length > 0
            ? JSON.stringify(data.value.metadata, null, 2)
            : ""

        if (tagsData.status === "fulfilled") {
          this.propertyTags = [...tagsData.value.tags]
        } else {
          this.propertyError = errorMessage(tagsData.reason)
          this.propertyTags = []
        }

        this.propertyLoading = false
        setTimeout(() => {
          const propInput = (this as unknown as AlpineMagic).$refs
            .propertyContentTypeInput as
            | (HTMLInputElement & { select?: () => void })
            | undefined
          propInput?.focus()
          propInput?.select?.()
        }, 0)
      } catch (error) {
        this.propertyError = errorMessage(error)
        this.propertyLoading = false
      }
    },
    closePropertyModal(force = false) {
      if (!force && (this.propertyLoading || this.propertySubmitting)) return
      this.isPropertyModalOpen = false
      this.propertyKey = ""
      this.propertyContentType = ""
      this.propertyError = ""
      this.propertyLoading = false
      this.propertySubmitting = false
      this.propertySize = 0
      this.propertyLastModified = ""
      this.propertyETag = ""
      this.propertyMetadata = ""
      this.propertyTags = []
    },
    addPropertyTag() {
      this.propertyTags.push({ key: "", value: "" })
    },
    removePropertyTag(index: number) {
      this.propertyTags.splice(index, 1)
    },
    async saveProperties() {
      const contentType = this.propertyContentType.trim()
      if (!contentType) {
        this.propertyError = "Content-Type を入力してください"
        return
      }
      this.propertySubmitting = true
      this.propertyError = ""
      try {
        await Promise.all([
          requestJson(objectPropertiesPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: this.propertyKey, contentType }),
          }),
          requestJson(objectTagsPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: this.propertyKey,
              tags: this.propertyTags.filter((t) => t.key.trim()),
            }),
          }),
        ])
        this.propertySubmitting = false
        this.closePropertyModal()
        window.location.reload()
      } catch (error) {
        this.propertyError = errorMessage(error)
        this.propertySubmitting = false
      }
    },

    openActionMenu(event: Event, dataset: DOMStringMap) {
      const currentTarget = event.currentTarget as HTMLElement
      const nextRenameSource = dataset.menuRenameSource || ""
      const isSameMenu =
        this.actionMenuOpen &&
        this.actionMenuKind === (dataset.menuKind || "") &&
        this.actionMenuRenameSource === nextRenameSource

      if (isSameMenu) {
        this.closeActionMenu()
        return
      }

      const menuWidth = 184
      const menuHeight = dataset.menuKind === "file" ? 188 : 108
      const viewportPadding = 8
      const rect = currentTarget.getBoundingClientRect()
      let left = rect.right - menuWidth
      if (left < viewportPadding) left = viewportPadding
      if (left + menuWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - menuWidth - viewportPadding
      }

      let top = rect.bottom + 6
      if (top + menuHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - menuHeight - 6)
      }

      this.actionMenuKind = dataset.menuKind || ""
      this.actionMenuRenameSource = nextRenameSource
      this.actionMenuObjectKey = dataset.menuObjectKey || ""
      this.actionMenuDownloadUrl = dataset.menuDownloadUrl || ""
      this.actionMenuResourceName = dataset.menuResourceName || ""
      this.actionMenuDeleteUrl = dataset.menuDeleteUrl || ""
      this.actionMenuDeleteMethod = dataset.menuDeleteMethod || "DELETE"
      this.actionMenuDeleteBody = dataset.menuDeleteBody || ""
      this.actionMenuDetailText = dataset.menuDetailText || ""
      this.actionMenuContentType = dataset.menuContentType || ""
      this.actionMenuOnSuccess =
        dataset.menuOnSuccess === "remove-row" ? "remove-row" : "reload"
      this.actionMenuX = left
      this.actionMenuY = top
      this.actionMenuOpen = true
    },
    closeActionMenu() {
      this.actionMenuOpen = false
    },
    openRenameFromActionMenu() {
      if (!this.actionMenuRenameSource) return
      const kind = this.actionMenuKind === "folder" ? "folder" : "file"
      const source = this.actionMenuRenameSource
      this.closeActionMenu()
      this.openRenameModal(kind, source)
    },
    openPropertyFromActionMenu() {
      if (!this.actionMenuObjectKey) return
      const key = this.actionMenuObjectKey
      this.closeActionMenu()
      this.openPropertyModal(key)
    },
    openDeleteFromActionMenu() {
      if (!this.actionMenuDeleteUrl) return
      const detail = {
        resourceName: this.actionMenuResourceName,
        detailText: this.actionMenuDetailText,
        deleteUrl: this.actionMenuDeleteUrl,
        method: this.actionMenuDeleteMethod,
        body: this.actionMenuDeleteBody,
        contentType: this.actionMenuContentType,
        onSuccess: this.actionMenuOnSuccess,
      }
      this.closeActionMenu()
      openDeleteModal(detail)
    },
  }
}

export function createS3PreviewController(
  _el: HTMLElement,
  props: S3PreviewProps,
) {
  return {
    async init() {
      if (props.mode !== "pdf") return

      const statusEl = document.getElementById("pdf-preview-status")
      const pagesEl = document.getElementById("pdf-preview-pages")

      if (!statusEl || !pagesEl) return

      try {
        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "/public/assets/pdf.worker.min.mjs"

        const pdf = await pdfjsLib.getDocument({ url: props.downloadHref })
          .promise
        statusEl.textContent = `${pdf.numPages} ページを読み込みました`

        const outputScale = window.devicePixelRatio || 1
        const containerWidth = pagesEl.clientWidth || 960
        const maxCssScale = 2

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber)
          const baseViewport = page.getViewport({ scale: 1 })
          const cssScale = Math.min(
            containerWidth / baseViewport.width,
            maxCssScale,
          )
          const cssViewport = page.getViewport({ scale: cssScale })

          const canvas = document.createElement("canvas")
          const context = canvas.getContext("2d")
          if (!context) {
            throw new Error("Canvas rendering is unavailable")
          }

          canvas.width = Math.floor(cssViewport.width * outputScale)
          canvas.height = Math.floor(cssViewport.height * outputScale)
          canvas.style.width = `${Math.floor(cssViewport.width)}px`
          canvas.style.height = `${Math.floor(cssViewport.height)}px`
          canvas.className = "s3-preview-page__pdf-page"

          const section = document.createElement("section")
          section.className = "s3-preview-page__pdf-sheet"

          const label = document.createElement("p")
          label.className = "s3-preview-page__pdf-label"
          label.textContent = `Page ${pageNumber}`

          section.appendChild(label)
          section.appendChild(canvas)
          pagesEl.appendChild(section)

          const transform: number[] | undefined =
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : undefined
          await page.render({
            canvasContext: context,
            canvas,
            viewport: cssViewport,
            transform,
          }).promise
        }
      } catch (error) {
        statusEl.textContent =
          error instanceof Error
            ? error.message
            : "PDF をプレビューできませんでした"
        statusEl.classList.add("s3-preview-page__pdf-status--error")
      }
    },
  }
}
