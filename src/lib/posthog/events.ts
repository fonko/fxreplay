/** Analytics event taxonomy — CLAUDE.md ss4. Keep names/properties in sync with that table. */

export const EVENTS = {
  LANDING_PAGE_VIEWED: "landing_page_viewed",
  CTA_CLICKED: "cta_clicked",
  SIGNUP_FORM_STARTED: "signup_form_started",
  SIGNUP_FORM_SUBMITTED: "signup_form_submitted",
  ACCOUNT_CREATED: "account_created",
} as const;

export interface LandingPageViewedProps {
  referrer: string;
  utm_source: string | null;
  variant_id: string;
  device_type: "mobile" | "tablet" | "desktop";
}

export interface CtaClickedProps {
  cta_location: string;
  button_text: string;
  variant_id: string;
}

export interface SignupFormStartedProps {
  field_name: string;
  time_to_interaction: number;
}

export interface SignupFormSubmittedProps {
  validation_success: boolean;
  error_code?: string;
}

export interface AccountCreatedProps {
  user_id: string;
  conversion_time_seconds: number | null;
  variant_id: string;
}
