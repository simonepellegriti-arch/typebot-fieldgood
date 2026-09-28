import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import type { SendMailOptions } from "nodemailer";
import type { ComponentProps } from "react";
import * as React from "react";
import { sendEmail } from "../helpers/sendEmail";
import { Logo } from "./components/Logo";
import {
  codeStyle,
  container,
  footerText,
  heading,
  hr,
  main,
  paragraph,
} from "./styles";

void React;

interface Props {
  code: string;
}

export const VerificationCodeEmail = ({ code }: Props) => (
  <Html>
    <Head />
    <Preview>Your verification code for FIELDBOT</Preview>
    <Body style={main}>
      <Container style={container}>
        <Logo />
        <Heading style={heading}>Your verification code for FIELDBOT</Heading>
        <code style={codeStyle}>{code}</code>
        <Text style={paragraph}>
          This code will only be valid for the next hour.
        </Text>
        <Hr style={hr} />
        <Text style={footerText}>FIELDBOT by Fieldgood</Text>
      </Container>
    </Body>
  </Html>
);

VerificationCodeEmail.PreviewProps = {
  code: "free-rrree-free-rrree",
} as Props;

export default VerificationCodeEmail;

export const sendVerificationCodeEmail = async ({
  to,
  ...props
}: Pick<SendMailOptions, "to"> &
  ComponentProps<typeof VerificationCodeEmail>) =>
  sendEmail({
    to,
    subject: "Your verification code for FIELDBOT",
    html: await render(<VerificationCodeEmail {...props} />),
  });
