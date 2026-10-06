declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BOOTSTRAP_ADMIN?: string;
    GITHUB_TOKEN?: string;
    OWNER_GITHUB_LOGIN?: string;
    OWNER_GITHUB_ID?: string;
  }
}
