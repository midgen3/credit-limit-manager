import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
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
  Modal,
  Banner,
  Spinner,
  Pagination,
  Filters,
  ChoiceList,
  EmptyState,
  Toast,
  Frame,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";

const CUSTOMERS_QUERY = `
  query getCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          firstName
          lastName
          email
          phone
          ordersCount
          totalSpentV2 {
            amount
            currencyCode
          }
          metafield(namespace: "custom", key: "credit_limit") {
            id
            value
          }
        }
      }
    }
  }
`;

const PENDING_ORDERS_FOR_CUSTOMER = `
  query getPendingOrdersForCustomer($customerId: ID!) {
    customer(id: $customerId) {
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

const SET_CREDIT_LIMIT_MUTATION = `
  mutation setCustomerCreditLimit($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        metafield(namespace: "custom", key: "credit_limit") {
          id
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
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

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const search = url.searchParams.get("search") || "";

  try {
    const response = await admin.graphql(CUSTOMERS_QUERY, {
      variables: {
        first: 20,
        after: after || undefined,
        query: search || undefined,
      },
    });
    const data = await response.json();
    const customers = data.data?.customers?.edges?.map(({ node }) => node) || [];
    const pageInfo = data.data?.customers?.pageInfo || {};

    // Fetch pending totals for customers with credit limits
    const customersWithLimits = customers.filter((c) => c.metafield?.value);
    const pendingTotals = {};

    for (const customer of customersWithLimits) {
      const pendingResponse = await admin.graphql(PENDING_ORDERS_FOR_CUSTOMER, {
        variables: { customerId: customer.id },
      });
      const pendingData = await pendingResponse.json();
      const orders =
        pendingData.data?.customer?.orders?.edges?.map(({ node }) => node) || [];
      pendingTotals[customer.id] = orders.reduce(
        (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
        0
      );
    }

    return json({ customers, pageInfo, pendingTotals, search });
  } catch (error) {
    console.error("Customers loader error:", error);
    return json({ customers: [], pageInfo: {}, pendingTotals: {}, search, error: error.message });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const customerId = formData.get("customerId");
  const creditLimit = formData.get("creditLimit");

  try {
    const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: customerId,
            namespace: "custom",
            key: "credit_limit",
            value: String(parseFloat(creditLimit)),
            type: "number_decimal",
          },
        ],
      },
    });
    const data = await response.json();

    if (data.data?.metafieldsSet?.userErrors?.length > 0) {
      return json({
        success: false,
        errors: data.data.metafieldsSet.userErrors,
      });
    }

    return json({ success: true });
  } catch (error) {
    return json({ success: false, error: error.message });
  }
};

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function Customers() {
  const { customers, pageInfo, pendingTotals, search, error } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [creditLimitValue, setCreditLimitValue] = useState("");
  const [searchValue, setSearchValue] = useState(search || "");
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const isLoading = navigation.state === "loading";

  const handleEditCredit = useCallback((customer) => {
    setEditingCustomer(customer);
    setCreditLimitValue(customer.metafield?.value || "");
  }, []);

  const handleSaveCreditLimit = useCallback(() => {
    if (!editingCustomer) return;
    const formData = new FormData();
    formData.append("customerId", editingCustomer.id);
    formData.append("creditLimit", creditLimitValue);
    submit(formData, { method: "post" });
    setEditingCustomer(null);
    setToastMessage("Credit limit updated successfully");
    setToastActive(true);
  }, [editingCustomer, creditLimitValue, submit]);

  const handleSearch = useCallback((value) => {
    setSearchValue(value);
    if (value) {
      setSearchParams({ search: value });
    } else {
      setSearchParams({});
    }
  }, [setSearchParams]);

  const rows = customers.map((customer) => {
    const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unknown";
    const creditLimit = parseFloat(customer.metafield?.value || "0");
    const pendingTotal = pendingTotals[customer.id] || 0;
    const available = creditLimit - pendingTotal;
    const currency = customer.totalSpentV2?.currencyCode || "USD";

    let statusBadge;
    if (creditLimit === 0) {
      statusBadge = <Badge>No limit set</Badge>;
    } else if (pendingTotal > creditLimit) {
      statusBadge = <Badge tone="critical">Over limit</Badge>;
    } else if (pendingTotal > creditLimit * 0.8) {
      statusBadge = <Badge tone="warning">Near limit</Badge>;
    } else {
      statusBadge = <Badge tone="success">Within limit</Badge>;
    }

    return [
      name,
      customer.email || "-",
      creditLimit > 0 ? formatCurrency(creditLimit, currency) : "-",
      pendingTotal > 0 ? formatCurrency(pendingTotal, currency) : formatCurrency(0, currency),
      creditLimit > 0 ? formatCurrency(available, currency) : "-",
      statusBadge,
      <Button size="slim" onClick={() => handleEditCredit(customer)}>
        Edit
      </Button>,
    ];
  });

  return (
    <Frame>
      <Page>
        <TitleBar title="Customer Credit Limits" />
        <BlockStack gap="500">
          {error && (
            <Banner tone="critical" title="Error loading customers">
              <p>{error}</p>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  All Customers
                </Text>
                {isLoading && <Spinner size="small" />}
              </InlineStack>

              <TextField
                label="Search customers"
                labelHidden
                placeholder="Search by name or email"
                value={searchValue}
                onChange={handleSearch}
                clearButton
                onClearButtonClick={() => handleSearch("")}
                autoComplete="off"
              />

              {customers.length === 0 ? (
                <EmptyState
                  heading="No customers found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Try adjusting your search or add customers to your store.</p>
                </EmptyState>
              ) : (
                <>
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "numeric",
                      "numeric",
                      "numeric",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Customer",
                      "Email",
                      "Credit Limit",
                      "Pending Total",
                      "Available",
                      "Status",
                      "Actions",
                    ]}
                    rows={rows}
                    hoverable
                  />

                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={() => {
                        setSearchParams({ before: pageInfo.startCursor });
                      }}
                      hasNext={pageInfo.hasNextPage}
                      onNext={() => {
                        setSearchParams({ after: pageInfo.endCursor });
                      }}
                    />
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Card>
        </BlockStack>

        {editingCustomer && (
          <Modal
            open={!!editingCustomer}
            onClose={() => setEditingCustomer(null)}
            title={`Edit Credit Limit — ${editingCustomer.firstName || ""} ${editingCustomer.lastName || ""}`.trim()}
            primaryAction={{
              content: "Save",
              onAction: handleSaveCreditLimit,
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => setEditingCustomer(null),
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text as="p" variant="bodyMd">
                  Set the credit limit for this customer. Leave at 0 to disable credit limit checking.
                </Text>
                <TextField
                  label="Credit Limit"
                  type="number"
                  value={creditLimitValue}
                  onChange={setCreditLimitValue}
                  prefix="$"
                  autoComplete="off"
                  helpText="Enter the maximum credit amount allowed for this customer"
                />
                {editingCustomer.metafield?.value && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Current limit: {formatCurrency(parseFloat(editingCustomer.metafield.value))}
                  </Text>
                )}
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}

        {toastActive && (
          <Toast
            content={toastMessage}
            onDismiss={() => setToastActive(false)}
          />
        )}
      </Page>
    </Frame>
  );
}
