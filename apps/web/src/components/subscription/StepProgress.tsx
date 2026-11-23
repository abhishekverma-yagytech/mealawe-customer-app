import { cn } from '@/lib/cn';

const STEPS = ['Choose plan', 'Customize', 'Review'];

export function StepProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className="flex flex-1 flex-col gap-1">
          <span className={cn('h-1.5 rounded-full', i + 1 <= step ? 'bg-primary' : 'bg-muted')} />
          <span className={cn('text-xs font-bold', i + 1 === step ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
