import { useRef, useState } from "react";
import { actions, isInputError } from "astro:actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENTS, type SignupFormStartedProps, type SignupFormSubmittedProps } from "@/lib/posthog/events";

interface SignupFormProps {
  variantId: string;
}

export default function SignupForm({ variantId }: SignupFormProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedFields = useRef(new Set<string>());
  const mountedAt = useRef(performance.now());

  function trackFieldStarted(fieldName: string) {
    if (startedFields.current.has(fieldName)) return;
    startedFields.current.add(fieldName);

    window.__ph?.capture(EVENTS.SIGNUP_FORM_STARTED, {
      field_name: fieldName,
      time_to_interaction: performance.now() - mountedAt.current,
    } satisfies SignupFormStartedProps);
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const { error } = await actions.signup(formData);

    if (error) {
      const errorCode = isInputError(error) ? "validation_error" : error.code;
      window.__ph?.capture(EVENTS.SIGNUP_FORM_SUBMITTED, {
        validation_success: false,
        error_code: errorCode,
      } satisfies SignupFormSubmittedProps);
      setStatus("error");
      setErrorMessage("Something went wrong — please check your email and try again.");
      return;
    }

    window.__ph?.capture(EVENTS.SIGNUP_FORM_SUBMITTED, {
      validation_success: true,
    } satisfies SignupFormSubmittedProps);
    setStatus("success");
  }

  if (status === "success") {
    return (
      <p role="status" className="text-center text-text-brand">
        You're in — check your inbox to get started.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-4">
      <input type="hidden" name="variantId" value={variantId} />

      <div className="flex flex-col gap-1.5 text-left">
        <Label htmlFor="signup-name">Name (optional)</Label>
        <Input
          id="signup-name"
          name="name"
          autoComplete="name"
          onFocus={() => trackFieldStarted("name")}
        />
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          onFocus={() => trackFieldStarted("email")}
        />
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-text-error">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={status === "submitting"}
        className="bg-btn-bg-primary-active text-btn-text hover:bg-btn-bg-primary-hover"
        data-cta-location="signup_form"
        data-cta-text="Create my free account"
        data-cta-variant={variantId}
      >
        {status === "submitting" ? "Creating your account…" : "Create my free account"}
      </Button>
    </form>
  );
}
