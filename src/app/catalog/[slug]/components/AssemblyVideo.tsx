// Assembly video (below the gallery in the left column)
"use client";

import { PlayIcon } from "@/components/ui/Icons";

interface AssemblyVideoProps {
  videoUrl: string;
  isPlaying: boolean;
  onPlay: () => void;
}

export default function AssemblyVideo({ videoUrl, isPlaying, onPlay }: AssemblyVideoProps) {
  if (!videoUrl) return null;

  return (
    <div className="mt-10 text-center">
      <h3 className="text-lg font-medium mb-4">Відео збірки</h3>
      <div className="relative w-full aspect-video bg-opora-softBeige rounded-xl overflow-hidden group">
        {isPlaying ? (
          <video
            src={videoUrl}
            controls
            autoPlay
            className="absolute inset-0 w-full h-full object-cover bg-black"
            controlsList="nodownload"
          />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label="Відтворити відео збірки"
            className="cursor-pointer w-full h-full relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-inset"
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors z-10" />
            <PlayIcon className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 text-white z-20 opacity-90 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}
