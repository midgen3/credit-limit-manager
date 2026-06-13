import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
  Banner,
  Box,
  Icon,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/shopify-app-remix/react";
import { authenticate } from "../shopify.server";

const PENDING_ORDERS_QUERY = `
  query getDashboardData {
    orders(first: 50, query: "financial_status:pending") {
      edges {
        node {
          id
          name
          createdAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          customer {
            id
            firstName
            lastName
            email
            metafield(namespace: "custom", key: "credit_limit") {
              value
            }
          }
        }
      }
    }
    customers(first: 10, query: "tag:credit_limit") {
      edges {
        node {
          id
          firstName
          lastName
          email
          metafield(namespace: "custom", key: "credit_limit") {
            value
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(PENDING_ORDERS_QUERY);
    const data = await response.json();

    const pendingOrders = data.data?.orders?.edges?.map(({ node }) => node) || [];
    const customers = data.data?.customers?.edges?.map(({ node }) => node) || [];

    // Group pending orders by customer
    const customerOrderMap = {};
    pendingOrders.forEach((order) => {
      if (order.customer) {
        const customerId = order.customer.id;
        if (!customerOrderMap[customerId]) {
          customerOrderMap[customerId] = {
            customer: order.customer,
            pendingTotal: 0,
            orderCount: 0,
          };
        }
        customerOrderMap[customerId].pendingTotal += parseFloat(
          order.totalPriceSet.shopMoney.amount
        );
        customerOrderMap[customerId].orderCount += 1;
      }
    });

    // Find customers over their credit limit
    const overdueCustomers = Object.values(customerOrderMap).filter(
      ({ customer, pendingTotal }) => {
        const creditLimit = parseFloat(customer.metafield?.value || "0");
        return creditLimit > 0 && pendingTotal > creditLimit;
      }
    );

    return json({
      pendingOrdersCount: pendingOrders.length,
      pendingOrdersTotal: pendingOrders.reduce(
        (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
        0
      ),
      overdueCustomers,
      recentOrders: pendingOrders.slice(0, 10),
      currency: pendingOrders[0]?.totalPriceSet?.shopMoney?.currencyCode || "USD",
    });
  } catch (error) {
    console.error("Dashboard loader error:", error);
    return json({
      pendingOrdersCount: 0,
      pendingOrdersTotal: 0,
      overdueCustomers: [],
      recentOrders: [],
      currency: "USD",
    });
  }
};

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function Index() {
  const {
    pendingOrdersCount,
    pendingOrdersTotal,
    overdueCustomers,
    recentOrders,
    currency,
  } = useLoaderData();
  const navigate = useNavigate();

  const overdueRows = overdueCustomers.map(({ customer, pendingTotal, orderCount }) => {
    const creditLimit = parseFloat(customer.metafield?.value || "0");
    const overAmount = pendingTotal - creditLimit;
    return [
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unknown",
      customer.email || "-",
      formatCurrency(creditLimit, currency),
      formatCurrency(pendingTotal, currency),
      <Badge tone="critical">+{formatCurrency(overAmount, currency)}</Badge>,
      orderCount,
    ];
  });

  const recentOrderRows = recentOrders.map((order) => [
    order.name,
    order.customer
      ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() ||
        order.customer.email
      : "No customer",
    new Date(order.createdAt).toLocaleDateString(),
    formatCurrency(
      parseFloat(order.totalPriceSet.shopMoney.amount),
      order.totalPriceSet.shopMoney.currencyCode
    ),
    <Badge tone="warning">Pending</Badge>,
  ]);

  return (
    <Page>
      <TitleBar title="Credit Limit Manager" />
      <BlockStack gap="500">
        {overdueCustomers.length > 0 && (
          <Banner
            title={`${overdueCustomers.length} customer${overdueCustomers.length > 1 ? "s" : ""} over credit limit`}
            tone="critical"
            action={{ content: "View Customers", onAction: () => navigate("/app/customers") }}
          >
            <p>
              These customers have pending orders exceeding their credit limits.
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Pending Orders
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {pendingOrdersCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Orders awaiting payment
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Pending Total
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {formatCurrency(pendingOrdersTotal, currency)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Outstanding balance
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Over Limit
                </Text>
                <Text
                  as="p"
                  variant="headingXl"
                  fontWeight="bold"
                  tone={overdueCustomers.length > 0 ? "critical" : "success"}
                >
                  {overdueCustomers.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Customers over credit limit
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {overdueCustomers.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Customers Over Credit Limit
                </Text>
                <Button variant="plain" onClick={() => navigate("/app/customers")}>
                  View all
                </Button>
              </InlineStack>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "numeric"]}
                headings={["Customer", "Email", "Credit Limit", "Pending Total", "Over By", "Orders"]}
                rows={overdueRows}
                hoverable
              />
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Recent Pending Orders
              </Text>
              <Button variant="plain" onClick={() => navigate("/app/customers")}>
                Manage customers
              </Button>
            </InlineStack>

            {recentOrders.length === 0 ? (
              <EmptyState
                heading="No pending orders"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Pending orders will appear here when customers have outstanding payments.</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "text"]}
                headings={["Order", "Customer", "Date", "Amount", "Status"]}
                rows={recentOrderRows}
                hoverable
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Quick Actions
            </Text>
            <InlineStack gap="300">
              <Button onClick={() => navigate("/app/customers")}>
                Manage Credit Limits
              </Button>
              <Button variant="plain" onClick={() => navigate("/app/settings")}>
                App Settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
