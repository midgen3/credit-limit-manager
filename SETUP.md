# Credit Limit Manager - Setup Instructions

## Prerequisites

- Node.js 18+
- Shopify CLI (`npm install -g @shopify/cli`)
- A Shopify Partner account
- The app configured in your Partner dashboard

## Quick Start

```bash
cd credit-limit-manager

# Install dependencies
npm install --legacy-peer-deps

# Set up the database
npx prisma generate
npx prisma migrate deploy

# Start development server
shopify app dev
```

## Environment Variables

The `.env` file is pre-configured with your credentials:

```
SHOPIFY_API_KEY=3303df9aad230dd509c2f954c1cab191
SHOPIFY_API_SECRET=your_shopify_api_secret
SCOPES=read_customers,write_customers,read_orders,write_orders,unauthenticated_read_customers,unauthenticated_read_orders
HOST=https://placeholder.com  # Updated automatically by shopify app dev
DATABASE_URL="file:./dev.db"
```

## First-Time Setup in Admin

1. Install the app on `mgenius3.myshopify.com`
2. Go to **Settings** in the app and click **Create Metafield Definition**
3. This creates the `custom.credit_limit` metafield on the Customer object

## Deploying Extensions

```bash
shopify app deploy
```

This deploys all three extensions:
- **POS Extension** (`pos-credit-limit`) — Smart Grid tile
- **Admin Block** (`customer-credit-block`) — Customer details block
- **Theme Block** (`customer-account-block`) — Customer account page block

## Enabling the Theme Block

1. Go to **Online Store > Themes > Customize**
2. Navigate to the Customer Account page
3. Add the **Credit Limit** block from the Apps section

## Enabling the Admin Block

The Customer Credit Block appears automatically on customer detail pages once deployed.

## Enabling the POS Extension

1. Open Shopify POS
2. Go to **Smart Grid settings**
3. Add the **Credit Limit Tile**

## App Proxy

The app proxy endpoint is available at:
```
https://mgenius3.myshopify.com/apps/credit-limit?customer_id=CUSTOMER_ID
```

Returns JSON:
```json
{
  "customer": { "id": "...", "name": "...", "email": "..." },
  "creditLimit": 1000.00,
  "pendingTotal": 250.00,
  "availableCredit": 750.00,
  "currency": "USD",
  "isOverLimit": false,
  "hasLimit": true,
  "pendingOrders": [...]
}
```
