import {
  reactExtension,
  useCartSubscription,
  Tile,
} from "@shopify/ui-extensions-react/point-of-sale";
import { useState, useEffect } from "react";

// App proxy URL — Shopify signs and forwards this to Railway, no CORS issues
const PROXY_URL = "https://mgenius3.myshopify.com/apps/credit-limit";

function fmt(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function CreditLimitTile() {
  const cart = useCartSubscription();
  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(false);

  const customer = cart?.customer;
  const cartTotal = cart?.totalPrice?.amount ? parseFloat(cart.totalPrice.amount) : 0;

  useEffect(() => {
    if (!customer?.id) {
      setCreditData(null);
      return;
    }

    setLoading(true);

    // Extract numeric ID from GID if needed
    const numericId = String(customer.id).includes("/")
      ? String(customer.id).split("/").pop()
      : String(customer.id);

    fetch(`${PROXY_URL}?customer_id=${numericId}`)
      .then((r) => r.json())
      .then((json) => {
        const limit = parseFloat(json.credit_limit || json.creditLimit || 0);
        const pending = parseFloat(json.pending_total || json.pendingTotal || 0);
        setCreditData({ creditLimit: limit, pendingTotal: pending, hasLimit: limit > 0 });
      })
      .catch(() => {
        setCreditData({ creditLimit: 0, pendingTotal: 0, hasLimit: false });
      })
      .finally(() => setLoading(false));
  }, [customer?.id, cartTotal]);

  let subtitle = "Add a customer";
  let color = "default";
  let enabled = false;

  if (customer) {
    if (loading) {
      subtitle = "Checking...";
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
    <Tile
      title="Credit Limit"
      subtitle={subtitle}
      color={color}
      enabled={enabled}
      onPress={() => {}}
    />
  );
}

export const posHomeTile = reactExtension(
  "pos.home.tile.render",
  () => <CreditLimitTile />
);
