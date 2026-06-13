import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin && topic !== "SHOP_REDACT") {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      break;

    case "CUSTOMERS_DATA_REQUEST":
      // GDPR webhook: customer requests their data
      // In a real app, you'd export customer data here
      console.log(`GDPR: Customer data request for shop ${shop}`);
      break;

    case "CUSTOMERS_REDACT":
      // GDPR webhook: customer requests data deletion
      // In a real app, you'd delete customer data here
      console.log(`GDPR: Customer redact request for shop ${shop}`);
      break;

    case "SHOP_REDACT":
      // GDPR webhook: shop requests data deletion after uninstall
      console.log(`GDPR: Shop redact request for shop ${shop}`);
      break;

    case "CUSTOMERS_UPDATE":
      // Handle customer update webhook
      console.log(`Customer updated in shop ${shop}:`, payload?.id);
      break;

    case "ORDERS_CREATE":
      // Handle new order webhook
      console.log(`New order created in shop ${shop}:`, payload?.id);
      break;

    case "ORDERS_UPDATED":
      // Handle order update webhook
      console.log(`Order updated in shop ${shop}:`, payload?.id);
      break;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
