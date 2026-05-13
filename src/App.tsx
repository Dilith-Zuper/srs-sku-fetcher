import { useState } from 'react';
import type { ZuperProduct, MatchResult } from './types';
import Header from './components/Header';
import UploadStep from './components/UploadStep';
import ProcessingStep from './components/ProcessingStep';
import ResultsStep from './components/ResultsStep';

type Step = 'upload' | 'processing' | 'results';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [products, setProducts] = useState<ZuperProduct[]>([]);
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [error, setError] = useState('');

  const stepNum = step === 'upload' ? 1 : step === 'processing' ? 2 : 3;

  function handleReady(parsed: ZuperProduct[], file: File) {
    setProducts(parsed);
    setFileName(file.name);
    setStep('processing');
  }

  function handleDone(res: MatchResult[]) {
    setResults(res);
    setStep('results');
  }

  function handleError(msg: string) {
    setError(msg);
    setStep('upload');
  }

  function handleReset() {
    setStep('upload');
    setProducts([]);
    setFileName('');
    setResults([]);
    setError('');
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col">
      <Header step={stepNum} totalSteps={3} />
      <main className="flex-1 max-w-[960px] mx-auto w-full px-6 py-12">
        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {step === 'upload' && <UploadStep onReady={handleReady} />}
        {step === 'processing' && (
          <ProcessingStep products={products} onDone={handleDone} onError={handleError} />
        )}
        {step === 'results' && (
          <ResultsStep results={results} fileName={fileName} onReset={handleReset} />
        )}
      </main>
      <footer className="border-t border-[#E5E2DC] py-4">
        <p className="text-center text-xs text-gray-400">
          Customer Product Management Team · Zuper Internal Tools
        </p>
      </footer>
    </div>
  );
}
