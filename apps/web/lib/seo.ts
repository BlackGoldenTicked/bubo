/**
 * @purpose Centralize SEO constants for the bubo marketing site.
 * @role    Shared source for metadata, robots, sitemap, manifest, and JSON-LD.
 * @gotcha  Keep SITE_URL in sync with the canonical production Cloudflare Pages domain.
 */

export const SITE_URL = "https://bubomoney.pages.dev"
export const SITE_NAME = "bubo"
export const SITE_TITLE = "bubo — 本地优先的个人财务与记账工具"
export const SITE_DESCRIPTION =
  "bubo 是本地优先的个人财务工具，用 AI Agent 导入账单，记录流水、账户余额、订阅与贷款。只呈现，不替你判断；只记录，不强行对账。"
export const GITHUB_URL = "https://github.com/BlackGoldenTicked/bubo"
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`
export const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`
export const DOWNLOAD_URL = GITHUB_LATEST_RELEASE_URL
export const SITE_ICON_URL = "/app-icon.png"
export const OG_IMAGE_URL = "/og-image.png"

export const SEO_KEYWORDS = [
  "bubo",
  "本地记账",
  "个人财务",
  "账单导入",
  "AI 记账",
  "订阅管理",
  "贷款管理",
  "本地优先",
  "财务仪表盘",
]
