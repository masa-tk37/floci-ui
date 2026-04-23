export function queueNameFromUrl(url: string): string {
  return url.split("/").pop() ?? url
}
