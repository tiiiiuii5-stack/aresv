import "./globals.css";

export const metadata = {
  title: "VendorLoop",
  description: "Build a marketplace where buyers send inquiries to sellers, sellers manage listings, and admins resolve transactions 1780202394200.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
