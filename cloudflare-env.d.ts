declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BOOTSTRAP_ADMIN?: string;
    GITHUB_TOKEN?: string;
  }
}
