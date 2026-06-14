import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
  const url = new URL(request.url);

  // Lift the token from query param into Authorization header so
  // authenticate.public.pos can verify it (avoids CORS preflight from
  // sending a custom Authorization header from the extension)
  const tokenParam = url.searchParams.get("token");
  if (tokenParam) {
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${tokenParam}`);
    request = new Request(request.url, { method: request.method, headers });
  }

  try {
    const { sessionToken, cors } = await authenticate.public.pos(request);

    const rawCustomerId = url.searchParams.get("customer_id");
    if (!rawCustomerId) {
      return cors(json({ error: "No customer_id provided" }, { status: 400 }));
    }

    const customerId = rawCustomerId.startsWith("gid://")
      ? rawCustomerId
      : `gid://shopify/Customer/${rawCustomerId}`;

    const shop = sessionToken.dest.replace("https://", "");
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
    console.error("POS credit-limit error:", error?.message || error);
    return new Response(
      JSON.stringify({
        error: "Request failed",
        detail: error?.message || String(error),
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
};
