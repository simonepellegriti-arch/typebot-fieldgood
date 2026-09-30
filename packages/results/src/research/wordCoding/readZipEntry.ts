/**
 * Reads one file of a ZIP archive (a .docx is a ZIP) without dependencies:
 * central directory lookup + "deflate-raw" DecompressionStream, available in
 * modern browsers, Bun and Node 18+. Returns undefined when the entry is missing.
 */
export const readZipEntry = async (
  archive: Uint8Array,
  entryName: string,
): Promise<Uint8Array | undefined> => {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(view);
  if (endOfCentralDirectoryOffset === undefined)
    throw new Error("Not a valid .docx file (ZIP directory not found)");
  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  let offset = view.getUint32(endOfCentralDirectoryOffset + 16, true);
  const textDecoder = new TextDecoder();

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (view.getUint32(offset, true) !== centralDirectorySignature) break;
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileName = textDecoder.decode(
      archive.subarray(offset + 46, offset + 46 + fileNameLength),
    );
    offset += 46 + fileNameLength + extraFieldLength + commentLength;
    if (fileName !== entryName) continue;

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart =
      localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedData = archive.subarray(
      dataStart,
      dataStart + compressedSize,
    );
    if (compressionMethod === 0) return compressedData;
    if (compressionMethod !== 8)
      throw new Error(
        `Unsupported ZIP compression method ${compressionMethod}`,
      );
    return inflateRaw(compressedData);
  }
  return undefined;
};

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;

const findEndOfCentralDirectory = (view: DataView) => {
  const minimumOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset--)
    if (view.getUint32(offset, true) === endOfCentralDirectorySignature)
      return offset;
  return undefined;
};

const inflateRaw = async (compressedData: Uint8Array) => {
  // Copy into a standalone ArrayBuffer (Blob parts can't be shared buffers).
  const stream = new Blob([new Uint8Array(compressedData)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
