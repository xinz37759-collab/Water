"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "register"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        const code = String(result.error.code ?? "").toUpperCase();
        if (code.includes("ORIGIN")) setError("Адрес приложения не разрешён для авторизации. Перезагрузите страницу и попробуйте снова.");
        else if (code.includes("INVALID_EMAIL")) setError("Проверьте формат адреса email.");
        else if (code === "VALIDATION_ERROR" && /email/i.test(String(result.error.message ?? ""))) setError("Проверьте адрес email: используйте формат name@example.com.");
        else if (code.includes("USER_ALREADY_EXISTS")) setError("Аккаунт с таким email уже создан. Переключитесь на вход.");
        else setError(mode === "register" ? "Не удалось создать аккаунт. Проверьте пароль (минимум 8 символов), подключение и не зарегистрирован ли уже этот email." : "Не удалось войти. Проверьте email и пароль.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Сервис авторизации сейчас недоступен. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <a className="brand-lockup" href="/" aria-label="Ритм дня"><span aria-hidden="true" className="brand-mark">✳</span><span>Ритм <span className="brand-amp">дня</span></span></a>
      <p className="eyebrow">ЛИЧНЫЙ ДНЕВНИК</p>
      <h1>{mode === "login" ? "С возвращением" : "Создайте аккаунт"}</h1>
      <p className="auth-description">{mode === "login" ? "Войдите, чтобы продолжить заботиться о себе." : "Записи и настройки будут сохранены в вашем аккаунте."}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && <label>Имя<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>
        <label>Пароль<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
      </form>
      <p className="auth-toggle">{mode === "login" ? "Впервые здесь?" : "Уже есть аккаунт?"} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Создать аккаунт" : "Войти"}</button></p>
    </section>
  </main>;
}
