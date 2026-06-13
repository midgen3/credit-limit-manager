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
              shopMoney {
                amount
                currencyCode
              }
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

  // Use the logged-in customer ID if no explicit one provided (security)
  const targetCustomerId = loggedInCustomerId
    ? `gid://shopify/Customer/${loggedInCustomerId}`
    : customerId
    ? `gid://shopify/Customer/${customerId}`
    : null;

  if (!targetCustomerId) {
    return json(
      { error: "No customer ID provided" },
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const response = await admin.graphql(CUSTOMER_CREDIT_QUERY, {
      variables: { customerId: targetCustomerId },
    });
    const data = await response.json();
    const customer = data.data?.customer;

    if (!customer) {
      return json(
        { error: "Customer not found" },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const creditLimit = parseFloat(customer.metafield?.value || "0");
    const pendingOrders = customer.orders?.edges?.map(({ node }) => node) || [];
    const pendingTotal = pendingOrders.reduce(
      (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
      0
    );
    const availableCredit = creditLimit - pendingTotal;
    const currency = pendingOrders[0]?.totalPriceSet?.shopMoney?.currencyCode || "USD";

    return json(
      {
        customer: {
          id: customer.id,
          name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
          email: customer.email,
        },
        creditLimit,
        pendingTotal,
        availableCredit,
        currency,
        pendingOrders: pendingOrders.map((o) => ({
          id: o.id,
          name: o.name,
          amount: parseFloat(o.totalPriceSet.shopMoney.amount),
        })),
        isOverLimit: creditLimit > 0 && pendingTotal > creditLimit,
        hasLimit: creditLimit > 0,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Proxy error:", error);
    return json(
      { error: "Failed to fetch credit data" },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
