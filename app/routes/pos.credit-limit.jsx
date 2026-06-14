import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

// Handle CORS preflight
export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(null, { status: 405, headers: CORS_HEADERS });
};

export const loader = async ({ request }) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let cors = (response) => response;

  try {
    const result = await authenticate.public.pos(request);
    cors = result.cors;
    const sessionToken = result.sessionToken;

    const url = new URL(request.url);
    const rawCustomerId = url.searchParams.get("customer_id");

    if (!rawCustomerId) {
      return cors(
        json({ error: "No customer_id provided" }, { status: 400, headers: CORS_HEADERS })
      );
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
      return cors(
        json({ error: "Customer not found" }, { status: 404, headers: CORS_HEADERS })
      );
    }

    const creditLimit = parseFloat(customer.metafield?.value || "0");
    const pendingTotal = (customer.orders?.edges || []).reduce(
      (sum, { node }) =>
        sum + parseFloat(node.totalPriceSet.shopMoney.amount || 0),
      0
    );

    return cors(
      json(
        {
          credit_limit: creditLimit,
          pending_total: pendingTotal,
          available_credit: creditLimit - pendingTotal,
          has_limit: creditLimit > 0,
        },
        { headers: CORS_HEADERS }
      )
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
