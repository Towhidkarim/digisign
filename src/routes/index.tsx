import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  FileSignature,
  type LucideIcon,
  MousePointerClick,
  ShieldCheck,
  UserRoundX,
} from 'lucide-react';

import { Logo } from '#/components/logo.tsx';
import { ThemeToggle } from '#/components/theme-toggle.tsx';
import { Button } from '#/components/ui/button.tsx';
import { CheckCard } from '#/features/landing/check-card.tsx';
import { HeroSheet } from '#/features/landing/hero-sheet.tsx';
import { SigningOrder } from '#/features/landing/signing-order.tsx';

export const Route = createFileRoute('/')({ component: Home });

const WRAP = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

const PROMISES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: UserRoundX,
    title: 'Signers need no account',
    text: 'A link is all it takes. They open it, review the document and sign.',
  },
  {
    icon: MousePointerClick,
    title: 'Opening a link signs nothing',
    text: 'People read first. Signing starts only when they choose to review and sign.',
  },
  {
    icon: ShieldCheck,
    title: 'Checking needs no sign-in',
    text: 'Anyone with the finished PDF can check it, without having been part of the signing.',
  },
];

function Home() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header
        className={`${WRAP} flex items-center justify-between gap-4 py-4`}
      >
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/verify">Check a PDF</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <ThemeToggle />
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/signup">Create an account</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section
          aria-labelledby="landing-headline"
          className={`${WRAP} grid items-center gap-12 pt-8 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-14 lg:pb-24`}
        >
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-bg px-3 py-1 text-xs font-medium text-brand-fg">
              <FileSignature aria-hidden="true" className="size-3.5" />
              One signer at a time. Checkable by anyone.
            </p>
            <h1
              id="landing-headline"
              className="mt-5 max-w-[16ch] text-display font-semibold tracking-tight text-balance md:text-hero"
            >
              Signed documents, kept in the file itself.
            </h1>
            <p className="mt-5 max-w-[46ch] text-heading text-muted-foreground">
              You place the fields and set the order. People sign from a link,
              one after another. The finished PDF carries a record that anyone
              can check.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="max-sm:h-11">
                <Link to="/signup">
                  Create an account
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="max-sm:h-11"
              >
                <Link to="/verify">Check a signed PDF</Link>
              </Button>
            </div>
          </div>
          <HeroSheet />
        </section>

        <section
          aria-labelledby="landing-order"
          className="border-y border-border bg-card"
        >
          <div className={`${WRAP} py-16 lg:py-20`}>
            <h2
              id="landing-order"
              className="max-w-[24ch] text-title font-semibold tracking-tight text-balance"
            >
              The next person is invited only after the last one signs.
            </h2>
            <p className="mt-3 max-w-[56ch] text-muted-foreground">
              Signing runs in the order you set. Nobody gets a link early,
              nobody signs out of turn, and the record shows who signed when.
            </p>
            <div className="mt-10">
              <SigningOrder />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="landing-check"
          className={`${WRAP} grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24`}
        >
          <div>
            <h2
              id="landing-check"
              className="max-w-[22ch] text-title font-semibold tracking-tight text-balance"
            >
              The proof travels with the PDF.
            </h2>
            <p className="mt-3 max-w-[50ch] text-muted-foreground">
              When the last person signs, DigiSign adds a signed record to the
              file. Drop the PDF on the public check page and it tells you
              whether it is genuine and unchanged. No account, no phone call to
              the sender.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/verify">
                Try the check page
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <CheckCard />
        </section>

        <section
          aria-label="What to expect"
          className="border-t border-border bg-card"
        >
          <ul className={`${WRAP} grid gap-8 py-14 md:grid-cols-3 md:gap-10`}>
            {PROMISES.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <span className="grid size-10 place-items-center rounded-md bg-brand-bg text-brand-fg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-4 text-subheading font-semibold">
                    {item.title}
                  </h3>
                  <p className="mt-1 max-w-[34ch] text-small text-muted-foreground">
                    {item.text}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="landing-start"
          className={`${WRAP} py-16 lg:py-24`}
        >
          <div className="rounded-xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
            <h2
              id="landing-start"
              className="mx-auto max-w-[22ch] text-title font-semibold tracking-tight text-balance"
            >
              Send your first document today.
            </h2>
            <p className="mx-auto mt-3 max-w-[44ch] opacity-90">
              Upload a PDF, place the fields, name the signers and send. You can
              watch each signature arrive.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="max-sm:h-11"
              >
                <Link to="/signup">Create an account</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground max-sm:h-11"
              >
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div
          className={`${WRAP} flex flex-wrap items-center justify-between gap-4 py-6 text-small`}
        >
          <Logo to={null} />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/verify">Check a signed PDF</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/signup">Create an account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
