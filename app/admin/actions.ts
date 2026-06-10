"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/auth/guards";
import { requireSession } from "@/lib/auth/session";

export async function loginAdmin(_previousState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const ok = await createAdminSession(email, password);
  if (!ok) return { error: "Admin access denied. Check the email and password." };
  redirect("/admin");
}

export async function logoutAdmin() {
  const session = await requireSession();
  await requireAdmin(session);
  await clearAdminSession();
  redirect("/admin/login");
}
