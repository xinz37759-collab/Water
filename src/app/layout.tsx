import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ритм дня",
  description: "Личный дневник питания, воды и расходов на еду.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
