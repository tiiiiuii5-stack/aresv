# VendorLoop

Build a marketplace where buyers send inquiries to sellers, sellers manage listings, and admins resolve transactions 1780202394200.

This is an isolated marketplace application. It does not depend on a shared app shell.

## Classification
- App type: marketplace
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: MarketplaceDesk
- State engine: lib/market-engine.ts
- Primary API: /api/inquiries
- Interaction: send inquiry

## Routes
- /: Listings and demand signals
- /products: Searchable offer catalog
- /seller: Seller performance and inventory
- /checkout: Inquiry and purchase intent

## Schema
- Listing: sellerId, title, price, trustScore, availability
- Seller: name, rating, responseTime, verified
- Inquiry: listingId, buyerEmail, budget, status

## Relationships
- Seller one-to-many Listing via sellerId
- Listing one-to-many Inquiry via listingId

## Functional interactions
- Send inquiry: Adds buyer inquiry to seller queue
- Qualify inquiry: Moves New -> Qualified -> Closed
- Remove listing: Archives listing from marketplace
