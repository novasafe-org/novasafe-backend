import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { cors } from "hono/cors";
import { HTTP } from "@/lib/constants";
import { isAppError } from "@/lib/errors";
import { isAdminFromHeader, verifyAdminFromHeader } from "@/lib/auth";
import { ok } from "@/lib/utils";
import { getConfig } from "@/types/config";
import type { AppConfig } from "@/types/config";
import type { AdminContext } from "@/types/auth";
import { requireMongo } from "@/middleware/requireMongo";
import type { MongoRepositories } from "@/repositories/types";
import { MongoClientError } from "@/repositories/client/errors";
import { ERROR_CODES } from "@/lib/constants";
import { loginBodySchema } from "@/schemas/auth.schema";
import {
  createPostBodySchema,
  updatePostBodySchema,
  listPostsQuerySchema,
  mongoIdParamSchema,
  slugParamSchema,
  createCategoryBodySchema,
  createTagBodySchema,
} from "@/schemas/blog-api.schema";
import { createAuthService } from "@/services/auth.service";
import { createMediaService } from "@/services/media.service";
import { createSeoFeedsService } from "@/services/seo-feeds.service";
import { toPostDto, toCategoryDto, toTagDto, toMediaDto } from "@/types/blog-api";
import { asObjectId } from "@/types/documents/common";
import type { CreatePostInput, ListPostsFilter } from "@/types/documents/post";
import type { CreateCategoryInput } from "@/types/documents/category";
import type { CreateTagInput } from "@/types/documents/tag";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { buildHealthResponse, isReady } from "@/lib/health";

type AppVariables = {
  config: AppConfig;
  repos?: MongoRepositories;
  admin?: AdminContext;
};

const withMongo = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  c.set("repos", await requireMongo());
  await next();
});

/** API routes (paths relative to /api or /api/v1 mount point). */
function createApiRouter(): Hono<{ Variables: AppVariables }> {
  const api = new Hono<{ Variables: AppVariables }>();

  api.get("/health", async (c) => {
    const body = await buildHealthResponse();
    return c.json(ok(body));
  });

  api.get("/health/ready", async (c) => {
    const ready = await isReady();
    return c.json(ok({ ready, timestamp: new Date().toISOString() }));
  });

  api.post("/auth/login", async (c) => {
    const body = await c.req.json();
    const input = loginBodySchema.parse(body);
    const auth = createAuthService(c.get("config"));
    const result = await auth.login(input);
    return c.json(ok(result));
  });

  api.post("/auth/logout", (c) => c.json(ok({ message: "Logged out" })));

  api.get("/auth/me", async (c) => {
    const admin = await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    return c.json(ok({ admin }));
  });

  api.get("/posts", withMongo, async (c) => {
    const repos = c.get("repos")!;
    const query = listPostsQuerySchema.parse(c.req.query());
    const isAdmin = await isAdminFromHeader(c.req.header("Authorization"), c.get("config"));

    const pagination = { page: query.page, perPage: query.perPage };
    const filter: ListPostsFilter = {
      status: query.status,
      category_id: query.category_id ? asObjectId(query.category_id) : undefined,
      tag_id: query.tag_id ? asObjectId(query.tag_id) : undefined,
      author_id: query.author_id,
      q: query.q,
    };

    const result = isAdmin
      ? await repos.posts.list(filter, pagination)
      : await repos.posts.listPublished(filter, pagination);

    return c.json(
      ok(result.items.map(toPostDto), {
        page: result.page,
        perPage: result.perPage,
        total: result.total,
        totalPages: result.totalPages,
      }),
    );
  });

  api.post("/posts", withMongo, async (c) => {
    const repos = c.get("repos")!;
    const admin = await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const body = createPostBodySchema.parse(await c.req.json());

    const input = {
      title: body.title,
      excerpt: body.excerpt ?? null,
      content_markdown: body.content_markdown,
      featured_image: body.featured_image ?? null,
      status: body.status,
      category_id: body.category_id ? asObjectId(body.category_id) : null,
      tag_ids: (body.tag_ids ?? []).map(asObjectId),
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
      canonical_url: body.canonical_url ?? null,
      author: body.author ?? {
        id: admin.id,
        name: admin.email,
        email: admin.email,
      },
      published_at: body.published_at ? new Date(body.published_at) : null,
      ...(body.slug ? { slug: body.slug } : {}),
    } as CreatePostInput;

    const post = await repos.posts.create(input);
    return c.json(ok(toPostDto(post)), 201);
  });

  api.get("/posts/id/:id", withMongo, async (c) => {
    const repos = c.get("repos")!;
    const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
    const post = await repos.posts.findById(parsed.id);
    if (!post) throw new NotFoundError("Post");

    const isAdmin = await isAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    if (!isAdmin && !repos.posts.isPubliclyVisible(post)) {
      throw new NotFoundError("Post");
    }

    return c.json(ok(toPostDto(post)));
  });

  api.put("/posts/:id", withMongo, async (c) => {
    const repos = c.get("repos")!;
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
    const body = updatePostBodySchema.parse(await c.req.json());
    const patch: Parameters<typeof repos.posts.update>[1] = {};

    if (body.title !== undefined) patch.title = body.title;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.excerpt !== undefined) patch.excerpt = body.excerpt;
    if (body.content_markdown !== undefined) patch.content_markdown = body.content_markdown;
    if (body.featured_image !== undefined) patch.featured_image = body.featured_image;
    if (body.status !== undefined) patch.status = body.status;
    if (body.category_id !== undefined) {
      patch.category_id = body.category_id ? asObjectId(body.category_id) : null;
    }
    if (body.tag_ids !== undefined) patch.tag_ids = body.tag_ids.map(asObjectId);
    if (body.seo_title !== undefined) patch.seo_title = body.seo_title;
    if (body.seo_description !== undefined) patch.seo_description = body.seo_description;
    if (body.canonical_url !== undefined) patch.canonical_url = body.canonical_url;
    if (body.published_at !== undefined) {
      patch.published_at = body.published_at ? new Date(body.published_at) : null;
    }

    const post = await repos.posts.update(parsed.id, patch);
    return c.json(ok(toPostDto(post)));
  });

  api.delete("/posts/:id", withMongo, async (c) => {
    const repos = c.get("repos")!;
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
    await repos.posts.delete(parsed.id);
    return c.body(null, 204);
  });

  api.get("/posts/:slug", withMongo, async (c) => {
    const repos = c.get("repos")!;
    const slug = c.req.param("slug");

    if (slug === "id") throw new NotFoundError("Post");

    const parsed = slugParamSchema.safeParse({ slug });
    if (!parsed.success) throw new NotFoundError("Post");

    const post = await repos.posts.findBySlugOrPrevious(parsed.data.slug);
    if (!post) throw new NotFoundError("Post");

    const isAdmin = await isAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    if (!isAdmin && !repos.posts.isPubliclyVisible(post)) {
      throw new NotFoundError("Post");
    }

    const meta = post.slug !== parsed.data.slug ? { redirect_slug: post.slug } : undefined;
    return c.json(ok(toPostDto(post), meta));
  });

  api.get("/categories", withMongo, async (c) => {
    const categories = await c.get("repos")!.categories.list();
    return c.json(ok(categories.map(toCategoryDto)));
  });

  api.post("/categories", withMongo, async (c) => {
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const parsed = createCategoryBodySchema.parse(await c.req.json());
    const category = await c.get("repos")!.categories.create({
      name: parsed.name,
      slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
      description: parsed.description ?? null,
    } as CreateCategoryInput);
    return c.json(ok(toCategoryDto(category)), 201);
  });

  api.get("/tags", withMongo, async (c) => {
    const tags = await c.get("repos")!.tags.list();
    return c.json(ok(tags.map(toTagDto)));
  });

  api.post("/tags", withMongo, async (c) => {
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const parsed = createTagBodySchema.parse(await c.req.json());
    const tag = await c.get("repos")!.tags.create({
      name: parsed.name,
      slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
    } as CreateTagInput);
    return c.json(ok(toTagDto(tag)), 201);
  });

  api.get("/media", withMongo, async (c) => {
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const query = listPostsQuerySchema.parse(c.req.query());
    const result = await c.get("repos")!.media.list({}, { page: query.page, perPage: query.perPage });
    return c.json(
      ok(result.items.map(toMediaDto), {
        page: result.page,
        perPage: result.perPage,
        total: result.total,
        totalPages: result.totalPages,
      }),
    );
  });

  api.post("/media/upload", withMongo, async (c) => {
    const repos = c.get("repos")!;
    const admin = await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const form = await c.req.parseBody();
    const file = form.file;

    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart field name: file)");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const altText = typeof form.altText === "string" ? form.altText : undefined;
    const requestUrl = new URL(c.req.url).toString();

    const mediaService = createMediaService(c.get("config"), repos);
    const media = await mediaService.upload(
      {
        buffer,
        filename: file.name,
        mimeType: file.type,
        size: buffer.length,
        altText,
      },
      admin,
      requestUrl,
    );

    return c.json(ok(toMediaDto(media)), 201);
  });

  api.delete("/media/unused", withMongo, async (c) => {
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const removed = await createMediaService(c.get("config"), c.get("repos")!).deleteUnused();
    return c.json(ok({ removed }));
  });

  api.get("/media/:id", withMongo, async (c) => {
    const repos = c.get("repos")!;
    const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
    const asset = await repos.media.findById(parsed.id);
    if (!asset) throw new NotFoundError("Media");

    const mediaService = createMediaService(c.get("config"), repos);
    const { buffer, mimeType } = await mediaService.serveBuffer(asset);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  api.delete("/media/:id", withMongo, async (c) => {
    await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
    const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
    const force = c.req.query("force") === "true";
    await createMediaService(c.get("config"), c.get("repos")!).delete(parsed.id, { force });
    return c.body(null, 204);
  });

  api.get("/seo/sitemap", withMongo, async (c) => {
    const xml = await createSeoFeedsService(c.get("config"), c.get("repos")!).buildSitemapXml();
    return c.body(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  api.get("/seo/robots", withMongo, (c) => {
    const text = createSeoFeedsService(c.get("config"), c.get("repos")!).buildRobotsTxt();
    return c.body(text, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    });
  });

  api.get("/seo/feed", withMongo, async (c) => {
    const xml = await createSeoFeedsService(c.get("config"), c.get("repos")!).buildRssXml();
    return c.body(xml, 200, {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    });
  });

  return api;
}

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", async (c, next) => {
  c.set("config", getConfig());
  await next();
});

app.use("*", async (c, next) => {
  const config = c.get("config");
  const origins = config.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return cors({
    origin: origins.includes("*") ? "*" : origins,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

app.onError((err, c) => {
  if (err instanceof MongoClientError) {
    return c.json(
      { success: false, error: { code: err.code, message: err.message } },
      err.status as 400,
    );
  }
  if (isAppError(err)) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      err.status as 400,
    );
  }
  console.error(err);
  return c.json(
    {
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: "An unexpected error occurred" },
    },
    HTTP.INTERNAL,
  );
});

const apiRouter = createApiRouter();
// Mount under /api and /api/v1 (CMS uses /api/v1; rewrites do not rewrite the path Hono sees)
app.route("/api", apiRouter);
app.route("/api/v1", apiRouter);

export { app };
