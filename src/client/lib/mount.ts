export type AlpineComponentFactory<Props = unknown> = (
  el: HTMLElement,
  props: Props,
) => Record<string, unknown>

export type AlpineRegistry = Record<string, AlpineComponentFactory<any>>

export function readComponentProps<Props>(el: HTMLElement): Props {
  const script = [...el.children].find(
    (child): child is HTMLScriptElement =>
      child instanceof HTMLScriptElement &&
      child.dataset.flociProps !== undefined,
  )

  if (!script?.textContent) {
    return {} as Props
  }

  try {
    return JSON.parse(script.textContent) as Props
  } catch (err) {
    console.error(
      `[floci] Failed to parse props for component "${el.dataset.flociComponent}":`,
      err,
    )
    return {} as Props
  }
}

export function createMount(registry: AlpineRegistry) {
  return function mount(el: HTMLElement): Record<string, unknown> {
    const componentName = el.dataset.flociComponent
    if (!componentName) return {}

    const factory = registry[componentName]
    if (!factory) {
      throw new Error(`Unknown floci component: ${componentName}`)
    }

    return factory(el, readComponentProps(el))
  }
}
