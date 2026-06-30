"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="label-caps flex items-center gap-2 rounded-lg border border-surface-variant bg-surface-container-low px-4 py-2 text-error transition-all duration-200 hover:border-error/40 hover:bg-error-container/20 hover:text-red-300 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error cursor-pointer"
    >
      <span>Logout</span>
    </button>
  );
}
