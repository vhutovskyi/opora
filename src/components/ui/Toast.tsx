// A universal popup message (a pill at the top) — like CartToast, but with text only
"use client";

interface ToastProps {
  toast: { message: string; subMessage?: string } | null;
  onClose: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-200 transition-all duration-300 px-4 ${
      toast ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
    }`}>
      <div className="flex items-center gap-3 bg-opora-brown text-white pl-6 pr-4 py-3 rounded-full shadow-lg text-sm font-medium max-w-[90vw]">
        <span className="truncate">
          {toast?.message}
          {toast?.subMessage && <span className="font-light opacity-80"> · {toast.subMessage}</span>}
        </span>
        <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity shrink-0" aria-label="Закрити">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M1 13L13 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
