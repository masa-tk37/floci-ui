import { Html } from "@elysiajs/html"

/** Renders against the `tags` array and `addTag`/`removeTag` that `tagMixin` adds to the enclosing controller. */
export function TagEditor() {
  return (
    <div class="query-form">
      <div class="tag-editor__header">
        <h2 class="section-title tag-editor__title">タグ</h2>
        <button type="button" class="btn btn--sm" {...{ "@click": "addTag()" }}>
          + タグを追加
        </button>
      </div>
      <p class="muted tag-editor__empty" x-show="tags.length === 0" x-cloak>
        タグなし
      </p>
      <template x-for="(tag, i) in tags" {...{ ":key": "i" }}>
        <div class="tag-editor__row">
          <div class="form-row">
            <label class="form-label">キー</label>
            <input
              type="text"
              class="input"
              x-model="tag.key"
              placeholder="Environment"
            />
          </div>
          <div class="form-row">
            <label class="form-label">値</label>
            <input
              type="text"
              class="input"
              x-model="tag.value"
              placeholder="dev"
            />
          </div>
          <button
            type="button"
            class="btn btn--danger-ghost btn--sm tag-editor__remove"
            {...{ "@click": "removeTag(i)" }}
          >
            ✕
          </button>
        </div>
      </template>
    </div>
  )
}
