/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    distinctId: string;
    heroVariant: string;
    posthogBootstrap: {
      distinctID: string;
      featureFlags: Record<string, string | boolean>;
    };
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_POSTHOG_KEY: string;
  readonly PUBLIC_POSTHOG_HOST: string;
  readonly POSTHOG_PERSONAL_API_KEY?: string;
  readonly DATABASE_URL: string;
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly PUBLIC_SITE_URL: string;
  readonly ADMIN_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
