'use client';

import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { useState } from 'react';

import { REFERRAL_FAQS, REFERRAL_MIN_ORDER, REFERRAL_REWARD } from '@mealawe/core';
import { useReferralCode } from '@mealawe/hooks';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRequireLogin } from '@/lib/useRequireLogin';

const ONE_LINK = 'http://onelink.to/536q9d';

export default function ReferEarnPage() {
  const authed = useRequireLogin();
  const { code, generating } = useReferralCode();
  const [copied, setCopied] = useState(false);
  if (!authed) return null;

  const message = code ? `Hey! Check out this awesome app that delivers home cooked food at your doorstep! Use my code ${code} — we both get ₹${REFERRAL_REWARD} cashback when you place your first order over ₹${REFERRAL_MIN_ORDER}. ${ONE_LINK}` : '';
  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Mealawe (Enjoy Home Made Food)', text: message });
      else await navigator.clipboard.writeText(message);
    } catch { /* dismissed */ }
  };

  return (
    <>
      <PageHeader title="Refer & Earn" />
      <Page narrow>
        <div className="space-y-4">
          <div className="space-y-2 rounded-3xl bg-[#042a33] p-5 text-white">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/15"><Gift className="size-6" /></span>
            <h2 className="text-2xl font-black">Invite friends, earn ₹{REFERRAL_REWARD}</h2>
            <p className="text-white/80">When a friend places their first order of ₹{REFERRAL_MIN_ORDER} or more, you both get ₹{REFERRAL_REWARD} cashback. Unlimited invites, no cash exchange.</p>
          </div>
          <Card className="space-y-3">
            <p className="font-bold">Your referral code</p>
            {generating || !code ? <Skeleton className="h-12" /> : (
              <button onClick={copy} aria-label={`Copy referral code ${code}`} className="flex w-full items-center justify-between rounded-card bg-muted px-4 py-3.5 text-left"><span className="text-xl font-black tracking-widest">{code}</span>{copied ? <Check className="size-5 text-primary" /> : <Copy className="size-5" />}</button>
            )}
            <Button block disabled={!code} onClick={share}><Share2 className="size-5" />Share with friends</Button>
          </Card>
          <section aria-labelledby="faq-h">
            <h2 id="faq-h" className="mb-2 text-lg font-black">FAQs</h2>
            <div className="divide-y divide-border rounded-card border border-border bg-card">
              {REFERRAL_FAQS.map((f) => (
                <details key={f.question} className="group p-4"><summary className="cursor-pointer list-none font-bold">{f.question}</summary><p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{f.answer}</p></details>
              ))}
            </div>
          </section>
        </div>
      </Page>
    </>
  );
}
