"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthLayout, PasswordInput } from "@/components/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { Callout } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { saveToken } from "@/lib/auth";
import { ApiError, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await login(email, password);
      saveToken(response.access_token);
      toast.success(response.role === "professor" ? "Signed in to the faculty portal" : "Signed in to the student portal");
      router.replace("/dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your student or faculty portal. Your role comes from your account."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error ? (
          <Callout tone="danger" title="Couldn't sign you in">
            {error}
          </Callout>
        ) : null}
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@university.edu"
            aria-invalid={!!error || undefined}
            autoFocus
            required
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-invalid={!!error || undefined}
            required
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting ? <ArrowRight size={16} aria-hidden /> : null}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        New to Siger?{" "}
        <Link className="font-medium text-accent-text underline-offset-4 hover:underline" href="/register">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
