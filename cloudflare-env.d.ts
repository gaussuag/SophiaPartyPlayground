declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPERATOR_IDS?: string;
    ADMIN_IDS?: string;
    IDENTITY_SOURCE?: "sites-dispatch";
    EVENT_ID?: string;
  }
}
