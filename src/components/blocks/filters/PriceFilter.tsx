"use client";

// type="text" + inputMode="numeric": with type="number" the browser returns "" for "1e5"/"-" and
// there is nothing left to sanitize. The spinner arrows were pointless anyway (a step of 1 UAH makes no sense).
const PRICE_INPUT_CLASS =
  "w-full min-w-0 border-b border-opora-brown/30 bg-transparent py-1 text-lg font-light focus:border-opora-brown focus:outline-none";

const THUMB_CLASS =
  "absolute inset-0 w-full appearance-none bg-transparent pointer-events-none " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-opora-brown [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-opora-brown [&::-moz-range-thumb]:cursor-pointer " +
  "[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent";

export interface PriceFilterProps {
  priceBounds: { min: number; max: number } | null;
  priceMin: string;
  priceMax: string;
  setPriceMin: (v: string) => void;
  setPriceMax: (v: string) => void;
  commitPrices: () => void;
  // A click on the track affects only the parent state (it needs priceMin/applied/buildAndApply) —
  // so the child only computes the click position, and the decision what to do with it stays with the parent.
  onTrackPick: (rounded: string) => void;
}

export function PriceFilter({ priceBounds, priceMin, priceMax, setPriceMin, setPriceMax, commitPrices, onTrackPick }: PriceFilterProps) {
  const priceLo = priceBounds?.min ?? 0;
  const priceHi = priceBounds?.max ?? Number.MAX_SAFE_INTEGER;

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          placeholder={priceBounds ? String(priceBounds.min) : "від"}
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))}
          onBlur={commitPrices}
          className={PRICE_INPUT_CLASS}
        />
        <span className="text-opora-brown/50">—</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder={priceBounds ? String(priceBounds.max) : "до"}
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))}
          onBlur={commitPrices}
          className={PRICE_INPUT_CLASS}
        />
      </div>
      {priceBounds && (() => {
        const minVal = priceMin ? Number(priceMin) : priceLo;
        const maxVal = priceMax ? Number(priceMax) : priceHi;
        const span = Math.max(1, priceHi - priceLo);
        const pctMin = ((minVal - priceLo) / span) * 100;
        const pctMax = ((maxVal - priceLo) / span) * 100;

        const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return;
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          const clickedValue = priceLo + (priceHi - priceLo) * percent;
          onTrackPick(String(Math.round(clickedValue)));
        };

        return (
          <div className="relative h-4 mt-2 cursor-pointer" onClick={handleTrackClick}>
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-opora-brown/20" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-opora-brown"
              style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
            />
            <input
              type="range"
              min={priceLo}
              max={priceHi}
              value={minVal}
              onChange={(e) => setPriceMin(String(Math.min(Number(e.target.value), maxVal)))}
              onMouseUp={commitPrices}
              onTouchEnd={commitPrices}
              onBlur={commitPrices}
              className={THUMB_CLASS}
            />
            <input
              type="range"
              min={priceLo}
              max={priceHi}
              value={maxVal}
              onChange={(e) => setPriceMax(String(Math.max(Number(e.target.value), minVal)))}
              onMouseUp={commitPrices}
              onTouchEnd={commitPrices}
              onBlur={commitPrices}
              className={THUMB_CLASS}
            />
          </div>
        );
      })()}
    </>
  );
}
