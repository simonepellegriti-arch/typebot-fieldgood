/**
 * Duration of an MP4 / MOV / 3GP file read from its "mvhd" header, without
 * decoding it: works for videos the browser can't play (e.g. HEVC iPhone
 * videos on some desktops). Only box headers are read, even for large files.
 */
export const readIsoMediaDurationSeconds = async (
  file: Blob,
): Promise<number | undefined> => {
  const moov = await findBox(file, 0, file.size, "moov");
  if (!moov) return;
  const mvhd = await findBox(file, moov.contentStart, moov.end, "mvhd");
  if (!mvhd) return;
  const header = new DataView(
    await file.slice(mvhd.contentStart, mvhd.contentStart + 32).arrayBuffer(),
  );
  if (header.byteLength < 20) return;
  const version = header.getUint8(0);
  if (version === 1) {
    if (header.byteLength < 32) return;
    const timescale = header.getUint32(20);
    const duration = header.getBigUint64(24);
    return timescale > 0 ? Number(duration) / timescale : undefined;
  }
  const timescale = header.getUint32(12);
  const duration = header.getUint32(16);
  return timescale > 0 ? duration / timescale : undefined;
};

const maxBoxesToScan = 1000;

const findBox = async (
  file: Blob,
  start: number,
  end: number,
  type: string,
): Promise<{ contentStart: number; end: number } | undefined> => {
  let offset = start;
  for (let index = 0; index < maxBoxesToScan && offset + 8 <= end; index++) {
    const header = new DataView(
      await file.slice(offset, Math.min(offset + 16, end)).arrayBuffer(),
    );
    if (header.byteLength < 8) return;
    let size = header.getUint32(0);
    const boxType = String.fromCharCode(
      header.getUint8(4),
      header.getUint8(5),
      header.getUint8(6),
      header.getUint8(7),
    );
    let headerSize = 8;
    if (size === 1) {
      if (header.byteLength < 16) return;
      size = Number(header.getBigUint64(8));
      headerSize = 16;
    } else if (size === 0) size = end - offset;
    if (size < headerSize) return;
    if (boxType === type)
      return { contentStart: offset + headerSize, end: offset + size };
    offset += size;
  }
  return;
};
