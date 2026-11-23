import { ExternalLink } from 'lucide-react';

import { Page, PageHeader } from '@/components/layout/PageHeader';

export const metadata = { title: 'Marketplace' };

/** The mobile app embeds navmool.com in a WebView; sites commonly block iframes, so web links out. */
export default function Marketplace() {
  return (
    <>
      <PageHeader title="Marketplace" />
      <Page narrow>
        <div className="rounded-3xl border border-border bg-card p-6 text-center">
          <h2 className="text-xl font-black">Shop on Navmool</h2>
          <p className="mt-2 text-muted-foreground">Our marketplace for groceries and more opens in a new tab.</p>
          <a href="https://navmool.com/" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-card bg-primary px-5 py-3 font-bold text-primary-foreground">
            Open Navmool <ExternalLink className="size-4" />
          </a>
        </div>
      </Page>
    </>
  );
}
