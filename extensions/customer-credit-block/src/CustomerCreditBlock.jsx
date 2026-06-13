import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
  ProgressIndicator,
  Divider,
  Badge,
  Box,
} from "@shopify/ui-extensions-react/admin";
import { useState, useEffect, useCallback } from "react";

// ─── Queries & Mutations ─────────────────────────────────────────────────────

const GET_CUSTOMER_CREDIT = `
  query getCustomerCredit($customerId: ID!) {
    customer(id: $customerId) {
      id
      firstName
      lastName
      email
      metafield(namespace: "custom", key: "credit_limit") {
        id
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

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

function CustomerCreditBlock() {
  const { data, query, i18n } = useApi("admin.customers.details.block.render");

  const customerId = data?.customer?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [creditLimit, setCreditLimit] = useState("");
  const [originalLimit, setOriginalLimit] = useState("");
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [currency, setCurrency] = useState("USD");
  const [isDirty, setIsDirty] = useState(false);

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);

    try {
      const result = await query(GET_CUSTOMER_CREDIT, {
        variables: { customerId },
      });

      const customer = result?.data?.customer;
      if (!customer) throw new Error("Could not load customer data");

      const limitValue = customer.metafield?.value || "";
      setCreditLimit(limitValue);
      setOriginalLimit(limitValue);

      const orders =
        customer.orders?.edges?.map(({ node }) => ({
          id: node.id,
          name: node.name,
          amount: parseFloat(node.totalPriceSet.shopMoney.amount),
          currency: node.totalPriceSet.shopMoney.currencyCode,
        })) || [];

      setPendingOrders(orders);
      setPendingTotal(orders.reduce((sum, o) => sum + o.amount, 0));

      if (orders.length > 0) {
        setCurrency(orders[0].currency);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, query]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreditLimitChange = useCallback(
    (value) => {
      setCreditLimit(value);
      setIsDirty(value !== originalLimit);
    },
    [originalLimit]
  );

  const handleSave = useCallback(async () => {
    if (!customerId || !isDirty) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await query(SET_CREDIT_LIMIT, {
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

      const userErrors = result?.data?.metafieldsSet?.userErrors;
      if (userErrors?.length > 0) {
        throw new Error(userErrors.map((e) => e.message).join(", "));
      }

      setOriginalLimit(creditLimit);
      setIsDirty(false);
      setSuccessMessage("Credit limit saved successfully");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [customerId, creditLimit, isDirty, query]);

  const handleDiscard = useCallback(() => {
    setCreditLimit(originalLimit);
    setIsDirty(false);
  }, [originalLimit]);

  if (loading) {
    return (
      <AdminBlock title="Credit Limit">
        <BlockStack gap="300">
          <InlineStack blockAlignment="center" gap="200">
            <ProgressIndicator size="small" />
            <Text>Loading credit data...</Text>
          </InlineStack>
        </BlockStack>
      </AdminBlock>
    );
  }

  const parsedLimit = parseFloat(creditLimit) || 0;
  const availableCredit = parsedLimit - pendingTotal;
  const isOverLimit = parsedLimit > 0 && pendingTotal > parsedLimit;

  return (
    <AdminBlock title="Credit Limit">
      <BlockStack gap="400">
        {error && (
          <Banner
            tone="critical"
            title="Error"
            dismissible
            onDismiss={() => setError(null)}
          >
            <Text>{error}</Text>
          </Banner>
        )}

        {successMessage && (
          <Banner tone="success" dismissible onDismiss={() => setSuccessMessage(null)}>
            <Text>{successMessage}</Text>
          </Banner>
        )}

        {isOverLimit && (
          <Banner tone="critical" title="Over Credit Limit">
            <Text>
              This customer's pending orders ({formatCurrency(pendingTotal, currency)}) exceed
              their credit limit ({formatCurrency(parsedLimit, currency)}).
            </Text>
          </Banner>
        )}

        {/* Credit Limit Field */}
        <BlockStack gap="200">
          <TextField
            label="Credit Limit"
            type="number"
            value={creditLimit}
            onChange={handleCreditLimitChange}
            prefix="$"
            helpText="Maximum credit allowed. Set to 0 to disable credit limit checking."
            autoComplete="off"
          />
        </BlockStack>

        {/* Summary Stats */}
        <Box
          background="bg-surface-secondary"
          padding="300"
          borderRadius="200"
        >
          <BlockStack gap="200">
            <InlineStack blockAlignment="center" inlineAlignment="space-between">
              <Text variant="bodySm" tone="subdued">Credit Limit</Text>
              <Text variant="bodySm" fontWeight="semibold">
                {parsedLimit > 0 ? formatCurrency(parsedLimit, currency) : "Not set"}
              </Text>
            </InlineStack>

            <InlineStack blockAlignment="center" inlineAlignment="space-between">
              <Text variant="bodySm" tone="subdued">Pending Payments</Text>
              <Text
                variant="bodySm"
                fontWeight="semibold"
                tone={pendingTotal > 0 ? "caution" : "default"}
              >
                {formatCurrency(pendingTotal, currency)}
              </Text>
            </InlineStack>

            <Divider />

            <InlineStack blockAlignment="center" inlineAlignment="space-between">
              <Text variant="bodySm" tone="subdued">Available Credit</Text>
              <Text
                variant="bodySm"
                fontWeight="bold"
                tone={availableCredit < 0 ? "critical" : availableCredit === 0 ? "caution" : "success"}
              >
                {parsedLimit > 0
                  ? formatCurrency(availableCredit, currency)
                  : "—"}
              </Text>
            </InlineStack>
          </BlockStack>
        </Box>

        {/* Pending Orders List */}
        {pendingOrders.length > 0 && (
          <BlockStack gap="200">
            <Text variant="headingSm">
              Pending Orders ({pendingOrders.length})
            </Text>
            {pendingOrders.slice(0, 5).map((order) => (
              <InlineStack
                key={order.id}
                blockAlignment="center"
                inlineAlignment="space-between"
              >
                <Text variant="bodySm" tone="subdued">
                  {order.name}
                </Text>
                <Text variant="bodySm">
                  {formatCurrency(order.amount, order.currency)}
                </Text>
              </InlineStack>
            ))}
            {pendingOrders.length > 5 && (
              <Text variant="bodySm" tone="subdued">
                +{pendingOrders.length - 5} more orders
              </Text>
            )}
          </BlockStack>
        )}

        {/* Action Buttons */}
        {isDirty && (
          <InlineStack gap="200">
            <Button
              variant="primary"
              onPress={handleSave}
              loading={saving}
            >
              Save
            </Button>
            <Button variant="plain" onPress={handleDiscard} disabled={saving}>
              Discard
            </Button>
          </InlineStack>
        )}
      </BlockStack>
    </AdminBlock>
  );
}

export default reactExtension(
  "admin.customers.details.block.render",
  () => <CustomerCreditBlock />
);
