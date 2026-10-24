"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

export interface DeliverySelection {
  cityRef: string;
  cityName: string;
  warehouseRef: string;
  warehouseName: string;
}

interface NpCity { ref: string; name: string; area: string }
interface NpWarehouse { ref: string; name: string; number: string }

interface Props {
  value: DeliverySelection | null;
  onChange: (value: DeliverySelection | null) => void;
}

export default function NovaPoshtaDelivery({ value, onChange }: Props) {
  // City
  const [cityQuery, setCityQuery] = useState(value?.cityName ?? "");
  const [cities, setCities] = useState<NpCity[]>([]);
  const [showCityList, setShowCityList] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Warehouse
  const [warehouses, setWarehouses] = useState<NpWarehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowCityList(false);
        setShowInfo(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Debounced city search
  useEffect(() => {
    const q = cityQuery.trim();
    // If the input matches the already selected city — we don't search again
    if (!q || q.length < 2 || q === value?.cityName) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/novaposhta/cities?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as NpCity[] | { error: string };
        setCities(Array.isArray(data) ? data : []);
      } catch {
        setCities([]);
      } finally {
        setLoadingCities(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [cityQuery, value?.cityName]);

  // Loading the warehouses when the selected city changes
  useEffect(() => {
    const cityRef = value?.cityRef;
    if (!cityRef) {
      setWarehouses([]);
      return;
    }
    let cancelled = false;
    setLoadingWarehouses(true);
    (async () => {
      try {
        const res = await fetch(`/api/novaposhta/warehouses?cityRef=${encodeURIComponent(cityRef)}`);
        const data = (await res.json()) as NpWarehouse[] | { error: string };
        if (!cancelled) setWarehouses(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setWarehouses([]);
      } finally {
        if (!cancelled) setLoadingWarehouses(false);
      }
    })();
    return () => { cancelled = true; };
  }, [value?.cityRef]);

  const handleSelectCity = (city: NpCity) => {
    setCityQuery(city.name);
    setShowCityList(false);
    setCities([]);
    // Reset the selected warehouse when the city changes
    onChange({ cityRef: city.ref, cityName: city.name, warehouseRef: "", warehouseName: "" });
  };

  const handleSelectWarehouse = (warehouseRef: string) => {
    if (!value) return;
    const wh = warehouses.find((w) => w.ref === warehouseRef);
    onChange({ ...value, warehouseRef, warehouseName: wh?.name ?? "" });
  };

  const handleCityInput = (text: string) => {
    setCityQuery(text);
    setShowCityList(true);
    // If the user started changing the city — we reset the previous selection
    if (value) onChange(null);
  };

  return (
    <div className="w-full space-y-4 text-left" ref={wrapperRef}>
      <p className="text-sm font-medium flex items-center gap-1.5">
        Доставка «Нова Пошта»
        <span className="relative inline-flex group">
          <button
            type="button"
            aria-label="Інформація про доставку"
            onClick={() => setShowInfo((v) => !v)}
            className="text-opora-brown/50 hover:text-opora-brown transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <span
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-md bg-opora-brown px-3 py-2 text-xs font-normal text-white transition-opacity z-20 group-hover:opacity-100 group-focus-within:opacity-100 ${showInfo ? "opacity-100" : "opacity-0"}`}
          >
            Доставка «Новою Поштою» діє лише на вантажні відділення
          </span>
        </span>
      </p>

      {/* City */}
      <div className="relative">
        <input
          type="text"
          placeholder="Місто (напр. Київ)"
          value={cityQuery}
          onChange={(e) => handleCityInput(e.target.value)}
          onFocus={() => setShowCityList(true)}
          autoComplete="off"
          className="w-full border border-opora-brown p-4 text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-opora-brown placeholder:text-opora-brown/50"
        />
        {showCityList && (cities.length > 0 || loadingCities) && (
          <ul className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-opora-white border border-opora-brown/30 shadow-lg">
            {loadingCities && (
              <li className="px-4 py-3 text-sm text-opora-brown/60">Пошук…</li>
            )}
            {cities.map((city) => (
              <li key={city.ref}>
                <button
                  type="button"
                  onClick={() => handleSelectCity(city)}
                  className="w-full text-left px-4 py-3 hover:bg-opora-softBeige transition-colors"
                >
                  <span className="block">{city.name}</span>
                  <span className="block text-xs text-opora-brown/50">{city.area} обл.</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Warehouse */}
      <select
        value={value?.warehouseRef ?? ""}
        onChange={(e) => handleSelectWarehouse(e.target.value)}
        disabled={!value?.cityRef || loadingWarehouses}
        className="w-full border border-opora-brown p-4 text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-opora-brown disabled:opacity-50"
      >
        <option value="">
          {!value?.cityRef
            ? "Спершу оберіть місто"
            : loadingWarehouses
              ? "Завантаження відділень…"
              : "Оберіть відділення"}
        </option>
        {warehouses.map((w) => (
          <option key={w.ref} value={w.ref}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
