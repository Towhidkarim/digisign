import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'react-email';

import {
  color,
  FONT_STACK,
  TONES,
  type Tone,
} from '#/server/mail/templates/theme.ts';

export type EmailCardProps = {
  /** Shown by the inbox next to the subject. */
  preview: string;
  /** Status pill: a glyph and a word, so it never depends on color alone. */
  badge: { glyph: string; label: string; tone: Tone };
  heading: string;
  lead: string;
  /** The document the mail is about. */
  documentTitle: string;
  /** A quoted note, such as the reason for declining. */
  quote?: { label: string; text: string } | undefined;
  action?: { label: string; url: string } | undefined;
  /** The one line under the button. */
  footnote?: string | undefined;
};

const base = {
  fontFamily: FONT_STACK,
  margin: 0,
} as const;

/** One layout for every DigiSign mail: wordmark, a card on the desk, a quiet footer. */
export function DigiSignEmail(props: EmailCardProps) {
  const tone = TONES[props.badge.tone];
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{props.preview}</Preview>
      <Body
        style={{
          backgroundColor: color.bg,
          margin: 0,
          padding: '32px 12px',
          fontFamily: FONT_STACK,
        }}
      >
        <Container style={{ maxWidth: 560, margin: '0 auto' }}>
          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            style={{ marginBottom: 20 }}
          >
            <tbody>
              <tr>
                <td
                  align="center"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: color.brand,
                    borderRadius: 8,
                    color: color.onBrand,
                    fontFamily: FONT_STACK,
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: '32px',
                  }}
                >
                  D
                </td>
                <td
                  style={{
                    paddingLeft: 10,
                    fontFamily: FONT_STACK,
                    fontSize: 18,
                    fontWeight: 600,
                    color: color.ink,
                  }}
                >
                  DigiSign
                </td>
              </tr>
            </tbody>
          </table>

          <Section
            style={{
              backgroundColor: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: 12,
              padding: '28px 28px 32px',
            }}
          >
            <Text
              style={{
                ...base,
                display: 'inline-block',
                backgroundColor: tone.bg,
                color: tone.fg,
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 600,
              }}
            >
              {props.badge.glyph}&nbsp;&nbsp;{props.badge.label}
            </Text>

            <Heading
              as="h1"
              style={{
                ...base,
                marginTop: 16,
                fontSize: 24,
                lineHeight: '32px',
                fontWeight: 600,
                color: color.ink,
              }}
            >
              {props.heading}
            </Heading>
            <Text
              style={{
                ...base,
                marginTop: 8,
                fontSize: 15,
                lineHeight: '24px',
                color: color.inkMuted,
              }}
            >
              {props.lead}
            </Text>

            <Section
              style={{
                marginTop: 20,
                backgroundColor: color.surfaceSubtle,
                border: `1px solid ${color.border}`,
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <Text
                style={{
                  ...base,
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 600,
                  color: color.inkSubtle,
                }}
              >
                Document
              </Text>
              <Text
                style={{
                  ...base,
                  marginTop: 2,
                  fontSize: 15,
                  lineHeight: '22px',
                  fontWeight: 600,
                  color: color.ink,
                  wordBreak: 'break-word',
                }}
              >
                {props.documentTitle}
              </Text>
            </Section>

            {props.quote ? (
              <Section
                style={{
                  marginTop: 12,
                  backgroundColor: color.dangerBg,
                  borderLeft: `3px solid ${color.danger}`,
                  borderRadius: 4,
                  padding: '10px 14px',
                }}
              >
                <Text
                  style={{
                    ...base,
                    fontSize: 12,
                    lineHeight: '16px',
                    fontWeight: 600,
                    color: color.dangerFg,
                  }}
                >
                  {props.quote.label}
                </Text>
                <Text
                  style={{
                    ...base,
                    marginTop: 2,
                    fontSize: 14,
                    lineHeight: '22px',
                    color: color.dangerFg,
                    wordBreak: 'break-word',
                  }}
                >
                  {props.quote.text}
                </Text>
              </Section>
            ) : null}

            {props.action ? (
              <>
                <Section style={{ marginTop: 24 }}>
                  <Button
                    href={props.action.url}
                    style={{
                      backgroundColor: color.brand,
                      color: color.onBrand,
                      borderRadius: 8,
                      padding: '13px 24px',
                      fontFamily: FONT_STACK,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: '18px',
                      textDecoration: 'none',
                      display: 'inline-block',
                    }}
                  >
                    {props.action.label}
                  </Button>
                </Section>
                <Text
                  style={{
                    ...base,
                    marginTop: 20,
                    fontSize: 12,
                    lineHeight: '18px',
                    color: color.inkSubtle,
                  }}
                >
                  Button not working? Copy this link into your browser:
                </Text>
                <Text
                  style={{
                    ...base,
                    marginTop: 2,
                    fontSize: 12,
                    lineHeight: '18px',
                    wordBreak: 'break-all',
                  }}
                >
                  <Link href={props.action.url} style={{ color: color.brand }}>
                    {props.action.url}
                  </Link>
                </Text>
              </>
            ) : null}

            {props.footnote ? (
              <>
                <Hr
                  style={{
                    borderColor: color.border,
                    margin: '24px 0 16px',
                  }}
                />
                <Text
                  style={{
                    ...base,
                    fontSize: 13,
                    lineHeight: '20px',
                    color: color.inkMuted,
                  }}
                >
                  {props.footnote}
                </Text>
              </>
            ) : null}
          </Section>

          <Text
            style={{
              ...base,
              marginTop: 20,
              padding: '0 8px',
              fontSize: 12,
              lineHeight: '18px',
              color: color.inkSubtle,
              textAlign: 'center',
            }}
          >
            Sent by DigiSign. Any signed document can be checked on the verify
            page.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
