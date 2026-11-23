'use client';

import { useState } from 'react';

import { supportApi, type FeedbackType } from '@mealawe/api';
import { useAuthStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

const TYPES: { key: FeedbackType; label: string }[] = [{ key: 'suggestion', label: 'Suggestion' }, { key: 'praise', label: 'Praise' }, { key: 'complaint', label: 'Complaint' }];
const MAX = 500;

export default function FeedbackPage() {
  const authed = useRequireLogin();
  const profile = useAuthStore((s) => s.profile);
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  if (!authed) return null;

  const submit = async () => {
    const text = comment.trim();
    if (!text || !profile?._id) return setError('Please write your feedback first.');
    setSaving(true);
    setError(null);
    try {
      await supportApi.submitFeedback({ feedbackType: type, feedbackComment: text, feedbackFrom_id: profile._id, feedbackFrom_name: profile.userName, feedbackFrom_phoneNo: profile.phoneNo, feedbackFrom_userType: 'customer' });
      setComment('');
      setType('suggestion');
      setThanks(true);
    } catch {
      setError('Could not send your feedback. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Feedback" />
      <Page narrow>
        <div className="space-y-5">
          <fieldset><legend className="mb-2 font-bold">What kind of feedback?</legend>
            <div className="flex gap-2">{TYPES.map((t) => <button key={t.key} type="button" aria-pressed={type === t.key} onClick={() => setType(t.key)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold', type === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{t.label}</button>)}</div>
          </fieldset>
          <div>
            <label htmlFor="fb" className="mb-1 block font-bold">Tell us more</label>
            <textarea id="fb" value={comment} maxLength={MAX} rows={6} onChange={(e) => setComment(e.target.value)} className="w-full rounded-card border border-border bg-card p-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
            <p className="text-right text-xs text-muted-foreground">{comment.length}/{MAX}</p>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button block size="lg" disabled={saving} onClick={submit}>{saving ? 'Sending…' : 'Submit feedback'}</Button>
        </div>
        <Dialog open={thanks} onOpenChange={setThanks} title="Thank you!" description="We read every message and use it to improve Mealawe."><Button block onClick={() => setThanks(false)}>Done</Button></Dialog>
      </Page>
    </>
  );
}
