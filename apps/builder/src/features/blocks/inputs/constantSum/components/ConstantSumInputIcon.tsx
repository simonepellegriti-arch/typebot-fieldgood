import { Icon } from "@typebot.io/ui/components/Icon";

export const ConstantSumInputIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9l6.4 6.4" />
    <path d="M12 12H3" />
  </Icon>
);
