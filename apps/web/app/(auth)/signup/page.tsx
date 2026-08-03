import { sanitizeRedirect } from "@/lib/api"
import { SignUpForm } from "./signup-form"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>
}) {
  const query = await searchParams
  const redirectParam = Array.isArray(query.redirect) ? query.redirect[0] : query.redirect

  return <SignUpForm redirectTo={sanitizeRedirect(redirectParam)} />
}
