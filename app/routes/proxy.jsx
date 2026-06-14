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
      firstName
      lastName
      email
      metafield(namespace: "custom", key: "credit_limit") {
        value
      }
      orders(first: 250, query: "financial_status:pending") {
        edges {
          node {
            id
            name
            totalPriceSet {
              shopMoney { amount currencyCode }
            }
          }
        }
      }
    }
  }
`;

function buildResponse(customer, extraHeaders = {}) {
  const creditLimit = parseFloat(customer.metafield?.value || "0");
  const pendingOrders = customer.orders?.edges?.map(({ node }) => node) || [];
  const pendingTotal = pendingOrders.reduce(
    (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
    0
  );
  return {
    credit_limit: creditLimit,
    pending_total: pendingTotal,
    available_credit: creditLimit - pendingTotal,
    has_limit: creditLimit > 0,
    // legacy fields for app proxy callers
    creditLimit,
    pendingTotal,
    availableCredit: creditLimit - pendingTotal,
    isOverLimit: creditLimit > 0 && pendingTotal > creditLimit,
    hasLimit: creditLimit > 0,
    customer: {
      id: customer.id,
      name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
      email: customer.email,
    },
  };
}

// ── POS path: token passed as query param ────────────────────────────────────
async function handlePOSRequest(request, rawCustomerId) {
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get("token");

  // Inject token into Authorization header for authenticate.public.pos
  const headers = new Headers(request.headers);
  if (tokenParam) headers.set("Authorization", `Bearer ${tokenParam}`);
  const modifiedRequest = new Request(request.url, {
    method: request.method,
    headers,
  });

  const { sessionToken, cors } = await authenticate.public.pos(modifiedRequest);

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

  return cors(json(buildResponse(customer)));
}

// ── App proxy path: Shopify HMAC-signed request ──────────────────────────────
async function handleAppProxyRequest(request) {
  const { admin, liquid } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customer_id");
  const loggedInCustomerId = liquid?.customer_id;

  const targetCustomerId = loggedInCustomerId
    ? `gid://shopify/Customer/${loggedInCustomerId}`
    : customerId
    ? `gid://shopify/Customer/${customerId}`
    : null;

  if (!targetCustomerId) {
    return json({ error: "No customer ID provided" }, { status: 400 });
  }

  const response = await admin.graphql(CUSTOMER_CREDIT_QUERY, {
    variables: { customerId: targetCustomerId },
  });
  const data = await response.json();
  const customer = data.data?.customer;

  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  return json(buildResponse(customer), {
    headers: { "Cache-Control": "no-cache" },
  });
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const isPOSRequest = !!url.searchParams.get("token");

  try {
    if (isPOSRequest) {
      const rawCustomerId = url.searchParams.get("customer_id");
      if (!rawCustomerId) {
        return new Response(
          JSON.stringify({ error: "No customer_id provided" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      return await handlePOSRequest(request, rawCustomerId);
    } else {
      return await handleAppProxyRequest(request);
    }
  } catch (error) {
    console.error("Proxy/POS error:", error?.message || error);
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
