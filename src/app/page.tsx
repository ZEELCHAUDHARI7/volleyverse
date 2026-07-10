import { redirect } from "next/navigation";

// Public Showcase lands here in v1.1 — for the pilot build, the Console is the product.
export default function Home() {
  redirect("/console");
}
