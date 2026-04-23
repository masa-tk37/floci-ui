interface S3ObjectListAlpineStateInit {
  bucket: string
  prefix: string
  fileKeys: string[]
  folderPrefixes: string[]
}

interface AlpineStatePaths {
  bucketPath: string
  objectDetailsPath: string
  renameObjectPath: string
  renameFolderPath: string
  objectPropertiesPath: string
}

/**
 * Encodes a value as JSON safe for embedding inside an HTML <script> block.
 * JSON.stringify alone does not escape </script>, which allows XSS if an
 * attacker controls the value (e.g. via S3 key names or URL parameters).
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function makeFolderModalSection(paths: AlpineStatePaths): string {
  const folderUrl = jsonForScript(`${paths.bucketPath}/folder`)
  return `
  isFolderModalOpen: false,
  folderName: '',
  folderError: '',
  folderSubmitting: false,

  openFolderModal() {
    this.closeActionMenu()
    this.closeUploadModal(true)
    this.closeRenameModal(true)
    this.closePropertyModal(true)
    this.folderName = ''
    this.folderError = ''
    this.isFolderModalOpen = true

    setTimeout(() => {
      this.$refs.folderNameInput?.focus()
    }, 0)
  },

  closeFolderModal(force = false) {
    if (!force && this.folderSubmitting) return
    this.isFolderModalOpen = false
    this.folderName = ''
    this.folderError = ''
  },

  async createFolder() {
    const folderName = this.folderName.trim()
    if (!folderName) {
      this.folderError = 'フォルダ名を入力してください'
      return
    }

    this.folderSubmitting = true
    this.folderError = ''

    try {
      const response = await fetch(${folderUrl}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: this.prefix,
          folderName,
        }),
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        this.folderError = data.error || 'フォルダを作成できませんでした'
        this.folderSubmitting = false
        return
      }

      this.folderSubmitting = false
      this.closeFolderModal()
      window.location.reload()
    } catch (error) {
      this.folderError = error.message || 'ネットワークエラーが発生しました'
      this.folderSubmitting = false
    }
  },`
}

function makeUploadModalSection(paths: AlpineStatePaths): string {
  const uploadUrl = jsonForScript(`${paths.bucketPath}/upload`)
  return `
  isUploadModalOpen: false,
  uploadFiles: [],
  uploadError: '',
  uploadSubmitting: false,

  openUploadModal() {
    this.closeActionMenu()
    this.closeFolderModal(true)
    this.closeRenameModal(true)
    this.closePropertyModal(true)
    this.uploadError = ''
    this.uploadFiles = []
    this.isUploadModalOpen = true

    if (this.$refs.uploadInput) {
      this.$refs.uploadInput.value = ''
    }
  },

  closeUploadModal(force = false) {
    if (!force && this.uploadSubmitting) return
    this.isUploadModalOpen = false
    this.uploadFiles = []
    this.uploadError = ''

    if (this.$refs.uploadInput) {
      this.$refs.uploadInput.value = ''
    }
  },

  onUploadSelection(event) {
    this.uploadFiles = Array.from(event.target.files || [])
    this.uploadError = ''
  },

  async upload() {
    if (this.uploadFiles.length === 0) {
      this.uploadError = 'ファイルを選択してください'
      return
    }

    this.uploadSubmitting = true
    this.uploadError = ''

    try {
      const formData = new FormData()
      formData.append('prefix', this.prefix)
      for (const file of this.uploadFiles) {
        formData.append('files', file)
      }

      const response = await fetch(${uploadUrl}, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        this.uploadError = data.error || 'ファイルをアップロードできませんでした'
        this.uploadSubmitting = false
        return
      }

      this.uploadSubmitting = false
      this.closeUploadModal()
      window.location.reload()
    } catch (error) {
      this.uploadError = error.message || 'ネットワークエラーが発生しました'
      this.uploadSubmitting = false
    }
  },`
}

function makeRenameModalSection(paths: AlpineStatePaths): string {
  const renameFolderPath = jsonForScript(paths.renameFolderPath)
  const renameObjectPath = jsonForScript(paths.renameObjectPath)
  return `
  isRenameModalOpen: false,
  renameKind: 'file',
  renameSource: '',
  renameDestination: '',
  renameError: '',
  renameSubmitting: false,

  get renameTitle() {
    return this.renameKind === 'folder' ? 'フォルダ名変更' : 'ファイル名変更'
  },

  get renameDescription() {
    return this.renameKind === 'folder'
      ? 'プレフィックス全体を変更します。末尾の / は自動で補完されます。'
      : 'オブジェクト key 全体を変更します。別フォルダへの移動もここで行えます。'
  },

  openRenameModal(kind, source) {
    this.closeActionMenu()
    this.closeFolderModal(true)
    this.closeUploadModal(true)
    this.closePropertyModal(true)
    this.renameKind = kind
    this.renameSource = source
    this.renameDestination = source
    this.renameError = ''
    this.renameSubmitting = false
    this.isRenameModalOpen = true

    setTimeout(() => {
      this.$refs.renameInput?.focus()
      this.$refs.renameInput?.select?.()
    }, 0)
  },

  closeRenameModal(force = false) {
    if (!force && this.renameSubmitting) return
    this.isRenameModalOpen = false
    this.renameKind = 'file'
    this.renameSource = ''
    this.renameDestination = ''
    this.renameError = ''
  },

  async submitRename() {
    const destination = this.renameDestination.trim()
    if (!destination) {
      this.renameError = this.renameKind === 'folder'
        ? '新しいフォルダ prefix を入力してください'
        : '新しい object key を入力してください'
      return
    }

    this.renameSubmitting = true
    this.renameError = ''

    try {
      const response = await fetch(
        this.renameKind === 'folder'
          ? ${renameFolderPath}
          : ${renameObjectPath},
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            this.renameKind === 'folder'
              ? { fromPrefix: this.renameSource, toPrefix: destination }
              : { fromKey: this.renameSource, toKey: destination }
          ),
        },
      )
      const data = await response.json()

      if (!response.ok || data.error) {
        this.renameError = data.error || '名前を変更できませんでした'
        this.renameSubmitting = false
        return
      }

      this.renameSubmitting = false
      this.closeRenameModal()
      window.location.reload()
    } catch (error) {
      this.renameError = error.message || 'ネットワークエラーが発生しました'
      this.renameSubmitting = false
    }
  },`
}

function makePropertyModalSection(paths: AlpineStatePaths): string {
  const objectDetailsPath = jsonForScript(paths.objectDetailsPath)
  const objectPropertiesPath = jsonForScript(paths.objectPropertiesPath)
  return `
  isPropertyModalOpen: false,
  propertyKey: '',
  propertyContentType: '',
  propertyError: '',
  propertyLoading: false,
  propertySubmitting: false,
  propertySize: 0,
  propertyLastModified: '',
  propertyETag: '',
  propertyMetadata: '',

  async openPropertyModal(key) {
    this.closeActionMenu()
    this.closeFolderModal(true)
    this.closeUploadModal(true)
    this.closeRenameModal(true)
    this.propertyKey = key
    this.propertyContentType = ''
    this.propertyError = ''
    this.propertyLoading = true
    this.propertySubmitting = false
    this.propertySize = 0
    this.propertyLastModified = ''
    this.propertyETag = ''
    this.propertyMetadata = ''
    this.isPropertyModalOpen = true

    try {
      const response = await fetch(${objectDetailsPath} + '?key=' + encodeURIComponent(key))
      const data = await response.json()

      if (!response.ok || data.error) {
        this.propertyError = data.error || 'プロパティを読み込めませんでした'
        this.propertyLoading = false
        return
      }

      this.propertyContentType = data.contentType || 'application/octet-stream'
      this.propertySize = data.size || 0
      this.propertyLastModified = data.lastModified
        ? new Date(data.lastModified).toISOString().slice(0, 19).replace('T', ' ')
        : ''
      this.propertyETag = data.eTag
        ? String(data.eTag).replace(/^"|"$/g, '')
        : ''
      this.propertyMetadata = data.metadata && Object.keys(data.metadata).length > 0
        ? JSON.stringify(data.metadata, null, 2)
        : ''
      this.propertyLoading = false

      setTimeout(() => {
        this.$refs.propertyContentTypeInput?.focus()
        this.$refs.propertyContentTypeInput?.select?.()
      }, 0)
    } catch (error) {
      this.propertyError = error.message || 'ネットワークエラーが発生しました'
      this.propertyLoading = false
    }
  },

  closePropertyModal(force = false) {
    if (!force && (this.propertyLoading || this.propertySubmitting)) return
    this.isPropertyModalOpen = false
    this.propertyKey = ''
    this.propertyContentType = ''
    this.propertyError = ''
    this.propertyLoading = false
    this.propertySubmitting = false
    this.propertySize = 0
    this.propertyLastModified = ''
    this.propertyETag = ''
    this.propertyMetadata = ''
  },

  async saveProperties() {
    const contentType = this.propertyContentType.trim()
    if (!contentType) {
      this.propertyError = 'Content-Type を入力してください'
      return
    }

    this.propertySubmitting = true
    this.propertyError = ''

    try {
      const response = await fetch(${objectPropertiesPath}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: this.propertyKey,
          contentType,
        }),
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        this.propertyError = data.error || 'プロパティを更新できませんでした'
        this.propertySubmitting = false
        return
      }

      this.propertySubmitting = false
      this.closePropertyModal()
      window.location.reload()
    } catch (error) {
      this.propertyError = error.message || 'ネットワークエラーが発生しました'
      this.propertySubmitting = false
    }
  },`
}

function makeActionMenuSection(): string {
  return `
  actionMenuOpen: false,
  actionMenuKind: '',
  actionMenuRenameSource: '',
  actionMenuObjectKey: '',
  actionMenuDownloadUrl: '',
  actionMenuResourceName: '',
  actionMenuDeleteUrl: '',
  actionMenuDeleteMethod: 'DELETE',
  actionMenuDeleteBody: '',
  actionMenuDetailText: '',
  actionMenuContentType: '',
  actionMenuOnSuccess: 'reload',
  actionMenuX: 0,
  actionMenuY: 0,

  openActionMenu(event, dataset) {
    const nextRenameSource = dataset.menuRenameSource || ''
    const isSameMenu = this.actionMenuOpen &&
      this.actionMenuKind === (dataset.menuKind || '') &&
      this.actionMenuRenameSource === nextRenameSource

    if (isSameMenu) {
      this.closeActionMenu()
      return
    }

    const menuWidth = 184
    const menuHeight = dataset.menuKind === 'file' ? 188 : 108
    const viewportPadding = 8
    const rect = event.currentTarget.getBoundingClientRect()
    let left = rect.right - menuWidth
    if (left < viewportPadding) left = viewportPadding
    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - menuWidth - viewportPadding
    }

    let top = rect.bottom + 6
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - menuHeight - 6)
    }

    this.actionMenuKind = dataset.menuKind || ''
    this.actionMenuRenameSource = nextRenameSource
    this.actionMenuObjectKey = dataset.menuObjectKey || ''
    this.actionMenuDownloadUrl = dataset.menuDownloadUrl || ''
    this.actionMenuResourceName = dataset.menuResourceName || ''
    this.actionMenuDeleteUrl = dataset.menuDeleteUrl || ''
    this.actionMenuDeleteMethod = dataset.menuDeleteMethod || 'DELETE'
    this.actionMenuDeleteBody = dataset.menuDeleteBody || ''
    this.actionMenuDetailText = dataset.menuDetailText || ''
    this.actionMenuContentType = dataset.menuContentType || ''
    this.actionMenuOnSuccess = dataset.menuOnSuccess || 'reload'
    this.actionMenuX = left
    this.actionMenuY = top
    this.actionMenuOpen = true
  },

  closeActionMenu() {
    this.actionMenuOpen = false
  },

  openRenameFromActionMenu() {
    if (!this.actionMenuRenameSource) return
    const kind = this.actionMenuKind === 'folder' ? 'folder' : 'file'
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
    window.dispatchEvent(new CustomEvent('open-delete-modal', { detail }))
  },`
}

function makeSelectionAndBulkDelete(paths: AlpineStatePaths): string {
  const bulkDeleteUrl = jsonForScript(`${paths.bucketPath}/delete-objects`)
  return `
  selectedFiles: [],
  selectedFolders: [],

  get selectedCount() {
    return this.selectedFiles.length + this.selectedFolders.length
  },

  get hasSelection() {
    return this.selectedCount > 0
  },

  get allSelected() {
    return this.selectedCount > 0 &&
      this.selectedFiles.length === this.allFiles.length &&
      this.selectedFolders.length === this.allFolders.length
  },

  toggleAll(event) {
    if (event.target.checked) {
      this.selectedFiles = [...this.allFiles]
      this.selectedFolders = [...this.allFolders]
      return
    }

    this.selectedFiles = []
    this.selectedFolders = []
  },

  openBulkDelete() {
    if (!this.hasSelection) return

    window.dispatchEvent(new CustomEvent('open-delete-modal', {
      detail: {
        resourceName: this.selectedCount + ' 件の項目',
        detailText: this.selectedFolders.length > 0 ? '選択したフォルダは配下のオブジェクトも削除します。' : '',
        deleteUrl: ${bulkDeleteUrl},
        method: 'POST',
        body: JSON.stringify({
          files: this.selectedFiles,
          folders: this.selectedFolders,
        }),
        contentType: 'application/json',
        onSuccess: 'reload',
      }
    }))
  },`
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
