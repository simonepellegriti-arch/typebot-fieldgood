import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import type { ComponentProps } from "react";
import * as React from "react";
import { sendEmail } from "../helpers/sendEmail";
import { Logo } from "./components/Logo";
import {
  container,
  footerText,
  hr,
  main,
  paragraph,
  primaryButton,
} from "./styles";

void React;

interface Props {
  url: string;
  email: string;
  workspaceName: string;
  hostEmail: string;
  isNewUser: boolean;
}

/** Invitation / reset link to create the FIELDBOT password (Italian: the team's language). */
export const PasswordSetupEmail = ({
  url,
  email,
  workspaceName,
  hostEmail,
  isNewUser,
}: Props) => (
  <Html>
    <Head />
    <Body style={main}>
      <Container style={container}>
        <Logo />
        <Text style={paragraph}>
          {isNewUser ? (
            <>
              {hostEmail} ti ha invitato a usare FIELDBOT nello spazio di lavoro{" "}
              <strong>{workspaceName}</strong>.
            </>
          ) : (
            <>
              {hostEmail} ti ha inviato il link per impostare la password di
              FIELDBOT.
            </>
          )}
          <br />
          <br />
          Clicca il pulsante qui sotto per creare la tua password. Poi potrai
          accedere con <i>{email}</i> e la password scelta.
        </Text>
        <Button href={url} style={primaryButton}>
          Crea la password
        </Button>
        <Text style={paragraph}>Il link è personale e scade tra 7 giorni.</Text>
        <Hr style={hr} />
        <Text style={footerText}>FIELDBOT by Fieldgood</Text>
      </Container>
    </Body>
  </Html>
);

PasswordSetupEmail.PreviewProps = {
  url: "https://typebot-fg-builder.vercel.app/set-password?token=abc",
  email: "nuovo@fieldgood.it",
  workspaceName: "Fieldgood",
  hostEmail: "admin@fieldgood.it",
  isNewUser: true,
} as Props;

export default PasswordSetupEmail;

export const sendPasswordSetupEmail = async (
  props: ComponentProps<typeof PasswordSetupEmail>,
) =>
  sendEmail({
    to: props.email,
    subject: props.isNewUser
      ? "Il tuo accesso a FIELDBOT"
      : "Imposta la tua password FIELDBOT",
    html: await render(<PasswordSetupEmail {...props} />),
    replyTo: props.hostEmail,
  });
