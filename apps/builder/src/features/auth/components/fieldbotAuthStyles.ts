/** Shared classes of the FIELDBOT access forms. */
export const fieldbotAuthStyles = {
  label: "block text-[16px] text-[#777] mb-1.5",
  input:
    "w-full h-[42px] rounded-[3px] border border-[#ccc] bg-white px-3 text-[16px] text-[#333] outline-none transition-colors focus:border-[#0b6bb5] focus:ring-1 focus:ring-[#0b6bb5] disabled:bg-[#f2f2f2]",
  button:
    "h-[36px] min-w-[80px] rounded-[3px] bg-[#2a7ac0] px-5 text-[16px] text-white transition-colors hover:bg-[#1f6aab] disabled:opacity-60",
  error:
    "rounded-[3px] border border-[#e9b4b4] bg-[#fdf1f1] px-3 py-2 text-[14px] text-[#a12b2b]",
  success:
    "rounded-[3px] border border-[#b6dcb8] bg-[#f0f9f0] px-3 py-2 text-[14px] text-[#26662b]",
  hint: "text-[13px] text-[#888]",
  link: "text-[#2a7ac0] hover:underline",
} as const;
