import {
  reactExtension,
  useApi,
  useCartSubscription,
  Screen,
  ScrollView,
  Stack,
  Text,
  Button,
  Banner,
  Section,
} from "@shopify/ui-extensions-react/point-of-sale";
import { useState, useEffect } from "react";

const APP_URL = "https://web-production-67b5f2.up.railway.app";
const POS_API = `${APP_URL}/pos-credit-limit`;

function fmt(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function CreditLimitModal() {
  const api = useApi();
  const cart = useCartSubscription();

  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const customer = cart?.customer;
  const cartTotal = cart?.totalPrice?.amount ? parseFloat(cart.totalPrice.amount) : 0;

  useEffect(() => {
    if (!customer?.id) return;

    setLoading(true);
    setError(null);

    api.session
      .getSessionToken()
      .then((token) => {
        const url = `${POS_API}?customer_id=${customer.id}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
        return fetch(url);
      })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(`${json.error}: ${json.detail || ""} (shop: ${json.shop || "?"})`);
          return;
        }
        setCreditData({
          creditLimit: parseFloat(json.credit_limit || 0),
          pendingTotal: parseFloat(json.pending_total || 0),
        });
      })
      .catch((e) => setError(`Fetch failed: ${e?.message || e}`))
      .finally(() => setLoading(false));
  }, [customer?.id]);

  const creditLimit = creditData?.creditLimit || 0;
  const pendingTotal = creditData?.pendingTotal || 0;
  const totalExposure = pendingTotal + cartTotal;
  const available = creditLimit - totalExposure;
  const isOver = creditLimit > 0 && totalExposure > creditLimit;

  return (
    <Screen title="Credit Limit" name="CreditLimitScreen">
      <ScrollView>
        <Stack direction="block" gap="base" paddingBlock="base" paddingInline="base">
          <Banner
            title={error || ""}
            variant="error"
            visible={!!error}
            hideAction
          />

          {!customer && (
            <Text>No customer added to this cart.</Text>
          )}

          {customer && (
            <Stack direction="block" gap="base">
              <Text variant="headingLarge">
                {customer.firstName} {customer.lastName}
              </Text>

              {loading ? (
                <Text>Loading...</Text>
              ) : (
                <Stack direction="block" gap="base">
                  <Section title="Credit Limit">
                    <Text>
                      {creditLimit > 0 ? fmt(creditLimit) : "No limit set"}
                    </Text>
                  </Section>

                  <Section title="Pending Orders">
                    <Text>{fmt(pendingTotal)}</Text>
                  </Section>

                  <Section title="Current Cart">
                    <Text>{fmt(cartTotal)}</Text>
                  </Section>

                  <Section title="Available Credit">
                    <Text color={isOver ? "TextCritical" : "TextSuccess"}>
                      {creditLimit > 0 ? fmt(available) : "—"}
                    </Text>
                  </Section>

                  <Banner
                    title={`Over limit by ${fmt(totalExposure - creditLimit)}`}
                    variant="error"
                    visible={isOver}
                    hideAction
                  />
                </Stack>
              )}
            </Stack>
          )}

          <Button title="Close" onPress={() => api.action.closeModal()} />
        </Stack>
      </ScrollView>
    </Screen>
  );
}

export const posHomeModal = reactExtension(
  "pos.home.modal.render",
  () => <CreditLimitModal />
);
