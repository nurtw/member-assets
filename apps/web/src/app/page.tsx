import { redirect } from "next/navigation";

/**
 * The root sends officers to their work.
 *
 * There is no public landing page, and there should not be: the System is not a
 * public directory (PRD §2.2), and a marketing page at the root would invite the
 * assumption that membership can be looked up here.
 *
 * The redirect is unconditional because the session cookie belongs to the API's
 * origin and cannot be read here. `/applications` sits behind the authenticated
 * shell, which sends anyone without a session to sign in.
 */
export default function Home() {
  redirect("/applications");
}
