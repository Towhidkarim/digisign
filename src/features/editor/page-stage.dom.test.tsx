import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Like react-pdf, the pages mount only after the file has loaded.
vi.mock('react-pdf', async () => {
  const { useEffect, useState } = await import('react');
  return {
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children: React.ReactNode;
      onLoadSuccess?: () => void;
    }) => {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        const id = setTimeout(() => {
          setReady(true);
          onLoadSuccess?.();
        }, 0);
        return () => clearTimeout(id);
      }, [onLoadSuccess]);
      return <div>{ready ? children : null}</div>;
    },
    Page: ({ pageNumber }: { pageNumber: number }) => (
      <div data-testid={`pdf-page-${pageNumber}`} />
    ),
  };
});
vi.mock('#/pdf/setup.ts', () => ({}));

import type { PageGeometry } from '#/core/coords.ts';
import { PageStage } from '#/features/editor/page-stage.tsx';
import { createEditorState } from '#/features/editor/reducer.ts';

// jsdom has no layout, so every observed page reports itself as on screen.
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    queueMicrotask(() =>
      this.callback(
        [{ target, isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }
  unobserve() {}
  disconnect() {}
}

const page: PageGeometry = {
  mediaBox: [0, 0, 612, 792],
  cropBox: [0, 0, 612, 792],
  rotate: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PageStage', () => {
  it('draws every page of a multi-page PDF after it loads', async () => {
    vi.stubGlobal('IntersectionObserver', VisibleObserver);
    const state = createEditorState({
      documentId: 'doc-1',
      geometry: Array.from({ length: 5 }, () => page),
      signers: [],
    });

    render(
      <PageStage
        file={new Blob()}
        state={state}
        zoom={{ mode: 'fit-width' }}
        dispatch={vi.fn()}
        onPageChange={vi.fn()}
        onViewError={vi.fn()}
      />,
    );

    for (let number = 1; number <= 5; number += 1) {
      expect(await screen.findByTestId(`pdf-page-${number}`)).toBeTruthy();
    }
  });
});
