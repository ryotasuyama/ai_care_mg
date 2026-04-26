'use client';

import { useRef, useState } from 'react';

type RecognitionState = 'idle' | 'recording' | 'unsupported' | 'error';

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface Props {
  value: string;
  onChange: (text: string) => void;
}

export function VoiceInput({ value, onChange }: Props) {
  const [state, setState] = useState<RecognitionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef<string>('');

  const start = () => {
    if (state === 'recording') return;
    setErrorMessage(null);

    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setState('unsupported');
      return;
    }

    const recognition = new Ctor();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = value;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      const combined = [baseTextRef.current, finalText, interimText].filter(Boolean).join('');
      onChange(combined);
      if (finalText) {
        baseTextRef.current = baseTextRef.current + finalText;
      }
    };

    recognition.onerror = (e) => {
      setState('error');
      setErrorMessage(`音声認識エラー: ${e.error}`);
    };

    recognition.onend = () => {
      setState((prev) => (prev === 'recording' ? 'idle' : prev));
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState('recording');
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState('idle');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {state !== 'unsupported' && state !== 'recording' && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <span aria-hidden="true">●</span> 録音開始
          </button>
        )}
        {state === 'recording' && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
          >
            <span aria-hidden="true">■</span> 停止
          </button>
        )}
        {state === 'recording' && (
          <span className="text-sm text-red-600 animate-pulse">録音中...</span>
        )}
        {state === 'unsupported' && (
          <span className="text-sm text-gray-500">
            このブラウザは音声入力に対応していません。テキスト欄に直接入力してください。
          </span>
        )}
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <textarea
        data-testid="voice-transcript"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        placeholder="音声入力した文字列、もしくは直接入力してください"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
      />
      <p className="text-xs text-gray-500">
        マイク認識精度が不足する場合は、テキスト欄を直接編集してください。
      </p>
    </div>
  );
}
