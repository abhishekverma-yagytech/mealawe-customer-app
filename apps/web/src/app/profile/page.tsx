'use client';

import { ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { resolveProfileImage } from '@mealawe/api';
import { formatINR } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore, useVegModeStore } from '@mealawe/state';

import { BottomNav } from '@/components/layout/BottomNav';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Img } from '@/lib/img';
import { signOut } from '@/lib/session';
import { Switch } from '@/components/ui/Switch';
import { ThemeSegmented } from '@/components/ThemeToggle';

const MENU = [
  { href: '/addresses', label: 'Saved addresses' },
  { href: '/orders', label: 'My orders' },
  { href: '/wallet', label: 'Wallet & cashback' },
  { href: '/refer-earn', label: 'Refer & earn' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/help', label: 'Help & support' },
];

export default function ProfilePage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const vegOnly = useVegModeStore((s) => s.vegOnly);
  const toggleVeg = useVegModeStore((s) => s.toggle);
  const { wallet, cashback } = useBalances();
  const [confirm, setConfirm] = useState(false);
  const doSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <>
      <PageHeader title="Profile" />
      <Page narrow>
        <div className="space-y-4">
          {isAuthenticated && profile ? (
            <Card className="flex items-center gap-4">
              <div className="size-16 shrink-0 overflow-hidden rounded-full bg-primary text-2xl font-black text-white">
                {profile.imageUrl ? <Img src={resolveProfileImage(profile.imageUrl)} alt="" className="size-16" /> : <span className="flex size-16 items-center justify-center">{profile.userName?.[0]?.toUpperCase() ?? '?'}</span>}
              </div>
              <div className="min-w-0 flex-1"><p className="truncate text-lg font-black">{profile.userName || 'Mealawe customer'}</p><p className="truncate text-sm text-muted-foreground">{profile.phoneNo ? `+91 ${profile.phoneNo}` : ''}</p><p className="truncate text-sm text-muted-foreground">{profile.email}</p></div>
              <Link href="/profile-edit" className="text-sm font-bold text-primary">Edit</Link>
            </Card>
          ) : (
            <Card className="text-center"><p className="font-bold">You&apos;re browsing as a guest</p><Button asChild className="mt-3"><Link href="/login">Log in or sign up</Link></Button></Card>
          )}

          {isAuthenticated ? (
            <Card className="grid grid-cols-2 divide-x divide-border text-center">
              <div><p className="text-xs text-muted-foreground">Wallet</p><p className="text-lg font-black">{formatINR(Number.parseFloat(wallet) || 0)}</p></div>
              <div><p className="text-xs text-muted-foreground">Cashback</p><p className="text-lg font-black">{formatINR(cashback)}</p></div>
            </Card>
          ) : null}

          <Card className="divide-y divide-border p-0">
            {MENU.map((m) => (
              <Link key={m.href} href={m.href} className="flex items-center justify-between px-4 py-3.5 font-bold hover:bg-muted"><span>{m.label}</span><ChevronRight className="size-5 text-muted-foreground" /></Link>
            ))}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between"><span className="font-bold">Veg only</span><Switch label="Veg only" checked={vegOnly} onCheckedChange={() => toggleVeg()} /></div>
            <div>
              <p className="mb-2 font-bold">Appearance</p>
              <ThemeSegmented />
            </div>
          </Card>

          {isAuthenticated ? <Button variant="outline" block onClick={() => setConfirm(true)}><LogOut className="size-5" />Sign out</Button> : null}
        </div>
        <Dialog open={confirm} onOpenChange={setConfirm} title="Sign out?" description="You'll need to log in again to place orders.">
          <div className="flex gap-2"><Button variant="outline" block onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" block onClick={doSignOut}>Sign out</Button></div>
        </Dialog>
      </Page>
      <BottomNav />
    </>
  );
}
