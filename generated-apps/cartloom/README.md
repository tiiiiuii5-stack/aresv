# CartLoom

Build an ecommerce store with products, cart items, orders, checkout, and inventory controls.

This is an isolated ecommerce application. It does not depend on a shared app shell.

## Runtime behavior
- Component: CommerceStorefront
- State engine: lib/cart-engine.ts
- Primary API: /api/cart
- Interaction: add to cart

## Routes
- /: Featured products and conversion content
- /products: Filterable product grid
- /cart: Cart review and quantity changes
- /checkout: Customer and payment-intent form

## Schema
- Product: title, price, inventory, category, rating
- Order: items, customerEmail, total, status
- CartItem: productId, orderId, quantity, price

## Relationships
- Product one-to-many CartItem via productId
- Order one-to-many CartItem via orderId

## Functional interactions
- Add to cart: Adds product to cart and updates total
- Checkout: Moves Cart -> Review -> Paid -> Fulfilled
- Remove item: Removes item and recalculates total
