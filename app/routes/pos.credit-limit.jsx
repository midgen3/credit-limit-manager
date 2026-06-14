import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";

const CUSTOMER_CREDIT_QUERY = `
  query getCustomerCredit($customerId: ID!) {
    customer(id: $customerId) {
      id
      metafield(namespace: "custom", key: "credit_limit") {
        value
      }
      orders(first: 250, query: "financial_status:pending") {
        edges {
          node {
            totalPriceSet {
              shopMoney { amount }
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { sessionToken, cors } = await authenticate.public.pos(request);

  const url = new URL(request.url);
  const rawCustomerId = url.searchParams.get("customer_id");

  if (!rawCustomerId) {
    return cors(json({ error: "No customer_id provided" }, { status: 400 }));
  }

  // Normalize customer ID to GID format
  const customerId = rawCustomerId.startsWith("gid://")
    ? rawCustomerId
    : `gid://shopify/Customer/${rawCustomerId}`;

  // Extract shop domain from session token
  const shop = sessionToken.dest.replace("https://", "");

  try {
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(CUSTOMER_CREDIT_QUERY, {
      variables: { customerId },
    });
    const data = await response.json();
    const customer = data.data?.customer;

    if (!customer) {
      return cors(json({ error: "Customer not found" }, { status: 404 }));
    }

    const creditLimit = parseFloat(customer.metafield?.value || "0");
    const pendingTotal = (customer.orders?.edges || []).reduce(
      (sum, { node }) =>
        sum + parseFloat(node.totalPriceSet.shopMoney.amount || 0),
      0
    );

    return cors(
      json({
        credit_limit: creditLimit,
        pending_total: pendingTotal,
        available_credit: creditLimit - pendingTotal,
        has_limit: creditLimit > 0,
      })
    );
  } catch (error) {
    console.error("POS credit-limit error:", error);
    return cors(
      json({ error: "Failed to fetch credit data" }, { status: 500 })
    );
  }
};
