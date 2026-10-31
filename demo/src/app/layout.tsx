import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Payload Paystack demo",
  description: "Try the Payload Paystack plugin",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
