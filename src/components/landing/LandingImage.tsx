'use client';

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

interface LandingImageProps extends Omit<ImageProps, "onError"> {
  containerClassName?: string;
}

export function LandingImage({
  src,
  alt,
  className,
  containerClassName,
  priority,
  sizes,
  ...props
}: LandingImageProps) {
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-gradient-to-b from-[#0E1E45] to-[#08122B]",
        containerClassName
      )}
    >
      {!hasError ? (
        <Image
          src={src}
          alt={alt}
          sizes={sizes}
          priority={priority}
          onError={() => setHasError(true)}
          className={cn("object-cover", className)}
          {...props}
        />
      ) : (
        <div
          className="w-full h-full bg-gradient-to-b from-[#0E1E45] to-[#08122B]"
          aria-label={alt}
          role="img"
        />
      )}
    </div>
  );
}
