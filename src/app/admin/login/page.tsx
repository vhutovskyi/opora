"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Card, Field, Input } from "../ui";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Невірний email або пароль");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-opora-white p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-xl font-semibold text-opora-brown">Адмін-панель OPORA</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Пароль">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Вхід..." : "Увійти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
