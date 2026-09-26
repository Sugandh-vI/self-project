"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setUsername, type SetUsernameResult } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Continue"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState<SetUsernameResult, FormData>(
    setUsername,
    undefined
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label htmlFor="username" className="text-sm font-medium">
        Choose your username
      </label>
      <input
        id="username"
        name="username"
        required
        minLength={3}
        maxLength={20}
        pattern="[a-zA-Z0-9_]+"
        placeholder="e.g. filmbuff_42"
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
