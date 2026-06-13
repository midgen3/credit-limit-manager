import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
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
  TextField,
  Banner,
  Spinner,
  Divider,
  Frame,
  Toast,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";

const GET_CUSTOMER = `
  query getCustomer($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      email
      phone
      createdAt
      ordersCount
      totalSpentV2 {
        amount
        currencyCode
      }
      metafield(namespace: "custom", key: "credit_limit") {
        id
        value
      }
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            financialStatus
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

const SET_CREDIT_LIMIT = `
  mutation setCustomerCreditLimit($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const customerId = `gid://shopify/Customer/${params.id}`;

  try {
    const response = await admin.graphql(GET_CUSTOMER, {
      variables: { id: customerId },
    });
    const data = await response.json();
    const customer = data.data?.customer;

    if (!customer) {
      throw new Response("Customer not found", { status: 404 });
    }

    const orders = customer.orders.edges.map(({ node }) => node);
    const pendingOrders = orders.filter((o) => o.financialStatus === "PENDING");
    const pendingTotal = pendingOrders.reduce(
      (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
      0
    );

    return json({ customer, orders, pendingTotal });
  } catch (error) {
    throw new Response(error.message, { status: 500 });
  }
};

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const creditLimit = formData.get("creditLimit");
  const customerId = `gid://shopify/Customer/${params.id}`;

  try {
    const response = await admin.graphql(SET_CREDIT_LIMIT, {
      variables: {
        metafields: [
          {
            ownerId: customerId,
            namespace: "custom",
            key: "credit_limit",
            value: String(parseFloat(creditLimit) || 0),
            type: "number_decimal",
          },
        ],
      },
    });
    const data = await response.json();

    if (data.data?.metafieldsSet?.userErrors?.length > 0) {
      return json({ success: false, errors: data.data.metafieldsSet.userErrors });
    }

    return json({ success: true });
  } catch (error) {
    return json({ success: false, error: error.message });
  }
};

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount || 0);
}

function getFinancialStatusBadge(status) {
  const map = {
    PAID: <Badge tone="success">Paid</Badge>,
    PENDING: <Badge tone="warning">Pending</Badge>,
    PARTIALLY_PAID: <Badge tone="warning">Partially Paid</Badge>,
    REFUNDED: <Badge>Refunded</Badge>,
    VOIDED: <Badge tone="critical">Voided</Badge>,
    PARTIALLY_REFUNDED: <Badge>Partially Refunded</Badge>,
  };
  return map[status] || <Badge>{status}</Badge>;
}

export default function CustomerDetail() {
  const { customer, orders, pendingTotal } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const [creditLimitValue, setCreditLimitValue] = useState(
    customer.metafield?.value || ""
  );
  const [isDirty, setIsDirty] = useState(false);
  const [toastActive, setToastActive] = useState(false);

  const isLoading = navigation.state === "submitting";

  const creditLimit = parseFloat(customer.metafield?.value || "0");
  const currency = customer.totalSpentV2?.currencyCode || "USD";
  const availableCredit = creditLimit - pendingTotal;
  const isOverLimit = creditLimit > 0 && pendingTotal > creditLimit;

  const handleCreditLimitChange = useCallback(
    (value) => {
      setCreditLimitValue(value);
      setIsDirty(value !== (customer.metafield?.value || ""));
    },
    [customer.metafield?.value]
  );

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("creditLimit", creditLimitValue);
    submit(formData, { method: "post" });
    setIsDirty(false);
    setToastActive(true);
  }, [creditLimitValue, submit]);

  const orderRows = orders.map((order) => [
    order.name,
    new Date(order.createdAt).toLocaleDateString(),
    getFinancialStatusBadge(order.financialStatus),
    formatCurrency(
      parseFloat(order.totalPriceSet.shopMoney.amount),
      order.totalPriceSet.shopMoney.currencyCode
    ),
  ]);

  const customerName =
    `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
    customer.email ||
    "Customer";

  return (
    <Frame>
      <Page
        backAction={{ content: "Customers", onAction: () => navigate("/app/customers") }}
        title={customerName}
        subtitle={customer.email}
      >
        <BlockStack gap="500">
          {isOverLimit && (
            <Banner tone="critical" title="Customer is over credit limit">
              <p>
                Pending orders ({formatCurrency(pendingTotal, currency)}) exceed the
                credit limit ({formatCurrency(creditLimit, currency)}).
              </p>
            </Banner>
          )}

          <Layout>
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                {/* Credit Limit Card */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Credit Limit
                    </Text>
                    <Divider />

                    <TextField
                      label="Credit Limit Amount"
                      type="number"
                      value={creditLimitValue}
                      onChange={handleCreditLimitChange}
                      prefix="$"
                      autoComplete="off"
                      helpText="Set to 0 to disable credit limit checking"
                    />

                    {isDirty && (
                      <InlineStack gap="200">
                        <Button
                          variant="primary"
                          onClick={handleSave}
                          loading={isLoading}
                        >
                          Save
                        </Button>
                        <Button
                          variant="plain"
                          onClick={() => {
                            setCreditLimitValue(customer.metafield?.value || "");
                            setIsDirty(false);
                          }}
                        >
                          Discard
                        </Button>
                      </InlineStack>
                    )}

                    <Divider />

                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text variant="bodySm" tone="subdued">Credit Limit</Text>
                          <Text variant="bodySm" fontWeight="semibold">
                            {creditLimit > 0 ? formatCurrency(creditLimit, currency) : "—"}
                          </Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm" tone="subdued">Pending Balance</Text>
                          <Text variant="bodySm" fontWeight="semibold" tone="caution">
                            {formatCurrency(pendingTotal, currency)}
                          </Text>
                        </InlineStack>
                        <Divider />
                        <InlineStack align="space-between">
                          <Text variant="bodySm" tone="subdued">Available</Text>
                          <Text
                            variant="bodySm"
                            fontWeight="bold"
                            tone={availableCredit < 0 ? "critical" : "success"}
                          >
                            {creditLimit > 0 ? formatCurrency(availableCredit, currency) : "—"}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </Card>

                {/* Customer Info Card */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Customer Info</Text>
                    <Divider />
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued">Phone</Text>
                      <Text variant="bodySm">{customer.phone || "—"}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued">Total Orders</Text>
                      <Text variant="bodySm">{customer.ordersCount}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued">Total Spent</Text>
                      <Text variant="bodySm">
                        {formatCurrency(
                          parseFloat(customer.totalSpentV2?.amount || 0),
                          currency
                        )}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued">Member Since</Text>
                      <Text variant="bodySm">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Order History ({orders.length})
                  </Text>
                  {orders.length === 0 ? (
                    <Text tone="subdued">No orders found.</Text>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "numeric"]}
                      headings={["Order", "Date", "Status", "Total"]}
                      rows={orderRows}
                      hoverable
                    />
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>

        {toastActive && (
          <Toast
            content="Credit limit updated"
            onDismiss={() => setToastActive(false)}
          />
        )}
      </Page>
    </Frame>
  );
}
