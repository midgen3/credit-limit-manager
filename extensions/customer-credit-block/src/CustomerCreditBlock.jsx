import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
  InlineStack,
  Box,
} from "@shopify/ui-extensions-react/admin";
import { useState, useEffect } from "react";

function CustomerCreditBlock() {
  const { data, fetch: apiFetch } = useApi("admin.customer-details.block.render");
  const customerId = data?.customer?.id;

  const [creditLimit, setCreditLimit] = useState("");
  const [pendingTotal, setPendingTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);

    apiFetch("shopify:admin/api/2025-07/graphql.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query GetCustomerCredit($id: ID!) {
          customer(id: $id) {
            metafield(namespace: "custom", key: "credit_limit") { value }
            orders(first: 250, query: "financial_status:pending") {
              edges { node { totalPriceSet { shopMoney { amount } } } }
            }
          }
        }`,
        variables: { id: customerId },
      }),
    })
      .then((r) => r.json())
      .then(({ data: d }) => {
        const limit = d?.customer?.metafield?.value || "";
        setCreditLimit(limit);
        const total = (d?.customer?.orders?.edges || []).reduce(
          (sum, { node }) => sum + parseFloat(node.totalPriceSet.shopMoney.amount || 0),
          0
        );
        setPendingTotal(total);
      })
      .catch(() => setError("Failed to load credit data"))
      .finally(() => setLoading(false));
  }, [customerId]);

  const handleSave = () => {
    if (!customerId || !creditLimit) return;
    setSaving(true);
    setSaved(false);

    apiFetch("shopify:admin/api/2025-07/graphql.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation SetCreditLimit($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }`,
        variables: {
          input: {
            id: customerId,
            metafields: [
              { namespace: "custom", key: "credit_limit", value: String(creditLimit), type: "number_decimal" },
            ],
          },
        },
      }),
    })
      .then(() => setSaved(true))
      .catch(() => setError("Failed to save"))
      .finally(() => setSaving(false));
  };

  const fmt = (n) =>
    typeof n === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
      : "—";

  const limit = parseFloat(creditLimit) || 0;
  const available = limit - (pendingTotal || 0);
  const isOverLimit = pendingTotal !== null && limit > 0 && pendingTotal > limit;

  return (
    <AdminBlock title="Credit Limit">
      <BlockStack gap="base">
        {error && <Banner tone="critical">{error}</Banner>}
        {saved && <Banner tone="success">Credit limit saved successfully.</Banner>}

        <TextField
          label="Credit Limit ($)"
          value={creditLimit}
          onChange={setCreditLimit}
          type="number"
          disabled={loading}
        />

        {pendingTotal !== null && (
          <BlockStack gap="extraTight">
            <InlineStack inlineAlignment="space-between">
              <Text fontWeight="semibold">Pending Orders Total</Text>
              <Text tone={isOverLimit ? "critical" : "base"}>{fmt(pendingTotal)}</Text>
            </InlineStack>
            <InlineStack inlineAlignment="space-between">
              <Text fontWeight="semibold">Available Credit</Text>
              <Text tone={available < 0 ? "critical" : "success"}>{fmt(available)}</Text>
            </InlineStack>
          </BlockStack>
        )}

        <Box>
          <Button onPress={handleSave} loading={saving} disabled={loading || !creditLimit}>
            Save Credit Limit
          </Button>
        </Box>
      </BlockStack>
    </AdminBlock>
  );
}

export default reactExtension(
  "admin.customer-details.block.render",
  () => <CustomerCreditBlock />
);
