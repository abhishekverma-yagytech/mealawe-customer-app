'use client';

import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useSupportChat } from '@mealawe/hooks';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

const STATUS = { connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…', disconnected: 'Disconnected' } as const;

export default function SupportChatPage() {
  const authed = useRequireLogin();
  const { session, messages, status, adminTyping, myUserId, sendMessage, setTyping } = useSupportChat();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length, adminTyping]);
  if (!authed) return null;

  const ended = session?.status === 'closed';
  const send = () => {
    if (!text.trim() || ended) return;
    sendMessage(text);
    setText('');
    setTyping(false);
  };
  const onChange = (v: string) => {
    setText(v);
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1500);
  };

  return (
    <>
      <PageHeader title="Live chat" />
      <Page narrow>
        <div className="flex h-[calc(100dvh-9rem)] flex-col">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full', ended ? 'bg-muted-foreground' : status === 'connected' ? 'bg-primary' : 'bg-rating')} />{ended ? 'Chat ended' : STATUS[status]}</p>
          <div role="log" aria-live="polite" className="flex-1 space-y-2 overflow-y-auto rounded-card border border-border bg-card p-3">
            {messages.length === 0 ? <div className="py-16 text-center"><p className="text-lg font-black">Hi, how can we help?</p><p className="text-sm text-muted-foreground">Send a message and a support agent will be with you shortly.</p></div> : null}
            {messages.map((m) => {
              const mine = m.senderId === myUserId;
              return <div key={m._id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}><p className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{m.text}</p></div>;
            })}
            {adminTyping ? <p className="text-sm text-muted-foreground">Typing…</p> : null}
            <div ref={endRef} />
          </div>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => onChange(e.target.value)} disabled={ended} aria-label="Message" placeholder={ended ? 'This chat has ended' : 'Type a message'} className="min-h-11 flex-1 rounded-card border border-border bg-card px-3 outline-none focus:border-primary" />
            <button type="submit" aria-label="Send" disabled={ended || !text.trim()} className="flex size-11 items-center justify-center rounded-card bg-primary text-primary-foreground disabled:opacity-50"><Send className="size-5" /></button>
          </form>
        </div>
      </Page>
    </>
  );
}
