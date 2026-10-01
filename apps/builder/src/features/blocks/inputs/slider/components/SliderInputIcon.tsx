import { Icon } from "@typebot.io/ui/components/Icon";

export const SliderInputIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M3 12h7" />
    <path d="M16 12h5" />
    <circle cx="13" cy="12" r="3" />
    <path d="M3 17v1M21 17v1M12 17v1" />
  </Icon>
);
