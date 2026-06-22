import type { PostDocument } from "@/types/documents/post";
import type { AppConfig } from "@/types/config";
import { escapeXml, toRssDate, toSitemapDate } from "@/lib/feeds/xml";
import { getSiteConfig, sitePath, type SiteConfig } from "@/lib/site";
import type { MongoRepositories } from "@/repositories/types";

const CMS_DISALLOW = [
  "/editor",
  "/posts",
  "/media",
  "/settings",
  "/seo",
  "/analytics",
  "/team",
  "/ai",
];

export class SeoFeedsService {
  private readonly site: SiteConfig;

  constructor(
    _config: AppConfig,
    private readonly mongo: MongoRepositories,
    siteConfig?: SiteConfig,
  ) {
    this.site = siteConfig ?? getSiteConfig(_config);
  }

  async fetchPublishedPosts(): Promise<PostDocument[]> {
    const perPage = 100;
    let page = 1;
    const all: PostDocument[] = [];

    while (true) {
      const result = await this.mongo.posts.listPublished({}, { page, perPage });
      all.push(...result.items);
      if (page >= result.totalPages) break;
      page += 1;
    }

    return all;
  }

  async buildSitemapXml(): Promise<string> {
    const posts = await this.fetchPublishedPosts();
    const urls: string[] = [];

    urls.push(this.urlEntry(sitePath(this.site, "/"), { changefreq: "weekly", priority: "1.0" }));
    urls.push(this.urlEntry(sitePath(this.site, "/blog"), { changefreq: "daily", priority: "0.9" }));

    for (const post of posts) {
      const lastmod = post.updated_at ?? post.published_at ?? post.created_at;
      urls.push(
        this.urlEntry(sitePath(this.site, `/blog/${post.slug}`), {
          lastmod: toSitemapDate(lastmod),
          changefreq: "monthly",
          priority: "0.8",
        }),
      );
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }

  buildRobotsTxt(): string {
    const lines = [
      "User-agent: *",
      "Allow: /",
      "Allow: /blog",
      ...CMS_DISALLOW.map((path) => `Disallow: ${path}`),
      "",
      `Sitemap: ${sitePath(this.site, "/sitemap.xml")}`,
    ];
    return `${lines.join("\n")}\n`;
  }

  async buildRssXml(): Promise<string> {
    const posts = await this.fetchPublishedPosts();
    const feedUrl = sitePath(this.site, "/feed.xml");
    const blogUrl = sitePath(this.site, "/blog");

    const items = posts
      .map((post) => {
        const pubDate = post.published_at ?? post.created_at;
        const link = sitePath(this.site, `/blog/${post.slug}`);
        const description = post.excerpt ?? post.seo_description ?? "";
        const content = post.content_markdown.slice(0, 5000);

        return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${toRssDate(pubDate)}</pubDate>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[${content}]]></content:encoded>
      <dc:creator>${escapeXml(post.author.name)}</dc:creator>
    </item>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(this.site.name)}</title>
    <link>${escapeXml(blogUrl)}</link>
    <description>${escapeXml(this.site.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${toRssDate(new Date())}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  }

  private urlEntry(
    loc: string,
    opts: { lastmod?: string; changefreq?: string; priority?: string },
  ): string {
    const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
    if (opts.lastmod) parts.push(`    <lastmod>${opts.lastmod}</lastmod>`);
    if (opts.changefreq) parts.push(`    <changefreq>${opts.changefreq}</changefreq>`);
    if (opts.priority) parts.push(`    <priority>${opts.priority}</priority>`);
    parts.push(`  </url>`);
    return parts.join("\n");
  }
}

export function createSeoFeedsService(
  config: AppConfig,
  mongo: MongoRepositories,
): SeoFeedsService {
  return new SeoFeedsService(config, mongo);
}
