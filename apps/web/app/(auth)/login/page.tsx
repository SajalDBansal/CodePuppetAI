import { sanitizeRedirect } from "@/lib/api"
import { SignInForm } from "./signin-form"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>
}) {
  const query = await searchParams
  const redirectParam = Array.isArray(query.redirect) ? query.redirect[0] : query.redirect

  return <SignInForm redirectTo={sanitizeRedirect(redirectParam)} />
}
