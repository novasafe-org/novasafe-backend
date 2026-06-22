export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toSitemapDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toRssDate(date: Date): string {
  return date.toUTCString();
}
