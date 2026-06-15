import {
  reactExtension,
  useApi,
  useCartSubscription,
  Screen,
  ScrollView,
  Stack,
  Text,
  Banner,
  Section,
} from "@shopify/ui-extensions-react/point-of-sale";
import { useState, useEffect } from "react";

const PROXY_URL = "https://mgenius3.myshopify.com/apps/credit-limit";

function fmt(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function CreditLimitModal() {
  const api = useApi();
  const cart = useCartSubscription();

  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const customer = cart?.customer;
  const cartTotal = cart?.totalPrice?.amount ? parseFloat(cart.totalPrice.amount) : 0;

  useEffect(() => {
    if (!customer?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const numericId = String(customer.id).includes("/")
      ? String(customer.id).split("/").pop()
      : String(customer.id);

    fetch(`${PROXY_URL}?customer_id=${numericId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(json.error); return; }
        const limit = parseFloat(json.credit_limit || json.creditLimit || 0);
        const pending = parseFloat(json.pending_total || json.pendingTotal || 0);
        setCreditData({ creditLimit: limit, pendingTotal: pending });
      })
      .catch((e) => setError(`Network error: ${e?.message || e}`))
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
          <Banner title={error || ""} variant="error" visible={!!error} hideAction />

          {!customer && <Text>No customer added to this cart.</Text>}

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
                    <Text>{creditLimit > 0 ? fmt(creditLimit) : "No limit set"}</Text>
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
        </Stack>
      </ScrollView>
    </Screen>
  );
}

export const posHomeModal = reactExtension(
  "pos.home.modal.render",
  () => <CreditLimitModal />
);
