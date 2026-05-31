import { Html } from "@elysiajs/html"
import { escapeHtml } from "@kitajs/html"

import { IconSearch } from "./icons"
import { mountComponentAttrs } from "./client"

export interface ResourceRailItem {
  label: string
  href: string
  active?: boolean
  filterText?: string
  meta?: JSX.Element | string | null
}

interface ResourceRailProps {
  title: string
  searchPlaceholder: string
  items: ResourceRailItem[]
  emptyLabel: string
}

export function ResourceRail({
  title,
  searchPlaceholder,
  items,
  emptyLabel,
}: ResourceRailProps) {
  return (
    <aside class="resource-rail" {...mountComponentAttrs("list-filter")}>
      <div class="resource-rail__head">
        <h2 class="resource-rail__title">{title}</h2>
        {items.length > 0 ? <span class="badge">{items.length}</span> : null}
      </div>
      <label class="list-filter list-filter--compact">
        <span class="list-filter__icon">{IconSearch}</span>
        <input
          type="search"
          class="input list-filter__input"
          placeholder={searchPlaceholder}
          {...{ "x-model.debounce.120ms": "query" }}
        />
      </label>
      <nav class="resource-rail__list">
        {items.map((item) => (
          <a
            href={item.href}
            class={`resource-rail__link${item.active ? " is-active" : ""}`}
            data-filter-text={escapeHtml(item.filterText ?? item.label)}
            x-show="matches($el.dataset.filterText)"
          >
            <span class="resource-rail__label" safe>
              {item.label}
            </span>
            {item.meta ? (
              <span class="resource-rail__meta">{item.meta}</span>
            ) : null}
          </a>
        ))}
        <p
          class="empty-state empty-state--plain resource-rail__empty"
          x-show="hasQuery && visibleCount === 0"
          x-cloak
        >
          {emptyLabel}
        </p>
      </nav>
    </aside>
  )
}
