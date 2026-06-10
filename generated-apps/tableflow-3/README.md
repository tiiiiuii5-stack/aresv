# TableFlow

Build an ecommerce store for boutique owners, inventory managers, and shoppers. Real users: store owner, inventory manager, shopper. Real actions: create products, add to cart, checkout with Stripe, receive webhook payment confirmation, reduce inventory, send order confirmation email. Real data: products, carts, orders, payments, inventory events. Real state changes: cart totals update, checkout creates order, payment webhook marks paid, stock decreases, refresh keeps saved state.

This is an isolated restaurant application. It does not depend on a shared app shell.

## Classification
- App type: internal tool
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: KitchenOrderBoard
- State engine: lib/kitchen-engine.ts
- Primary API: /api/orders
- Interaction: send order

## Routes
- /: Browse menu and featured bundles
- /order: Build a cart and submit order
- /kitchen: Track prep queue
- /admin: Update menu and fulfillment status

## Schema
- MenuItem: name, price, station, available, prepTime
- KitchenTicket: items, customerName, status, pickupTime
- OrderLine: ticketId, menuItemId, quantity, notes

## Relationships
- KitchenTicket one-to-many OrderLine via ticketId
- MenuItem one-to-many OrderLine via menuItemId

## Functional interactions
- Send order: Adds order to kitchen queue
- Advance prep: Moves New -> Prep -> Ready -> Picked up
- Remove line: Removes item from order

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
