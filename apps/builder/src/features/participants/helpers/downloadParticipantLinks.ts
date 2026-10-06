import Papa from "papaparse";

/**
 * The list with one more column, the personal link (CSV with ";" and BOM:
 * opens as columns in Italian Excel). Ready for SMS / WhatsApp mailings.
 */
export const downloadParticipantLinks = ({
  fileName,
  columns,
  participants,
  linkColumn,
  statusColumn,
}: {
  fileName: string;
  columns: string[];
  participants: {
    data: Record<string, string | number | boolean | null>;
    link: string;
    statusLabel: string;
  }[];
  linkColumn: string;
  statusColumn: string;
}) => {
  const csv = Papa.unparse(
    {
      fields: [...columns, linkColumn, statusColumn],
      data: participants.map((participant) => [
        ...columns.map((column) => String(participant.data[column] ?? "")),
        participant.link,
        participant.statusLabel,
      ]),
    },
    { delimiter: ";" },
  );
  const url = URL.createObjectURL(
    new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};
