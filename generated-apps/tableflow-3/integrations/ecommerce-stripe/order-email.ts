// Integration module: Ecommerce-Stripe
export function orderConfirmationEmail(input: { orderId: string; customerName: string; total: string }) {
  return {
    subject: `Order ${input.orderId} confirmed`,
    text: `Hi ${input.customerName}, your order total ${input.total} is confirmed and is now being prepared.`,
  };
}
