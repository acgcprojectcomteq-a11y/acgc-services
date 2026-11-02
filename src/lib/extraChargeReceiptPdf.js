import { toPng } from "html-to-image";
import jsPDF from "jspdf";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;

const loadImage = (source) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("The receipt preview could not be converted to PDF."));
  image.src = source;
});

export const generateExtraChargeReceiptPdf = async (iframe) => {
  const document = iframe?.contentDocument;
  const receipt = document?.querySelector(".sheet");
  if (!receipt) throw new Error("The receipt preview is still loading. Please try again.");

  const imageSource = await toPng(receipt, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
  });
  const image = await loadImage(imageSource);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("The receipt preview is empty and cannot be sent.");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageSourceHeight = (image.naturalWidth * PAGE_HEIGHT_MM) / PAGE_WIDTH_MM;
  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < image.naturalHeight) {
    const sourceHeight = Math.min(pageSourceHeight, image.naturalHeight - sourceY);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = Math.ceil(sourceHeight);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The receipt preview could not be prepared as a PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

    if (pageIndex > 0) pdf.addPage("a4", "portrait");
    const pageHeightMm = (sourceHeight * PAGE_WIDTH_MM) / image.naturalWidth;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, PAGE_WIDTH_MM, pageHeightMm, undefined, "FAST");
    sourceY += sourceHeight;
    pageIndex += 1;
  }

  return pdf.output("blob");
};
