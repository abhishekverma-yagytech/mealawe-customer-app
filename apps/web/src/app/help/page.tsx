'use client';

import { Mail, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { supportApi, type Faq, type SupportContacts } from '@mealawe/api';
import { useAuthStore } from '@mealawe/state';

import { BottomNav } from '@/components/layout/BottomNav';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/cn';

export default function HelpPage() {
  const profile = useAuthStore((s) => s.profile);
  const [contacts, setContacts] = useState<SupportContacts>({});
  const [faqs, setFaqs] = useState<Faq[]>([]);
  useEffect(() => {
    supportApi.getSupportContacts().then(setContacts).catch(() => undefined);
    supportApi.getFaqs().then(setFaqs).catch(() => undefined);
  }, []);

  const digits = (contacts.phone ?? '').replace(/[^\d]/g, '');
  const subject = encodeURIComponent(`${profile?.userName ?? ''} - ${profile?.phoneNo ?? ''}`);
  const tile = 'flex flex-1 flex-col items-center gap-2 rounded-card border border-border bg-card p-4 text-sm font-bold';
  const off = 'pointer-events-none opacity-40';

  return (
    <>
      <PageHeader title="Help & support" />
      <Page narrow>
        <div className="space-y-5">
          <p className="text-muted-foreground">We&apos;re here to help. Reach us any way you like.</p>
          <div className="flex gap-3">
            <Link href="/support-chat" className={tile}><MessageCircle className="size-6 text-primary" />Chat</Link>
            <a href={digits ? `tel:${digits}` : undefined} aria-disabled={!digits} className={cn(tile, !digits && off)}><Phone className="size-6 text-info" />Call</a>
            <a href={contacts.email ? `mailto:${contacts.email}?subject=${subject}` : undefined} aria-disabled={!contacts.email} className={cn(tile, !contacts.email && off)}><Mail className="size-6 text-location" />Email</a>
          </div>
          {faqs.length > 0 ? (
            <section aria-labelledby="faq-h">
              <h2 id="faq-h" className="mb-2 text-lg font-black">Frequently asked</h2>
              <div className="divide-y divide-border rounded-card border border-border bg-card">
                {faqs.map((f) => <details key={f.question} className="p-4"><summary className="cursor-pointer list-none font-bold">{f.question}</summary><p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{f.answer}</p></details>)}
              </div>
            </section>
          ) : null}
          <Link href="/feedback" className="block text-center font-bold text-primary">Send feedback</Link>
        </div>
      </Page>
      <BottomNav />
    </>
  );
}
