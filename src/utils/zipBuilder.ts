export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
  date?: Date;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes the IEEE 802.3 CRC-32 checksum for a byte buffer.
 */
export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Packages one or more binary entries into a standard uncompressed (Store) PKZIP archive.
 * Ideal for already-compressed payloads such as JPEG images.
 */
export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();

  interface PreparedEntry {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    dosTime: number;
    dosDate: number;
    localHeaderOffset: number;
  }

  const prepared: PreparedEntry[] = [];
  let localSectionSize = 0;
  let centralDirSize = 0;

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/^\/+/, '');
    const nameBytes = encoder.encode(normalizedName);
    const { dosTime, dosDate } = toDosTimeDate(entry.date || new Date());
    const crc = computeCrc32(entry.data);

    prepared.push({
      nameBytes,
      data: entry.data,
      crc,
      dosTime,
      dosDate,
      localHeaderOffset: localSectionSize,
    });

    localSectionSize += 30 + nameBytes.length + entry.data.length;
    centralDirSize += 46 + nameBytes.length;
  }

  const totalSize = localSectionSize + centralDirSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let offset = 0;

  // 1. Local file headers + file data
  for (const item of prepared) {
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(offset + 8, 0, true); // Compression method: 0 = Store
    view.setUint16(offset + 10, item.dosTime, true);
    view.setUint16(offset + 12, item.dosDate, true);
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.data.length, true); // Compressed size
    view.setUint32(offset + 22, item.data.length, true); // Uncompressed size
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // Extra field length
    offset += 30;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;

    out.set(item.data, offset);
    offset += item.data.length;
  }

  const centralDirOffset = offset;

  // 2. Central directory file headers
  for (const item of prepared) {
    view.setUint32(offset, 0x02014b50, true); // Central directory header signature
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(offset + 10, 0, true); // Compression method: 0 = Store
    view.setUint16(offset + 12, item.dosTime, true);
    view.setUint16(offset + 14, item.dosDate, true);
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.data.length, true); // Compressed size
    view.setUint32(offset + 24, item.data.length, true); // Uncompressed size
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // Extra field length
    view.setUint16(offset + 32, 0, true); // File comment length
    view.setUint16(offset + 34, 0, true); // Disk number start
    view.setUint16(offset + 36, 0, true); // Internal file attributes
    view.setUint32(offset + 38, 0, true); // External file attributes
    view.setUint32(offset + 42, item.localHeaderOffset, true);
    offset += 46;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
  }

  // 3. End of central directory record
  view.setUint32(offset, 0x06054b50, true); // End of central directory signature
  view.setUint16(offset + 4, 0, true); // Number of this disk
  view.setUint16(offset + 6, 0, true); // Disk where central directory starts
  view.setUint16(offset + 8, prepared.length, true); // Entries on this disk
  view.setUint16(offset + 10, prepared.length, true); // Total entries
  view.setUint32(offset + 12, centralDirSize, true); // Size of central directory
  view.setUint32(offset + 16, centralDirOffset, true); // Offset of central directory
  view.setUint16(offset + 20, 0, true); // Comment length

  return out;
}
