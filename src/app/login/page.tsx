import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandPanel } from "./brand-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the VolleyVerse league operations console.",
};

/**
 * /login: the console's sign-in screen.
 *
 * Split screen: a branded, textured panel on the left from `lg` up, the
 * form on the right. Below `lg` the panel drops away and the form takes
 * the viewport with the backdrop textures carrying the page.
 *
 * The form is a client component; everything else here is static.
 */
export default function LoginPage() {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <main className="court-lines grain relative flex items-center justify-center overflow-hidden px-5 py-14 sm:px-10 lg:px-12">
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
          <div className="orb orb-accent left-[-30%] top-[-12%] h-[380px] w-[380px]" />
          <div className="orb orb-violet bottom-[-18%] right-[-25%] h-[340px] w-[340px]" />
        </div>
        <div className="relative flex w-full justify-center">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
