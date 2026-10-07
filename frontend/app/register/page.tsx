"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiError, register } from "@/lib/api";

const registrationRoles = ["Student", "Professor"] as const;

export default function RegisterPage() {
  const router = useRouter();
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
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4 rounded border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div>
          <h1 className="text-xl font-semibold">Create your Siger account</h1>
        </div>
        <label className="block text-sm">
          Full Name
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="block text-sm">
          Role
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as (typeof registrationRoles)[number])
            }
          >
            {registrationRoles.map((registrationRole) => (
              <option key={registrationRole} value={registrationRole}>
                {registrationRole}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
        <p className="text-sm text-slate-600">
          Already have an account? <Link className="underline" href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
