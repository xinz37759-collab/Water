import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Dashboard from "@/components/dashboard";

export default async function HomePage() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");
    return <Dashboard userId={session.user.id} email={session.user.email} />;
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Unable to load authentication session", error);
    return <main className="auth-page"><section className="auth-card"><h1>Не удалось подключиться</h1><p className="auth-description">Проверьте подключение к базе данных и попробуйте обновить страницу.</p><a className="button-primary auth-submit" href="/login">Перейти ко входу</a></section></main>;
  }
}
