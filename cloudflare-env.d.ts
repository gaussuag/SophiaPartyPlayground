declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPERATOR_IDS?: string;
    ADMIN_IDS?: string;
    ACCEPTANCE_EVENT_ID?: string;
    INITIALIZATION_ENABLED?: string;
    IDENTITY_SOURCE?: "sites-dispatch";
    EVENT_ID?: string;
  }
}
