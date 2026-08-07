"use client";

import { useRouter } from "next/navigation";
import { ArbitrationExperience } from "./experience";

export default function Page() {
  const router = useRouter();
  return <ArbitrationExperience onLandingEnter={() => router.push("/courtroom")} />;
}
