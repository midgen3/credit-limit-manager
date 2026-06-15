import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

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

export const loader = async ({ request }) => {
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
    return json({ error: "No customer ID provided" }, {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await admin.graphql(CUSTOMER_CREDIT_QUERY, {
      variables: { customerId: targetCustomerId },
    });
    const data = await response.json();
    const customer = data.data?.customer;

    if (!customer) {
      return json({ error: "Customer not found" }, { status: 404 });
    }

    const creditLimit = parseFloat(customer.metafield?.value || "0");
    const pendingOrders = customer.orders?.edges?.map(({ node }) => node) || [];
    const pendingTotal = pendingOrders.reduce(
      (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
      0
    );

    return json({
      credit_limit: creditLimit,
      pending_total: pendingTotal,
      available_credit: creditLimit - pendingTotal,
      has_limit: creditLimit > 0,
      // legacy field names
      creditLimit,
      pendingTotal,
      customer: {
        id: customer.id,
        name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
        email: customer.email,
      },
    }, {
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return json({ error: "Failed to fetch credit data" }, { status: 500 });
  }
};
