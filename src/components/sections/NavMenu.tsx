import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeatureLink {
  label: string;
  description: string;
}

const FEATURES: FeatureLink[] = [
  { label: "Backtest", description: "Tick-accurate replay across any pair." },
  { label: "Journal", description: "Log entries and notes as you trade." },
  { label: "Mentor AI", description: "Refine decisions, sharpen execution." },
];

interface NavMenuProps {
  variantId: string;
}

/**
 * The only interactive part of the nav — everything else (logo, layout) stays
 * static Astro markup in NavBar.astro. Handles the desktop "Features"
 * dropdown and the mobile menu toggle in one island so the two states (which
 * both affect the same header row) don't fight over layout from separate
 * hydration roots.
 */
export default function NavMenu({ variantId }: NavMenuProps) {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setFeaturesOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFeaturesOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("click", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  // Menu opens are diagnostic, not funnel events — capture directly instead
  // of adding a new named event to the taxonomy for something that isn't a
  // conversion step.
  function trackMenuOpened(location: "features_dropdown" | "mobile_menu") {
    window.__ph?.capture("nav_menu_opened", { location, variant_id: variantId });
  }

  return (
    <div ref={rootRef} className="flex items-center gap-2">
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            aria-expanded={featuresOpen}
            aria-haspopup="true"
            onClick={() => {
              setFeaturesOpen((open) => {
                if (!open) trackMenuOpened("features_dropdown");
                return !open;
              });
            }}
          >
            Features
            <ChevronDown className={cn("size-4 transition-transform", featuresOpen && "rotate-180")} />
          </button>

          {featuresOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-2 w-64 rounded-lg border border-border-primary bg-card-bg-primary p-2 shadow-xl"
            >
              {FEATURES.map((feature) => (
                <div key={feature.label} role="menuitem" className="rounded-md px-3 py-2 hover:bg-card-bg-primary-hover">
                  <p className="text-sm font-medium text-card-text-primary">{feature.label}</p>
                  <p className="text-xs text-card-text-secondary">{feature.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      <a
        href="#signup"
        data-cta-location="navbar"
        data-cta-text="Get Started"
        data-cta-variant={variantId}
        className={cn(
          buttonVariants({ size: "sm" }),
          "hidden bg-btn-bg-primary-active text-btn-text hover:bg-btn-bg-primary-hover sm:inline-flex",
        )}
      >
        Get Started
      </a>

      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md p-2 text-text-primary sm:hidden"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        onClick={() => {
          setMobileOpen((open) => {
            if (!open) trackMenuOpened("mobile_menu");
            return !open;
          });
        }}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-50 border-t border-border-primary bg-bg-elevated p-4 sm:hidden">
          <p className="px-2 py-1 text-xs font-semibold tracking-wide text-text-secondary uppercase">Features</p>
          {FEATURES.map((feature) => (
            <div key={feature.label} className="rounded-md px-2 py-2">
              <p className="text-sm text-text-primary">{feature.label}</p>
            </div>
          ))}
          <a
            href="#signup"
            data-cta-location="navbar_mobile"
            data-cta-text="Get Started"
            data-cta-variant={variantId}
            onClick={() => setMobileOpen(false)}
            className={cn(
              buttonVariants({ size: "sm" }),
              "mt-4 w-full bg-btn-bg-primary-active text-btn-text hover:bg-btn-bg-primary-hover",
            )}
          >
            Get Started
          </a>
        </div>
      )}
    </div>
  );
}
