// Achica una foto elegida desde la computadora o el celular para guardarla con el producto.
// Firestore permite documentos de hasta 1 MB, así que apuntamos a menos de ~600 KB.
const MAX_SIDE = 900;
const MAX_LENGTH = 450_000; // caracteres del texto base64 (~330 KB como máximo)

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("formato"));
    };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("formato");
  const img = await loadImage(file);

  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.78, 0.68, 0.6]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_LENGTH) return dataUrl;
    }
    side = Math.round(side * 0.8);
  }
  throw new Error("tamaño");
}
