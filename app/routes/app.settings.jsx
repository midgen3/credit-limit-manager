import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Banner,
  Badge,
  Divider,
  Toast,
  Frame,
  List,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";

const SHOP_QUERY = `
  query getShop {
    shop {
      id
      name
      email
      myshopifyDomain
      plan {
        displayName
      }
      currencyCode
    }
  }
`;

const CHECK_METAFIELD_DEFINITION = `
  query checkMetafieldDefinition {
    metafieldDefinitions(first: 10, ownerType: CUSTOMER, namespace: "custom") {
      edges {
        node {
          id
          name
          namespace
          key
          type {
            name
          }
        }
      }
    }
  }
`;

const CREATE_METAFIELD_DEFINITION = `
  mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
        namespace
        key
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

  try {
    const [shopResponse, metafieldResponse] = await Promise.all([
      admin.graphql(SHOP_QUERY),
      admin.graphql(CHECK_METAFIELD_DEFINITION),
    ]);

    const shopData = await shopResponse.json();
    const metafieldData = await metafieldResponse.json();

    const shop = shopData.data?.shop || {};
    const definitions = metafieldData.data?.metafieldDefinitions?.edges?.map(({ node }) => node) || [];
    const creditLimitDefined = definitions.some(
      (d) => d.namespace === "custom" && d.key === "credit_limit"
    );

    return json({ shop, creditLimitDefined, definitions });
  } catch (error) {
    return json({ shop: {}, creditLimitDefined: false, definitions: [], error: error.message });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "create_metafield_definition") {
    try {
      const response = await admin.graphql(CREATE_METAFIELD_DEFINITION, {
        variables: {
          definition: {
            name: "Credit Limit",
            namespace: "custom",
            key: "credit_limit",
            type: "number_decimal",
            ownerType: "CUSTOMER",
            description: "Maximum credit amount allowed for this customer",
            validations: [
              {
                name: "min",
                value: "0",
              },
            ],
          },
        },
      });
      const data = await response.json();

      if (data.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
        return json({
          success: false,
          errors: data.data.metafieldDefinitionCreate.userErrors,
        });
      }

      return json({ success: true, action: "created_definition" });
    } catch (error) {
      return json({ success: false, error: error.message });
    }
  }

  return json({ success: false, error: "Unknown action" });
};

export default function Settings() {
  const { shop, creditLimitDefined, definitions, error } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const isLoading = navigation.state === "submitting";

  const handleCreateDefinition = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "create_metafield_definition");
    submit(formData, { method: "post" });
    setToastMessage("Metafield definition created");
    setToastActive(true);
  }, [submit]);

  return (
    <Frame>
      <Page>
        <TitleBar title="App Settings" />
        <BlockStack gap="500">
          {error && (
            <Banner tone="critical" title="Error">
              <p>{error}</p>
            </Banner>
          )}

          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Shop Information
                  </Text>
                  <Divider />
                  <InlineStack gap="400" align="space-between">
                    <Text as="p" variant="bodyMd">Shop Name</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{shop.name || "-"}</Text>
                  </InlineStack>
                  <InlineStack gap="400" align="space-between">
                    <Text as="p" variant="bodyMd">Domain</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{shop.myshopifyDomain || "-"}</Text>
                  </InlineStack>
                  <InlineStack gap="400" align="space-between">
                    <Text as="p" variant="bodyMd">Email</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{shop.email || "-"}</Text>
                  </InlineStack>
                  <InlineStack gap="400" align="space-between">
                    <Text as="p" variant="bodyMd">Plan</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{shop.plan?.displayName || "-"}</Text>
                  </InlineStack>
                  <InlineStack gap="400" align="space-between">
                    <Text as="p" variant="bodyMd">Currency</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{shop.currencyCode || "-"}</Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Setup Status
                    </Text>
                    <Divider />
                    <InlineStack gap="200" align="space-between">
                      <Text as="p" variant="bodyMd">Credit Limit Metafield</Text>
                      {creditLimitDefined ? (
                        <Badge tone="success">Configured</Badge>
                      ) : (
                        <Badge tone="warning">Not set up</Badge>
                      )}
                    </InlineStack>
                    {!creditLimitDefined && (
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Create the metafield definition to store credit limits on customer profiles.
                        </Text>
                        <Button
                          onClick={handleCreateDefinition}
                          loading={isLoading}
                          variant="primary"
                        >
                          Create Metafield Definition
                        </Button>
                      </BlockStack>
                    )}
                    {creditLimitDefined && (
                      <Text as="p" variant="bodySm" tone="success">
                        The credit_limit metafield is configured and ready to use.
                      </Text>
                    )}
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Extension Status
                    </Text>
                    <Divider />
                    <BlockStack gap="200">
                      <InlineStack gap="200" align="space-between">
                        <Text as="p" variant="bodyMd">POS Extension</Text>
                        <Badge>Deploy required</Badge>
                      </InlineStack>
                      <InlineStack gap="200" align="space-between">
                        <Text as="p" variant="bodyMd">Admin Block</Text>
                        <Badge>Deploy required</Badge>
                      </InlineStack>
                      <InlineStack gap="200" align="space-between">
                        <Text as="p" variant="bodyMd">Theme Block</Text>
                        <Badge>Deploy required</Badge>
                      </InlineStack>
                    </BlockStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Run <code>shopify app deploy</code> to deploy extensions.
                    </Text>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                How It Works
              </Text>
              <Divider />
              <Layout>
                <Layout.Section variant="oneThird">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">1. Set Credit Limits</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Go to the Customers page or use the Admin Block on individual customer profiles to set credit limits.
                    </Text>
                  </BlockStack>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">2. POS Monitoring</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      The POS tile automatically checks available credit when a customer is added to the cart. Green = OK, Red = Over limit.
                    </Text>
                  </BlockStack>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">3. Customer Portal</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Customers can see their credit limit, pending balance, and available credit in their account portal.
                    </Text>
                  </BlockStack>
                </Layout.Section>
              </Layout>
            </BlockStack>
          </Card>
        </BlockStack>

        {toastActive && (
          <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
        )}
      </Page>
    </Frame>
  );
}
