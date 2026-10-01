import type { ReactNode } from "react";

/**
 * FIELDBOT access pages: blue band with the wordmark and a white card on top
 * of it. Fixed light colors: these pages look the same in dark mode.
 */
export const FieldbotAuthLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-dvh bg-[#f6f8fa] text-[#333]">
    <div className="bg-[#0b6bb5] h-[165px] flex justify-center">
      <div className="flex items-center gap-3 pt-6 h-[110px] select-none">
        <FieldbotMark />
        <span className="text-white font-black text-[44px] sm:text-[56px] tracking-tight leading-none">
          FIELDBOT
        </span>
      </div>
    </div>
    <main className="flex justify-center px-4 -mt-[58px] pb-10">
      <div className="w-full max-w-[430px] bg-white rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.18)] px-6 sm:px-10 pt-10 pb-6">
        {children}
      </div>
    </main>
  </div>
);

/** Speech-bubble mark next to the wordmark. */
const FieldbotMark = () => (
  <svg
    viewBox="0 0 48 48"
    className="w-11 h-11 sm:w-14 sm:h-14"
    aria-hidden="true"
  >
    <path
      d="M24 4C12.4 4 3 12.1 3 22.2c0 5.8 3.1 11 8 14.3L9.5 44l8.4-4.5c1.9.5 4 .8 6.1.8 11.6 0 21-8.1 21-18.1S35.6 4 24 4Z"
      fill="white"
    />
    <circle cx="16" cy="22" r="3" fill="#0b6bb5" />
    <circle cx="24" cy="22" r="3" fill="#0b6bb5" />
    <circle cx="32" cy="22" r="3" fill="#0b6bb5" />
  </svg>
);
