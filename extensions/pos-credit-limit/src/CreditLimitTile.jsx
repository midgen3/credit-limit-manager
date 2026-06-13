import {
  reactExtension,
  useApi,
  useCartSubscription,
  Tile,
  Navigator,
  Screen,
  ScrollView,
  Section,
  Text,
  Stack,
  Icon,
  Badge,
  Button,
} from "@shopify/ui-extensions-react/point-of-sale";
import { useState, useEffect, useCallback } from "react";

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

// ─── GraphQL Queries ─────────────────────────────────────────────────────────

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

// ─── Detail Screen ───────────────────────────────────────────────────────────

function CreditDetailScreen({ creditData, cartTotal, onBack }) {
  const {
    customerName,
    creditLimit,
    pendingTotal,
    availableCredit,
    currency,
    isOverLimit,
    hasLimit,
    pendingOrders,
  } = creditData;

  const cartPlusPending = cartTotal + pendingTotal;
  const remainingAfterCart = creditLimit - cartPlusPending;

  return (
    <Screen name="CreditDetails" title="Credit Limit Details">
      <ScrollView>
        <Stack direction="vertical" spacing="base" padding="base">
          {/* Status Banner */}
          <Section>
            <Stack direction="vertical" spacing="tight" alignment="center" padding="base">
              <Text variant="headingLarge" color={isOverLimit ? "critical" : "success"}>
                {isOverLimit ? "⛔ Over Credit Limit" : "✓ Within Credit Limit"}
              </Text>
              <Text variant="body" color="subdued">
                {customerName}
              </Text>
            </Stack>
          </Section>

          

          {/* Credit Summary */}
          <Section title="Credit Summary">
            <Stack direction="vertical" spacing="tight">
              <Stack direction="horizontal" spacing="base" alignment="spaceBetween">
                <Text variant="body" color="subdued">Credit Limit</Text>
                <Text variant="body" fontWeight="semibold">
                  {hasLimit ? formatCurrency(creditLimit, currency) : "Not set"}
                </Text>
              </Stack>

              <Stack direction="horizontal" spacing="base" alignment="spaceBetween">
                <Text variant="body" color="subdued">Pending Orders</Text>
                <Text
                  variant="body"
                  fontWeight="semibold"
                  color={pendingTotal > 0 ? "warning" : "default"}
                >
                  {formatCurrency(pendingTotal, currency)}
                </Text>
              </Stack>

              <Stack direction="horizontal" spacing="base" alignment="spaceBetween">
                <Text variant="body" color="subdued">Current Cart</Text>
                <Text variant="body" fontWeight="semibold">
                  {formatCurrency(cartTotal, currency)}
                </Text>
              </Stack>

              

              <Stack direction="horizontal" spacing="base" alignment="spaceBetween">
                <Text variant="body" color="subdued">Total Exposure</Text>
                <Text
                  variant="body"
                  fontWeight="bold"
                  color={isOverLimit ? "critical" : "default"}
                >
                  {formatCurrency(cartPlusPending, currency)}
                </Text>
              </Stack>

              {hasLimit && (
                <Stack direction="horizontal" spacing="base" alignment="spaceBetween">
                  <Text variant="body" color="subdued">Available After Cart</Text>
                  <Text
                    variant="bodyLarge"
                    fontWeight="bold"
                    color={remainingAfterCart < 0 ? "critical" : "success"}
                  >
                    {formatCurrency(remainingAfterCart, currency)}
                  </Text>
                </Stack>
              )}
            </Stack>
          </Section>

          {/* Pending Orders Detail */}
          {pendingOrders && pendingOrders.length > 0 && (
            <Section title={`Pending Orders (${pendingOrders.length})`}>
              <Stack direction="vertical" spacing="tight">
                {pendingOrders.map((order) => (
                  <Stack
                    key={order.id}
                    direction="horizontal"
                    spacing="base"
                    alignment="spaceBetween"
                  >
                    <Text variant="body" color="subdued">
                      {order.name}
                    </Text>
                    <Text variant="body">
                      {formatCurrency(order.amount, currency)}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            </Section>
          )}

          {/* No limit set message */}
          {!hasLimit && (
            <Section>
              <Stack direction="vertical" spacing="tight" padding="base">
                <Text variant="body" color="subdued" alignment="center">
                  No credit limit has been set for this customer.
                </Text>
                <Text variant="body" color="subdued" alignment="center">
                  Set a credit limit in the Shopify Admin under the customer profile.
                </Text>
              </Stack>
            </Section>
          )}
        </Stack>
      </ScrollView>
    </Screen>
  );
}

// ─── Main Tile Extension ─────────────────────────────────────────────────────

function CreditLimitTile() {
  const api = useApi();
  const cart = useCartSubscription();

  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const customer = cart?.customer;
  const cartTotal = cart?.totalPrice?.amount
    ? parseFloat(cart.totalPrice.amount)
    : 0;
  const currency = cart?.totalPrice?.currencyCode || "USD";

  const fetchCreditData = useCallback(
    async (customerId) => {
      if (!customerId) return;
      setLoading(true);
      setError(null);

      try {
        const response = await api.query(CUSTOMER_CREDIT_QUERY, {
          variables: {
            customerId: `gid://shopify/Customer/${customerId}`,
          },
        });

        const customerData = response?.data?.customer;
        if (!customerData) {
          throw new Error("Customer data not found");
        }

        const creditLimit = parseFloat(customerData.metafield?.value || "0");
        const pendingOrders =
          customerData.orders?.edges?.map(({ node }) => ({
            id: node.id,
            name: node.name,
            amount: parseFloat(node.totalPriceSet.shopMoney.amount),
          })) || [];
        const pendingTotal = pendingOrders.reduce(
          (sum, o) => sum + o.amount,
          0
        );
        const availableCredit = creditLimit - pendingTotal;
        const totalExposure = pendingTotal + cartTotal;
        const isOverLimit = creditLimit > 0 && totalExposure > creditLimit;

        setCreditData({
          customerName:
            `${customerData.firstName || ""} ${customerData.lastName || ""}`.trim() ||
            customerData.email ||
            "Customer",
          creditLimit,
          pendingTotal,
          pendingOrders,
          availableCredit,
          currency,
          isOverLimit,
          hasLimit: creditLimit > 0,
        });
      } catch (err) {
        console.error("Credit limit fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [cartTotal, currency, api]
  );

  // Re-fetch when customer or cart changes
  useEffect(() => {
    if (customer?.id) {
      fetchCreditData(customer.id);
    } else {
      setCreditData(null);
    }
  }, [customer?.id, cartTotal]);

  // Determine tile appearance
  let tileTitle = "Credit Limit";
  let tileSubtitle = "No customer";
  let tileColor = "default";

  if (loading) {
    tileSubtitle = "Checking...";
  } else if (error) {
    tileSubtitle = "Error loading";
    tileColor = "warning";
  } else if (!customer) {
    tileSubtitle = "Add a customer";
  } else if (creditData) {
    if (!creditData.hasLimit) {
      tileSubtitle = "No limit set";
    } else {
      const totalExposure = creditData.pendingTotal + cartTotal;
      const isOver = totalExposure > creditData.creditLimit;
      tileColor = isOver ? "critical" : "success";
      tileSubtitle = isOver
        ? `Over by ${formatCurrency(totalExposure - creditData.creditLimit, currency)}`
        : `${formatCurrency(creditData.creditLimit - totalExposure, currency)} available`;
    }
  }

  if (!customer) {
    return (
      <Tile
        title={tileTitle}
        subtitle={tileSubtitle}
        enabled={false}
      />
    );
  }

  return (
    <Navigator>
      <Screen name="Tile" title="Credit Limit">
        <Tile
          title={tileTitle}
          subtitle={tileSubtitle}
          color={tileColor}
          enabled={!!creditData}
          onPress={() => {
            if (creditData) {
              api.navigation.navigate("CreditDetails");
            }
          }}
        />
      </Screen>

      {creditData && (
        <CreditDetailScreen
          creditData={creditData}
          cartTotal={cartTotal}
          onBack={() => api.navigation.navigate("Tile")}
        />
      )}
    </Navigator>
  );
}

export const posHomeTile = reactExtension("pos.home.tile.render", () => <CreditLimitTile />);
