import { ImageResponse } from "next/og";

import { getShopfrontTenant } from "./data";

export const alt = "Bukay shopfront booking page";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type ShopfrontImageProps = {
  params: { slug: string };
};

export default async function OpenGraphImage({ params }: ShopfrontImageProps) {
  const tenant = await getShopfrontTenant(params.slug);
  const shopfrontName = tenant?.name.trim() || "Bukay Shopfront";

  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#020617",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        padding: "96px",
        width: "100%",
      }}
    >
      <div style={{ color: "#6ee7b7", display: "flex", fontSize: 36, fontWeight: 700 }}>BUKAY</div>
      <div style={{ display: "flex", fontSize: 72, fontWeight: 700, marginTop: 28 }}>
        {shopfrontName}
      </div>
      <div style={{ color: "#cbd5e1", display: "flex", fontSize: 36, marginTop: 28 }}>
        Book an appointment online
      </div>
    </div>,
    size
  );
}
