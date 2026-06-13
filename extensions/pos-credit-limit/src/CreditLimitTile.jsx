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
} from "@shopify/ui-extensions-react/point-of-sale";
import { useState, useEffect } from "react";

const APP_URL = "https://web-production-67b5f2.up.railway.app";

function fmt(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount || 0);
}

function CreditDetailScreen({ data, cartTotal }) {
  const { customerName, creditLimit, pendingTotal, hasLimit } = data;
  const totalExposure = pendingTotal + cartTotal;
  const available = creditLimit - totalExposure;
  const isOver = hasLimit && totalExposure > creditLimit;

  return (
    <Screen name="Details" title="Credit Limit">
      <ScrollView>
        <Stack direction="vertical" spacing="base" padding="base">
          <Section title="Customer">
            <Text variant="body">{customerName}</Text>
          </Section>

          <Section title="Credit Summary">
            <Stack direction="vertical" spacing="tight">
              <Stack direction="horizontal" alignment="spaceBetween">
                <Text variant="body" color="subdued">Credit Limit</Text>
                <Text variant="body" fontWeight="semibold">
                  {hasLimit ? fmt(creditLimit) : "Not set"}
                </Text>
              </Stack>
              <Stack direction="horizontal" alignment="spaceBetween">
                <Text variant="body" color="subdued">Pending Orders</Text>
                <Text variant="body" fontWeight="semibold">{fmt(pendingTotal)}</Text>
              </Stack>
              <Stack direction="horizontal" alignment="spaceBetween">
                <Text variant="body" color="subdued">Current Cart</Text>
                <Text variant="body" fontWeight="semibold">{fmt(cartTotal)}</Text>
              </Stack>
              <Stack direction="horizontal" alignment="spaceBetween">
                <Text variant="body" color="subdued">Total Exposure</Text>
                <Text variant="body" fontWeight="bold" color={isOver ? "critical" : "default"}>
                  {fmt(totalExposure)}
                </Text>
              </Stack>
              {hasLimit && (
                <Stack direction="horizontal" alignment="spaceBetween">
                  <Text variant="body" color="subdued">Available Credit</Text>
                  <Text variant="bodyLarge" fontWeight="bold" color={available < 0 ? "critical" : "success"}>
                    {fmt(available)}
                  </Text>
                </Stack>
              )}
            </Stack>
          </Section>

          {!hasLimit && (
            <Section>
              <Text variant="body" color="subdued">
                No credit limit set. Set one in the Shopify Admin customer profile.
              </Text>
            </Section>
          )}
        </Stack>
      </ScrollView>
    </Screen>
  );
}

function CreditLimitTile() {
  const api = useApi();
  const cart = useCartSubscription();

  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(false);

  const customer = cart?.customer;
  const cartTotal = cart?.totalPrice?.amount
    ? parseFloat(cart.totalPrice.amount)
    : 0;

  useEffect(() => {
    if (!customer?.id) {
      setCreditData(null);
      return;
    }

    setLoading(true);

    // Fetch credit data from our app proxy backend
    api.session
      .getSessionToken()
      .then((token) =>
        fetch(`${APP_URL}/apps/credit-limit?customer_id=${customer.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((r) => r.json())
      .then((json) => {
        setCreditData({
          customerName:
            [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
            customer.email ||
            "Customer",
          creditLimit: parseFloat(json.credit_limit || 0),
          pendingTotal: parseFloat(json.pending_total || 0),
          hasLimit: parseFloat(json.credit_limit || 0) > 0,
        });
      })
      .catch(() => {
        // If proxy fails, show tile without data
        setCreditData({
          customerName:
            [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Customer",
          creditLimit: 0,
          pendingTotal: 0,
          hasLimit: false,
        });
      })
      .finally(() => setLoading(false));
  }, [customer?.id, cartTotal]);

  // Tile appearance
  let subtitle = "Add a customer";
  let color = "default";
  let enabled = false;

  if (customer) {
    if (loading) {
      subtitle = "Checking...";
      enabled = false;
    } else if (creditData) {
      enabled = true;
      if (!creditData.hasLimit) {
        subtitle = "No limit set";
      } else {
        const totalExposure = creditData.pendingTotal + cartTotal;
        const isOver = totalExposure > creditData.creditLimit;
        color = isOver ? "critical" : "success";
        subtitle = isOver
          ? `Over by ${fmt(totalExposure - creditData.creditLimit)}`
          : `${fmt(creditData.creditLimit - totalExposure)} available`;
      }
    }
  }

  return (
    <Navigator>
      <Screen name="Tile" title="Credit Limit">
        <Tile
          title="Credit Limit"
          subtitle={subtitle}
          color={color}
          enabled={enabled}
          onPress={() => api.navigation.navigate("Details")}
        />
      </Screen>
      {creditData && (
        <CreditDetailScreen data={creditData} cartTotal={cartTotal} />
      )}
    </Navigator>
  );
}

export const posHomeTile = reactExtension(
  "pos.home.tile.render",
  () => <CreditLimitTile />
);
