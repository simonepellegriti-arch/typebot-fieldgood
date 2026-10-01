import { useTranslate } from "@tolgee/react";
import { WorkspaceRole } from "@typebot.io/prisma/enum";
import { Avatar } from "@typebot.io/ui/components/Avatar";
import { Badge } from "@typebot.io/ui/components/Badge";
import { Menu } from "@typebot.io/ui/components/Menu";
import { cx } from "@typebot.io/ui/lib/cva";
import type { ReactNode } from "react";
import { convertWorkspaceRoleToReadable } from "./AddMemberForm";

type Props = {
  image?: string;
  name?: string;
  email: string;
  role: WorkspaceRole;
  isGuest?: boolean;
  isMe?: boolean;
  canEdit: boolean;
  onDeleteClick: () => void;
  onSelectNewRole: (role: WorkspaceRole) => void;
  /** Sends a link to create / reset the password (admins only). */
  onSendPasswordLinkClick?: () => void;
  /** Buttons shown next to the member (pending invitations: send / copy access link). */
  actions?: ReactNode;
};

export const MemberItem = ({
  email,
  name,
  image,
  role,
  isGuest = false,
  isMe = false,
  canEdit,
  onDeleteClick,
  onSelectNewRole,
  onSendPasswordLinkClick,
  actions,
}: Props) => {
  const { t } = useTranslate();
  const handleAdminClick = () => onSelectNewRole(WorkspaceRole.ADMIN);
  const handleMemberClick = () => onSelectNewRole(WorkspaceRole.MEMBER);

  return (
    <div className="flex flex-col gap-1">
      <Menu.Root>
        <Menu.Trigger className="hover:bg-gray-2 rounded-md transition-colors">
          <MemberIdentityContent
            email={email}
            name={name}
            image={image}
            isGuest={isGuest}
            tag={convertWorkspaceRoleToReadable(role)}
          />
        </Menu.Trigger>
        {!isMe && canEdit && (
          <Menu.Popup>
            <Menu.Item onClick={handleAdminClick}>
              {convertWorkspaceRoleToReadable(WorkspaceRole.ADMIN)}
            </Menu.Item>
            <Menu.Item onClick={handleMemberClick}>
              {convertWorkspaceRoleToReadable(WorkspaceRole.MEMBER)}
            </Menu.Item>
            {onSendPasswordLinkClick && (
              <Menu.Item onClick={onSendPasswordLinkClick}>
                {t("workspace.membersList.accessLink.resetPassword")}
              </Menu.Item>
            )}
            <Menu.Item className="text-red-10" onClick={onDeleteClick}>
              {t("remove")}
            </Menu.Item>
          </Menu.Popup>
        )}
      </Menu.Root>
      {actions && (
        <div className="flex flex-wrap justify-end gap-2 px-2 pb-1">
          {actions}
        </div>
      )}
    </div>
  );
};

export const MemberIdentityContent = ({
  name,
  tag,
  isGuest = false,
  image,
  email,
}: {
  name?: string;
  tag?: string;
  image?: string;
  isGuest?: boolean;
  email: string;
}) => {
  const { t } = useTranslate();

  return (
    <div className="flex items-center gap-2 justify-between max-w-full p-2">
      <div className="flex items-center min-w-0 gap-4">
        <Avatar.Root className="size-12">
          <Avatar.Image src={image} alt="User" />
          <Avatar.Fallback>{name?.charAt(0)}</Avatar.Fallback>
        </Avatar.Root>
        <div className="flex flex-col gap-0 min-w-0">
          {name && <p className="text-left text-[15px]">{name}</p>}
          <p
            className={cx(
              "truncate text-gray-9",
              name ? "text-sm" : "text-base",
            )}
          >
            {email}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isGuest && <Badge className="text-gray-8">{t("pending")}</Badge>}
        <Badge>{tag}</Badge>
      </div>
    </div>
  );
};
