import {
  reactExtension,
  useApi,
  useCartSubscription,
  Tile,
} from "@shopify/ui-extensions-react/point-of-sale";
import { useState, useEffect } from "react";

const APP_URL = "https://web-production-67b5f2.up.railway.app";
const POS_API = `${APP_URL}/pos/credit-limit`;

function fmt(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function CreditLimitTile() {
  const api = useApi();
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

    api.session
      .getSessionToken()
      .then((token) =>
        fetch(`${POS_API}?customer_id=${customer.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      )
      .then((r) => r.json())
      .then((json) => {
        setCreditData({
          creditLimit: parseFloat(json.credit_limit || 0),
          pendingTotal: parseFloat(json.pending_total || 0),
          hasLimit: parseFloat(json.credit_limit || 0) > 0,
        });
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
      onPress={() => api.action.presentModal()}
    />
  );
}

export const posHomeTile = reactExtension(
  "pos.home.tile.render",
  () => <CreditLimitTile />
);
