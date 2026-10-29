import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_TITLE } from "../src/config/event";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: "Sophia 组织的匹克球活动。黑白两队，三块球场，一起安排阵容、记录比赛与相聚时刻。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f3f2ea" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
