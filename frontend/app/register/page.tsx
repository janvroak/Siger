"use client";

import { BookOpenCheck, GraduationCap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthLayout, PasswordInput } from "@/components/AuthLayout";
import { Button, cn } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { Callout } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ApiError, register } from "@/lib/api";

const registrationRoles = ["Student", "Professor"] as const;

const ROLE_INFO: Record<(typeof registrationRoles)[number], { icon: LucideIcon; label: string; body: string }> = {
  Student: { icon: GraduationCap, label: "Student", body: "Submit work, see grades and ask the course assistant" },
  Professor: { icon: BookOpenCheck, label: "Faculty", body: "Create assignments, review AI grades, see analytics" },
};

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof registrationRoles)[number]>(
    registrationRoles[0],
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await register({ fullName, email, password, role });
      toast.success("Account created", "Sign in with your new account.");
      router.replace("/login");
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Unable to create your account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Choose your role. It decides which portal you see.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg">I am a</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {registrationRoles.map((option) => {
              const info = ROLE_INFO[option];
              const selected = role === option;
              return (
                <label
                  key={option}
                  className={cn(
                    "relative flex cursor-pointer flex-col rounded-lg border p-3 transition-colors duration-150",
                    "focus-within:ring-[3px] focus-within:ring-accent/20",
                    selected ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option}
                    checked={selected}
                    onChange={() => setRole(option)}
                    className="sr-only"
                  />
                  <info.icon size={18} className={selected ? "text-accent-text" : "text-muted"} aria-hidden />
                  <span className="mt-2 text-sm font-semibold text-fg">{info.label}</span>
                  <span className="mt-0.5 text-xs leading-snug text-muted">{info.body}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="Full name">
          <input
            className={inputClass}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@university.edu"
            required
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-medium text-accent-text underline-offset-4 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
