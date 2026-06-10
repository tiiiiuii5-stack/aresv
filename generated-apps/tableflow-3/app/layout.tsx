import "./globals.css";

export const metadata = {
  title: "TableFlow",
  description: "Build an ecommerce store for boutique owners, inventory managers, and shoppers. Real users: store owner, inventory manager, shopper. Real actions: create products, add to cart, checkout with Stripe, receive webhook payment confirmation, reduce inventory, send order confirmation email. Real data: products, carts, orders, payments, inventory events. Real state changes: cart totals update, checkout creates order, payment webhook marks paid, stock decreases, refresh keeps saved state.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
