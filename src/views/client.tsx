import { Html } from "@elysiajs/html"

const ESCAPE_MAP: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
}

/**
 * Encodes a value as JSON safe for embedding inside an HTML <script> block.
 * JSON.stringify alone does not escape </script>, which allows XSS if an
 * attacker controls the value.
 */
export function serializeClientProps(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => ESCAPE_MAP[c] ?? c,
  )
}

export function mountComponentAttrs(name: string) {
  return {
    "data-floci-component": name,
    "x-data": "mount($el)",
  }
}

export function ClientProps({ props }: { props: unknown }) {
  return (
    <script type="application/json" data-floci-props>
      {serializeClientProps(props)}
    </script>
  )
}
