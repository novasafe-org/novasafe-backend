import type { Express } from "express";

import { createBlogImagesProxyRoutes } from "./blog-images-proxy.routes";

export const BLOG_IMAGES_PROXY_PATH = "/blog-images";

/** Public blog featured images — GET /api/v1/blog-images/:fileId (proxied to admin-api). */
export const registerBlogImagesProxyModule = (app: Express, apiPrefix: string): void => {
  const routes = createBlogImagesProxyRoutes();
  app.use(`${apiPrefix}${BLOG_IMAGES_PROXY_PATH}`, routes);
};
