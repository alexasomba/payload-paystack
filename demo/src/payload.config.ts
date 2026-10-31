import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { paystackPlugin } from "payload-paystack-payments";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig, type CollectionConfig } from "payload";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  fields: [{ name: "name", type: "text", required: true }],
};

const Orders: CollectionConfig = {
  slug: "orders",
  fields: [
    { name: "email", type: "email", required: true },
    { name: "amountMinor", type: "number", required: true, min: 1 },
    { name: "currency", type: "text", required: true, defaultValue: "NGN" },
    { name: "status", type: "select", options: ["pending", "paid", "cancelled"], defaultValue: "pending" },
  ],
};

export default buildConfig({
  admin: {
    user: "users",
    importMap: { baseDir: dirname, autoGenerate: false },
  },
  collections: [Users, Orders],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
  }),
  editor: lexicalEditor(),
  plugins: [
    paystackPlugin({
      currency: "NGN",
      callbackUrl: process.env.NEXT_PUBLIC_SERVER_URL
        ? process.env.NEXT_PUBLIC_SERVER_URL + "/checkout/return"
        : undefined,
      resolveCheckout: async ({ req, orderId }) => {
        try {
          const order = await req.payload.findByID({
            collection: "orders",
            id: orderId,
            overrideAccess: true,
          });
          if (order.status !== "pending") return null;
          return {
            email: order.email,
            amount: order.amountMinor,
            currency: order.currency,
            metadata: { orderId: String(order.id) },
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET ?? "local-demo-secret-change-me",
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
