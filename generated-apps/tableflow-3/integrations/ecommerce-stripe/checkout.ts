// Integration module: Ecommerce-Stripe
import Stripe from "stripe";

export type CartLine = { productId: string; name: string; quantity: number; unitAmount: number };

export async function createStripeCheckoutSession(lines: CartLine[], orderId: string) {
  const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return stripe.checkout.sessions.create({
    mode: "payment",
    metadata: { orderId },
    success_url: `${requiredEnv("NEXT_PUBLIC_APP_URL")}/checkout/success?order=${orderId}`,
    cancel_url: `${requiredEnv("NEXT_PUBLIC_APP_URL")}/cart`,
    line_items: lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: "usd",
        unit_amount: line.unitAmount,
        product_data: { name: line.name },
      },
    })),
  });
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}
