import "./globals.css";

export const metadata = {
  title: "CartLoom",
  description: "Build an ecommerce store with products, cart items, orders, checkout, and inventory controls.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
