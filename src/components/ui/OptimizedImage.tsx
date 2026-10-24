"use client";

import { useState, type Ref } from "react";
import Image, { type ImageProps } from "next/image";
import { cfImageUrl, imgFailed } from "@/lib/utils";

// A drop-in replacement for next/image: serves the photo through /cdn-cgi/image (see cfImageUrl),
// and if the transform failed — falls back to the original R2 URL, which is already compressed
// at upload time (uploadImagePair). Two causes of an error, both handled the same way:
// the free Cloudflare quota is exhausted (9422), and localhost, where /cdn-cgi doesn't exist at all.
// failed is NOT reset when src changes — and that is deliberate: the quota is exhausted for the whole month,
// so after the first error there is no point paying with a 404 request for every following photo.
// ponytail: width/quality are constants in cfImageUrl, we don't generate a srcset: every extra
// width is a separate paid transform for EVERY photo. cfWidth picks one of the FIXED tiers
// (CF_IMAGE_WIDTH_CARD for a catalogue card, the default full width elsewhere) — do not pass
// an arbitrary number here, every new value is one more transform per photo out of the monthly quota.
// ImageProps has no ref (next strips it), and two callers measure naturalWidth on the node — so we put it back.
export default function OptimizedImage({
  src,
  onError,
  ref,
  cfWidth,
  ...rest
}: ImageProps & { ref?: Ref<HTMLImageElement>; cfWidth?: number }) {
  const [failed, setFailed] = useState(false);
  const original = typeof src === "string" ? src : null;

  return (
    <Image
      {...rest}
      src={original && !failed ? cfImageUrl(original, cfWidth) : src}
      // Two independent error checks: onError (after hydration) and the img state on mount
      // (if the 404 arrived earlier — onError won't fire any more, see imgFailed).
      ref={(node) => {
        if (imgFailed(node)) setFailed(true);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}
