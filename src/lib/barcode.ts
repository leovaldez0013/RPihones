import "server-only";
import bwipjs from "bwip-js/node";

/** SVG de código de barras (Code 128) ou QR code, gerado no servidor. */
export function barcodeSvg(text: string, type: "code128" | "qrcode" = "code128"): string {
  const opts =
    type === "qrcode"
      ? { bcid: "qrcode", text, scale: 2, paddingwidth: 0, paddingheight: 0 }
      : { bcid: "code128", text, scale: 2, height: 8, includetext: false, paddingwidth: 0, paddingheight: 0 };
  try {
    return bwipjs.toSVG(opts);
  } catch (e) {
    console.error("[barcode]", e);
    return "";
  }
}
