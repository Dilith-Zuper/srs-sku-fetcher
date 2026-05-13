interface HeaderProps {
  step: number;
  totalSteps: number;
}

export default function Header({ step, totalSteps }: HeaderProps) {
  const stepLabels = ['Upload', 'Processing', 'Results'];
  const currentLabel = stepLabels[step - 1] ?? '';

  return (
    <header className="bg-white border-b border-[#E5E2DC] h-16 flex items-center px-6 shrink-0">
      <div className="w-full max-w-[960px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/zuper-logo.svg" className="h-7 w-auto" alt="Zuper" />
          <span className="text-[#E5E2DC]">|</span>
          <span className="text-sm font-medium text-gray-500">SRS SKU Fetcher</span>
          <span className="text-[#E5E2DC]">·</span>
          <span className="text-sm text-gray-400">{currentLabel}</span>
        </div>
        <span className="bg-orange-50 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-full">
          Step {step} of {totalSteps}
        </span>
      </div>
    </header>
  );
}
