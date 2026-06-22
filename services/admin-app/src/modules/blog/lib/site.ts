import type { AppConfig } from "@/types/config";

export type SiteConfig = {
  url: string;
  name: string;
  description: string;
};

export function getSiteConfig(config: AppConfig): SiteConfig {
  const url = config.SITE_URL.replace(/\/$/, "");
  return {
    url,
    name: config.SITE_NAME,
    description: config.SITE_DESCRIPTION,
  };
}

export function sitePath(site: SiteConfig, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${site.url}${normalized}`;
}
