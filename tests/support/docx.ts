/**
 * Generador mínimo de ZIP (sin compresión) y DOCX para pruebas, sin
 * dependencias. Suficiente para que mammoth lea el documento.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function u16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function u32(value: number) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

export function createZip(
  files: { name: string; content: string; declaredSize?: number }[]
): Uint8Array {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const offset = local.length;
    const size = file.declaredSize ?? data.length;
    local.push(
      ...u32(0x04_03_4b_50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...data
    );
    central.push(
      ...u32(0x02_01_4b_50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(size),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name
    );
  }
  const end = [
    ...u32(0x06_05_4b_50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(local.length),
    ...u16(0),
  ];
  return new Uint8Array([...local, ...central, ...end]);
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** DOCX con párrafos; los que empiezan por "# " usan el estilo Heading1. */
export function createDocx(paragraphs: string[]): Uint8Array {
  const body = paragraphs
    .map((paragraph) => {
      const isHeading = paragraph.startsWith("# ");
      const text = escapeXml(isHeading ? paragraph.slice(2) : paragraph);
      const style = isHeading
        ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
        : "";
      return `<w:p>${style}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join("");
  return createZip([
    {
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      name: "[Content_Types].xml",
    },
    {
      content:
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      name: "_rels/.rels",
    },
    {
      content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
      name: "word/document.xml",
    },
  ]);
}
