import { Link } from '@tanstack/react-router';

import { Button } from '#/components/ui/button.tsx';
import { VerifyLayout } from '#/features/verify/verify-layout.tsx';

/** The page for any address that matches no route. */
export function NotFound() {
  return (
    <VerifyLayout>
      <h1 className="text-title font-semibold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-2 text-muted-foreground">
        This address doesn't match a page. Check the link, or go back to the
        start.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild className="max-sm:min-h-11">
          <Link to="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="outline" className="max-sm:min-h-11">
          <Link to="/verify">Check a signed PDF</Link>
        </Button>
      </div>
    </VerifyLayout>
  );
}
